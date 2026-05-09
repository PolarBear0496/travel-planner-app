import type { Spot } from "../types/itinerary";

type SpotCardProps = {
  spot: Spot;
  index: number;
  isSelected: boolean;
  onSelect: (spotId: string) => void;
};

export function SpotCard({ spot, index, isSelected, onSelect }: SpotCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(spot.id)}
      className={`group grid w-full grid-cols-[64px_1fr_auto] items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
        isSelected
          ? "border-blue-500 bg-blue-50 shadow-[0_10px_24px_rgba(37,99,235,0.12)] ring-1 ring-blue-500"
          : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"
      }`}
    >
      <div className="text-sm font-semibold text-slate-900">{spot.time}</div>
      <div className="relative min-w-0 border-l border-slate-200 pl-8">
        <span
          className={`absolute -left-[9px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 ${
            isSelected ? "border-blue-600 bg-blue-600" : "border-slate-400 bg-white"
          }`}
        />
        <span
          className={`absolute left-3 top-0 flex h-8 w-8 items-center justify-center rounded-full text-base ${
            isSelected ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600"
          }`}
          aria-hidden="true"
        >
          {index % 2 === 1 ? "🍴" : "📍"}
        </span>
        <div className="pl-10">
          <h3 className="truncate text-base font-bold text-slate-950">{spot.title ?? spot.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">
            {spot.title ? `${spot.name}。` : ""}
            {spot.memo ?? spot.description}
          </p>
        </div>
      </div>
      <div className="hidden min-w-[74px] text-right text-xs font-medium text-slate-500 sm:block">
        <p>◷ 60分</p>
        <p className="mt-1">{spot.travelTime ? `▣ ${spot.travelTime}` : "徒歩 15分"}</p>
      </div>
    </button>
  );
}
