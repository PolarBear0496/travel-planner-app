import { useState } from "react";
import { ItineraryPanel } from "./components/ItineraryPanel";
import { MapView } from "./components/MapView";
import { SearchBar } from "./components/SearchBar";
import { normalizeTravelPlan, createTravelPlan } from "./lib/api";
import type { Itinerary } from "./types/itinerary";

const initialItinerary: Itinerary = normalizeTravelPlan({
  title: "鎌倉日帰りさんぽ",
  destination: "鎌倉",
  summary: "海、カフェ、寺をめぐる日帰りプランです。",
  spots: [
    {
      name: "鶴岡八幡宮",
      time: "10:00",
      description: "鎌倉を代表する神社。",
      lat: 35.3261,
      lng: 139.5564,
    },
    {
      name: "小町通り",
      time: "11:30",
      description: "食べ歩きや土産探しに便利な通り。",
      lat: 35.3192,
      lng: 139.5505,
    },
    {
      name: "由比ヶ浜",
      time: "14:00",
      description: "海辺を散歩しながらひと休みできるスポット。",
      lat: 35.3068,
      lng: 139.5359,
    },
  ],
  itinerary: [
    {
      time: "10:00",
      title: "鶴岡八幡宮を散策",
      memo: "鎌倉駅から徒歩で移動",
    },
    {
      time: "11:30",
      title: "小町通りで昼食",
      memo: "混むので早めに移動",
    },
    {
      time: "14:00",
      title: "由比ヶ浜を散歩",
      memo: "海沿いは風が強い場合あり",
    },
  ],
  notes: ["歩きやすい靴がおすすめ", "海沿いは風が強い可能性あり"],
});

function getFirstSpotId(itinerary: Itinerary): string | null {
  return itinerary.days[0]?.spots[0]?.id ?? null;
}

function App() {
  const [itinerary, setItinerary] = useState<Itinerary>(initialItinerary);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(
    getFirstSpotId(initialItinerary),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSearch(query: string) {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const nextItinerary = await createTravelPlan(query);
      setItinerary(nextItinerary);
      setSelectedSpotId(getFirstSpotId(nextItinerary));
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "旅行プランの作成中に予期しないエラーが発生しました。",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4 px-4 py-5 sm:px-6">
        <header className="flex flex-col gap-4 rounded-[28px] bg-white/90 p-4 shadow-[0_16px_45px_rgba(15,23,42,0.07)] lg:flex-row lg:items-center">
          <div className="flex min-w-[220px] items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-blue-600 text-2xl text-blue-600">
              ✈
            </div>
            <p className="text-2xl font-extrabold text-blue-600">TripNote</p>
          </div>

          <div className="flex-1">
            <SearchBar onSearch={handleSearch} isLoading={isLoading} />
          </div>

          <nav className="flex flex-wrap items-center justify-end gap-4 text-sm font-semibold text-slate-600">
            <button className="whitespace-nowrap">♡ お気に入り</button>
            <button className="whitespace-nowrap">◷ 履歴</button>
            <button className="whitespace-nowrap">☰ メニュー</button>
          </nav>
        </header>

        {errorMessage ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {isLoading ? (
          <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-medium text-blue-700 shadow-sm">
            旅行ルートを作成しています。バックエンドからの応答を待っています。
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(420px,0.9fr)]">
          <MapView
            itinerary={itinerary}
            selectedSpotId={selectedSpotId}
            onSelectSpot={setSelectedSpotId}
          />
          <ItineraryPanel
            itinerary={itinerary}
            selectedSpotId={selectedSpotId}
            onSelectSpot={setSelectedSpotId}
          />
        </div>
      </div>
    </main>
  );
}

export default App;
