import type { Itinerary, Spot } from "../types/itinerary";

type MapViewProps = {
  itinerary: Itinerary;
  selectedSpotId: string | null;
  onSelectSpot: (spotId: string) => void;
};

type PositionedSpot = Spot & {
  index: number;
  x: number;
  y: number;
};

const pointLayout = [
  { x: 17, y: 72 },
  { x: 34, y: 43 },
  { x: 51, y: 60 },
  { x: 67, y: 32 },
  { x: 81, y: 55 },
  { x: 60, y: 76 },
  { x: 39, y: 25 },
  { x: 22, y: 48 },
];

function getGeoPosition(spot: Spot, spots: Spot[]) {
  const spotsWithGeo = spots.filter(
    (item): item is Spot & { lat: number; lng: number } =>
      typeof item.lat === "number" && typeof item.lng === "number",
  );

  if (typeof spot.lat !== "number" || typeof spot.lng !== "number" || spotsWithGeo.length < 2) {
    return null;
  }

  const minLat = Math.min(...spotsWithGeo.map((item) => item.lat));
  const maxLat = Math.max(...spotsWithGeo.map((item) => item.lat));
  const minLng = Math.min(...spotsWithGeo.map((item) => item.lng));
  const maxLng = Math.max(...spotsWithGeo.map((item) => item.lng));
  const latRange = maxLat - minLat || 1;
  const lngRange = maxLng - minLng || 1;

  return {
    x: 15 + ((spot.lng - minLng) / lngRange) * 70,
    y: 15 + (1 - (spot.lat - minLat) / latRange) * 70,
  };
}

export function MapView({ itinerary, selectedSpotId, onSelectSpot }: MapViewProps) {
  const spots = itinerary.days.flatMap((day) =>
    day.spots.map((spot) => ({ ...spot, dayId: day.id })),
  );

  const positionedSpots: PositionedSpot[] = spots.map((spot, index) => {
    const geoPosition = getGeoPosition(spot, spots);

    return {
      ...spot,
      index,
      ...(geoPosition ?? pointLayout[index % pointLayout.length]),
    };
  });

  const routePoints = positionedSpots.map((spot) => `${spot.x},${spot.y}`).join(" ");
  const selectedSpot = positionedSpots.find((spot) => spot.id === selectedSpotId);

  return (
    <section className="relative min-h-[620px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.10)]">
      <div className="absolute inset-0 bg-[#f3efe7]" />
      <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(90deg,rgba(255,255,255,0.86)_2px,transparent_2px),linear-gradient(rgba(255,255,255,0.86)_2px,transparent_2px)] [background-size:58px_58px]" />
      <div className="absolute left-[-8%] top-[18%] h-28 w-[120%] rotate-[24deg] bg-sky-200/60" />
      <div className="absolute bottom-[8%] left-[-10%] h-24 w-[120%] -rotate-[21deg] bg-sky-200/60" />
      <div className="absolute left-[9%] top-[8%] h-24 w-28 rounded-full bg-green-200/55 blur-sm" />
      <div className="absolute bottom-[16%] right-[8%] h-36 w-44 rounded-full bg-green-200/55 blur-sm" />
      <div className="absolute right-[16%] top-[8%] h-20 w-24 rounded-full bg-green-200/55 blur-sm" />

      <div className="relative flex h-full min-h-[620px] flex-col p-4">
        <div className="mb-3 flex items-start justify-between gap-4">
          <span className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-800 shadow-md">
            ✦ おすすめスポット
          </span>
          <div className="flex flex-col overflow-hidden rounded-xl bg-white shadow-md">
            <button className="h-12 w-12 border-b border-slate-200 text-2xl font-semibold text-slate-800">
              +
            </button>
            <button className="h-12 w-12 text-2xl font-semibold text-slate-800">−</button>
          </div>
        </div>

        <div className="relative flex-1">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline
              points={routePoints}
              fill="none"
              stroke="#1d6ff2"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="5 4"
            />
          </svg>

          {positionedSpots.map((spot) => {
            const isSelected = spot.id === selectedSpotId;

            return (
              <div
                key={spot.id}
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
              >
                <button
                  type="button"
                  onClick={() => onSelectSpot(spot.id)}
                  className={`relative flex h-[76px] w-[76px] items-center justify-center rounded-full border-[5px] bg-white shadow-xl transition ${
                    isSelected
                      ? "border-blue-600 ring-[10px] ring-blue-500/20"
                      : "border-white hover:border-blue-200"
                  }`}
                  aria-label={`${spot.name}を選択`}
                >
                  <span className="absolute -left-2 -top-5 flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-base font-extrabold text-white shadow-lg">
                    {spot.index + 1}
                  </span>
                  <span className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-gradient-to-br from-sky-100 via-white to-emerald-100 text-2xl">
                    {spot.index === 1 ? "🍜" : spot.index === 2 ? "🌊" : "⛩"}
                  </span>
                </button>
                <div className="mx-auto mt-1 w-fit rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-800 shadow-md">
                  {spot.name}
                </div>
              </div>
            );
          })}

          {selectedSpot ? (
            <div
              className="absolute z-30 hidden w-[300px] -translate-y-1/2 rounded-2xl bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.20)] md:block"
              style={{
                left: `${Math.min(Math.max(selectedSpot.x + 9, 18), 62)}%`,
                top: `${Math.min(Math.max(selectedSpot.y, 26), 72)}%`,
              }}
            >
              <button
                type="button"
                onClick={() => onSelectSpot(selectedSpot.id)}
                className="absolute right-4 top-3 text-xl text-slate-400"
                aria-label="スポット詳細を閉じる"
              >
                ×
              </button>
              <div className="flex gap-3 pr-5">
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-emerald-100 text-4xl">
                  {selectedSpot.index === 1 ? "🍜" : selectedSpot.index === 2 ? "🌊" : "⛩"}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-950">{selectedSpot.name}</h3>
                  <span className="mt-2 inline-flex rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
                    歴史・散策
                  </span>
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">
                    {selectedSpot.description}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs font-semibold text-slate-600">◷ 滞在目安: 60分</p>
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-3">
            <button className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-800 shadow-md">
              ▰ 地図の表示
            </button>
            <button className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-800 shadow-md">
              ☷ 絞り込み
            </button>
          </div>
          <p className="rounded-xl bg-white/85 px-4 py-3 text-xs font-semibold text-slate-500 shadow-md">
            Google Map 実装前の仮UI
          </p>
        </div>
      </div>
    </section>
  );
}
