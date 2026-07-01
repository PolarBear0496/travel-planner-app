import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { sampleItinerary } from "./data/sampleItinerary";
import { useUsageStatus } from "./hooks/useUsageStatus";
import { ApiRequestError, createTravelPlan, getTravelPlan } from "./lib/api";
import { ItineraryPanel } from "./components/ItineraryPanel";
import { SearchBar } from "./components/SearchBar";
import type { Itinerary } from "./types/itinerary";

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

function App() {
  const initialPrompt = useMemo(() => getInitialPrompt(), []);
  const [itinerary, setItinerary] = useState<Itinerary>(sampleItinerary);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(
    getFirstSpotId(sampleItinerary),
  );
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasGeneratedPlan, setHasGeneratedPlan] = useState(false);
  const [showRouteMap, setShowRouteMap] = useState(false);
  const { usageStatus, recordGeneration } = useUsageStatus();

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
      recordGeneration();
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
            <button className="rounded-full border border-slate-200 bg-white px-3 py-2">ログイン</button>
            <button className="rounded-full bg-slate-900 px-3 py-2 text-white">有料プラン</button>
          </nav>
        </header>

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
                <p className="text-xs font-bold text-blue-700">無料生成</p>
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
          </aside>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.65fr)]">
          <ItineraryPanel
            itinerary={itinerary}
            selectedSpotId={selectedSpotId}
            onSelectSpot={setSelectedSpotId}
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
