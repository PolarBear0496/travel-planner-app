import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { sampleItinerary } from "./data/sampleItinerary";
import { useUsageStatus } from "./hooks/useUsageStatus";
import {
  ApiRequestError,
  createCheckout,
  createTravelPlan,
  getCurrentUser,
  getSubscription,
  getTravelPlan,
  loginUser,
  logoutUser,
  registerUser,
  type Subscription,
  type User,
} from "./lib/api";
import { ItineraryPanel } from "./components/ItineraryPanel";
import { SearchBar } from "./components/SearchBar";
import type { Itinerary } from "./types/itinerary";

const EDITED_ITINERARY_STORAGE_KEY = "tripnote-edited-itinerary";

const MapView = lazy(() =>
  import("./components/MapView").then((module) => ({ default: module.MapView })),
);

function getFirstSpotId(itinerary: Itinerary): string | null {
  return itinerary.days[0]?.spots[0]?.id ?? null;
}

function getInitialPrompt() {
  return new URLSearchParams(window.location.search).get("prompt") ?? undefined;
}

function getRoutePlanId() {
  const match = window.location.pathname.match(/^\/plan\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function getInitialItinerary() {
  if (typeof window === "undefined") {
    return sampleItinerary;
  }

  const savedItinerary = window.localStorage.getItem(EDITED_ITINERARY_STORAGE_KEY);

  if (!savedItinerary) {
    return sampleItinerary;
  }

  try {
    return JSON.parse(savedItinerary) as Itinerary;
  } catch {
    window.localStorage.removeItem(EDITED_ITINERARY_STORAGE_KEY);
    return sampleItinerary;
  }
}

function reindexItinerary(itinerary: Itinerary): Itinerary {
  return {
    ...itinerary,
    days: itinerary.days.map((day) => ({
      ...day,
      spots: day.spots.map((spot, index) => ({ ...spot, order: index + 1 })),
    })),
  };
}

function hasSpot(itinerary: Itinerary, spotId: string | null) {
  return Boolean(spotId && itinerary.days.some((day) => day.spots.some((spot) => spot.id === spotId)));
}

function App() {
  const initialPrompt = useMemo(() => getInitialPrompt(), []);
  const initialItinerary = useMemo(() => getInitialItinerary(), []);
  const [itinerary, setItinerary] = useState<Itinerary>(initialItinerary);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(
    getFirstSpotId(initialItinerary),
  );
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasGeneratedPlan, setHasGeneratedPlan] = useState(false);
  const [showRouteMap, setShowRouteMap] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "dirty" | "saved">(
    initialItinerary === sampleItinerary ? "idle" : "saved",
  );
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [showAuthPanel, setShowAuthPanel] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authDisplayName, setAuthDisplayName] = useState("");
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isBillingLoading, setIsBillingLoading] = useState(false);
  const { usageStatus, recordGeneration, refreshUsage } = useUsageStatus();

  function applyItineraryChange(nextItinerary: Itinerary, nextSelectedSpotId = selectedSpotId) {
    const orderedItinerary = reindexItinerary(nextItinerary);
    setItinerary(orderedItinerary);
    setSelectedSpotId(
      hasSpot(orderedItinerary, nextSelectedSpotId)
        ? nextSelectedSpotId
        : getFirstSpotId(orderedItinerary),
    );
    setSaveStatus("dirty");
  }

  function handleMoveSpot(dayId: string, spotId: string, direction: "up" | "down") {
    const nextItinerary = {
      ...itinerary,
      days: itinerary.days.map((day) => {
        if (day.id !== dayId) {
          return day;
        }

        const currentIndex = day.spots.findIndex((spot) => spot.id === spotId);
        const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= day.spots.length) {
          return day;
        }

        const nextSpots = [...day.spots];
        [nextSpots[currentIndex], nextSpots[targetIndex]] = [
          nextSpots[targetIndex],
          nextSpots[currentIndex],
        ];

        return { ...day, spots: nextSpots };
      }),
    };

    applyItineraryChange(nextItinerary, spotId);
  }

  function handleDeleteSpot(dayId: string, spotId: string) {
    const nextItinerary = {
      ...itinerary,
      days: itinerary.days.map((day) =>
        day.id === dayId ? { ...day, spots: day.spots.filter((spot) => spot.id !== spotId) } : day,
      ),
    };

    applyItineraryChange(nextItinerary, spotId);
  }

  function handleUpdateSpotMemo(dayId: string, spotId: string, memo: string) {
    const nextItinerary = {
      ...itinerary,
      days: itinerary.days.map((day) =>
        day.id === dayId
          ? {
              ...day,
              spots: day.spots.map((spot) => (spot.id === spotId ? { ...spot, memo } : spot)),
            }
          : day,
      ),
    };

    applyItineraryChange(nextItinerary, spotId);
  }

  function handleSaveItinerary() {
    window.localStorage.setItem(EDITED_ITINERARY_STORAGE_KEY, JSON.stringify(reindexItinerary(itinerary)));
    setSaveStatus("saved");
  }

  useEffect(() => {
    let isMounted = true;

    async function loadAccount() {
      try {
        const user = await getCurrentUser();

        if (!isMounted) {
          return;
        }

        setCurrentUser(user);
        setSubscription(await getSubscription());
        await refreshUsage();
      } catch {
        if (isMounted) {
          setCurrentUser(null);
        }
      }
    }

    void loadAccount();

    return () => {
      isMounted = false;
    };
  }, [refreshUsage]);

  useEffect(() => {
    const planId = getRoutePlanId();

    if (!planId) {
      return;
    }

    const sharedPlanId = planId;
    let isMounted = true;

    async function loadSharedPlan() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const result = await getTravelPlan(sharedPlanId);

        if (!isMounted) {
          return;
        }

        setItinerary(result.itinerary);
        setSelectedSpotId(getFirstSpotId(result.itinerary));
        setShareUrl(`${window.location.origin}/plan/${result.planId ?? planId}`);
        setHasGeneratedPlan(true);
        setShowRouteMap(true);
        setSaveStatus("idle");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? `${error.message}。サンプルプランを表示しています。`
            : "共有プランの読み込みに失敗しました。サンプルプランを表示しています。",
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadSharedPlan();

    return () => {
      isMounted = false;
    };
  }, []);

  async function refreshAccount() {
    const [user, nextSubscription] = await Promise.all([getCurrentUser(), getSubscription()]);
    setCurrentUser(user);
    setSubscription(nextSubscription);
    await refreshUsage();
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsAuthLoading(true);
    setErrorMessage(null);

    try {
      const user =
        authMode === "register"
          ? await registerUser(authEmail, authPassword, authDisplayName)
          : await loginUser(authEmail, authPassword);
      setCurrentUser(user);
      setSubscription(await getSubscription());
      await refreshUsage();
      setShowAuthPanel(false);
      setAuthPassword("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "ログインまたは登録に失敗しました。",
      );
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function handleLogout() {
    setIsAuthLoading(true);
    setErrorMessage(null);

    try {
      await logoutUser();
      setCurrentUser(null);
      setSubscription(await getSubscription());
      await refreshUsage();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "ログアウトに失敗しました。");
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function handleCheckout(plan: "plus" | "pro") {
    if (!currentUser) {
      setShowAuthPanel(true);
      setErrorMessage("有料プランを開始するにはログインしてください。");
      return;
    }

    setIsBillingLoading(true);
    setBillingMessage(null);
    setErrorMessage(null);

    try {
      const checkout = await createCheckout("paypay", plan);
      setBillingMessage(
        `${checkout.provider.toUpperCase()} sandbox checkout を作成しました: ${checkout.checkout_id}`,
      );
      await refreshAccount();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "決済の開始に失敗しました。");
    } finally {
      setIsBillingLoading(false);
    }
  }

  async function handleSearch(query: string) {
    if (usageStatus.isLimited) {
      setErrorMessage("無料生成回数を使い切りました。ログインまたは有料プランをご利用ください。");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await createTravelPlan(query);
      const nextItinerary = result.itinerary;
      setItinerary(nextItinerary);
      setSelectedSpotId(getFirstSpotId(nextItinerary));
      setShareUrl(
        result.planId
          ? `${window.location.origin}/plan/${result.planId}`
          : result.shareUrl ?? null,
      );
      setHasGeneratedPlan(true);
      setShowRouteMap(true);
      setSaveStatus("dirty");
      if (currentUser) {
        await refreshUsage();
      } else {
        recordGeneration();
      }
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "usage_limit_exceeded") {
        setErrorMessage(`${error.message}。ログインまたは有料プランをご利用ください。`);
        return;
      }

      setErrorMessage(
        error instanceof Error
          ? `${error.message}。サンプルプランを表示しています。`
          : "旅行プランの作成中に予期しないエラーが発生しました。サンプルプランを表示しています。",
      );
      setItinerary(sampleItinerary);
      setSelectedSpotId(getFirstSpotId(sampleItinerary));
      setShareUrl(null);
      setHasGeneratedPlan(false);
      setShowRouteMap(false);
      setSaveStatus("idle");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-6">
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-2 border-blue-600 bg-white text-xl text-blue-600">
              ✈
            </div>
            <div className="min-w-0">
              <p className="text-xl font-extrabold text-blue-600">TripNote</p>
              <p className="text-xs font-medium text-slate-500">旅行希望から旅程を作成</p>
            </div>
          </div>
          <nav className="flex shrink-0 items-center gap-2 text-xs font-bold text-slate-600">
            {currentUser ? (
              <>
                <span className="hidden max-w-40 truncate rounded-full border border-slate-200 bg-white px-3 py-2 sm:inline">
                  {currentUser.email}
                </span>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-3 py-2"
                  onClick={handleLogout}
                  disabled={isAuthLoading}
                >
                  ログアウト
                </button>
              </>
            ) : (
              <button
                type="button"
                className="rounded-full border border-slate-200 bg-white px-3 py-2"
                onClick={() => setShowAuthPanel((current) => !current)}
              >
                ログイン
              </button>
            )}
            <button
              type="button"
              className="rounded-full bg-slate-900 px-3 py-2 text-white"
              onClick={() => handleCheckout("plus")}
              disabled={isBillingLoading}
            >
              有料プラン
            </button>
          </nav>
        </header>

        {showAuthPanel ? (
          <form
            onSubmit={handleAuthSubmit}
            className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] md:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <div className="flex gap-2 md:col-span-4">
              <button
                type="button"
                className={`rounded-full px-3 py-2 text-xs font-bold ${
                  authMode === "login" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                }`}
                onClick={() => setAuthMode("login")}
              >
                ログイン
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-2 text-xs font-bold ${
                  authMode === "register" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                }`}
                onClick={() => setAuthMode("register")}
              >
                新規登録
              </button>
            </div>
            {authMode === "register" ? (
              <input
                value={authDisplayName}
                onChange={(event) => setAuthDisplayName(event.target.value)}
                placeholder="表示名"
                className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-300"
              />
            ) : null}
            <input
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              type="email"
              placeholder="メールアドレス"
              className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-300"
              required
            />
            <input
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              type="password"
              placeholder="パスワード"
              className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:border-blue-300"
              required
            />
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:bg-blue-300"
              disabled={isAuthLoading}
            >
              {authMode === "register" ? "登録" : "ログイン"}
            </button>
          </form>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-extrabold tracking-normal text-slate-950 sm:text-3xl">
                  行きたい雰囲気をそのまま入力
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  SNSや共有リンクから開いても、まずはこの画面だけですぐ試せます。
                </p>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-right">
                <p className="text-xs font-bold text-blue-700">
                  {subscription?.plan ? `${subscription.plan.toUpperCase()} 生成` : "無料生成"}
                </p>
                <p className="mt-1 text-2xl font-extrabold text-blue-700">
                  残り {usageStatus.remaining}
                  <span className="text-sm">/{usageStatus.limit} 回</span>
                </p>
              </div>
            </div>

            <SearchBar
              onSearch={handleSearch}
              isLoading={isLoading}
              disabled={usageStatus.isLimited}
              initialQuery={initialPrompt}
            />

            {errorMessage ? (
              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {errorMessage}
              </div>
            ) : null}

            {isLoading ? (
              <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
                入力欄と結果だけ更新中です。このページ全体はそのまま操作できます。
              </div>
            ) : null}
          </div>

          <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <p className="text-sm font-extrabold text-slate-950">サンプルから始める</p>
            <div className="mt-3 space-y-2">
              {["雨の日の横浜カフェ巡り", "週末の京都ひとり旅", "子連れで行く箱根日帰り"].map(
                (sample) => (
                  <button
                    key={sample}
                    type="button"
                    className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-left text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"
                    onClick={() => handleSearch(sample)}
                    disabled={isLoading || usageStatus.isLimited}
                  >
                    {sample}
                  </button>
                ),
              )}
            </div>
            <div className="mt-4 rounded-2xl bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600">
              未ログインでも試せます。回数制限を超えたらログインまたは有料プランに進めます。
            </div>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-extrabold text-slate-950">プラン</p>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                  {subscription?.status ?? "anonymous"}
                </span>
              </div>
              <div className="mt-3 grid gap-2">
                {[
                  { plan: "plus" as const, label: "Plus", limit: 100, price: "980円/月" },
                  { plan: "pro" as const, label: "Pro", limit: 500, price: "2,980円/月" },
                ].map((item) => (
                  <button
                    key={item.plan}
                    type="button"
                    className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-left transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => handleCheckout(item.plan)}
                    disabled={isBillingLoading}
                  >
                    <span className="block text-sm font-extrabold text-slate-900">
                      {item.label} <span className="text-xs text-slate-500">{item.price}</span>
                    </span>
                    <span className="mt-1 block text-xs font-semibold text-slate-500">
                      月間生成 {item.limit} 回まで
                    </span>
                  </button>
                ))}
              </div>
              {billingMessage ? (
                <p className="mt-3 rounded-2xl bg-emerald-50 px-3 py-3 text-xs font-semibold leading-5 text-emerald-700">
                  {billingMessage}
                </p>
              ) : null}
            </div>
          </aside>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.65fr)]">
          <ItineraryPanel
            itinerary={itinerary}
            selectedSpotId={selectedSpotId}
            onSelectSpot={setSelectedSpotId}
            onMoveSpot={handleMoveSpot}
            onDeleteSpot={handleDeleteSpot}
            onUpdateSpotMemo={handleUpdateSpotMemo}
            onSave={handleSaveItinerary}
            saveStatus={saveStatus}
            shareUrl={shareUrl}
          />

          <div className="flex flex-col gap-3">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-extrabold text-slate-950">ルート表示</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    地図UIは必要になった時だけ読み込みます。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowRouteMap((current) => !current)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
                >
                  {showRouteMap ? "閉じる" : hasGeneratedPlan ? "見る" : "サンプルを見る"}
                </button>
              </div>
            </div>

            {showRouteMap ? (
              <Suspense
                fallback={
                  <div className="min-h-[320px] rounded-3xl border border-slate-200 bg-white p-4 text-sm font-semibold text-blue-700 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                    ルート表示を読み込んでいます。
                  </div>
                }
              >
                <MapView
                  itinerary={itinerary}
                  selectedSpotId={selectedSpotId}
                  onSelectSpot={setSelectedSpotId}
                />
              </Suspense>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

export default App;
