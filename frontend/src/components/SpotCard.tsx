import type { Spot } from "../types/itinerary";

type SpotCardProps = {
  spot: Spot;
  index: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isSelected: boolean;
  onSelect: (spotId: string) => void;
  onMove: (direction: "up" | "down") => void;
  onDelete: () => void;
  onUpdateMemo: (memo: string) => void;
};

export function SpotCard({
  spot,
  index,
  canMoveUp,
  canMoveDown,
  isSelected,
  onSelect,
  onMove,
  onDelete,
  onUpdateMemo,
}: SpotCardProps) {
  return (
    <article
      className={`rounded-xl border px-3 py-3 transition ${
        isSelected
          ? "border-blue-500 bg-blue-50 shadow-[0_10px_24px_rgba(37,99,235,0.12)] ring-1 ring-blue-500"
          : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"
      }`}
    >
      <div className="grid w-full grid-cols-[64px_1fr] items-start gap-3 text-left sm:grid-cols-[64px_1fr_auto]">
        <button
          type="button"
          onClick={() => onSelect(spot.id)}
          className="text-left text-sm font-semibold text-slate-900"
        >
          {spot.time}
        </button>
        <button
          type="button"
          onClick={() => onSelect(spot.id)}
          className="relative min-w-0 border-l border-slate-200 pl-8 text-left"
        >
          <span
            className={`absolute -left-[9px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 ${
              isSelected ? "border-blue-600 bg-blue-600" : "border-slate-400 bg-white"
            }`}
          />
          <span
            className={`absolute left-3 top-0 flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold ${
              isSelected ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600"
            }`}
            aria-hidden="true"
          >
            {index + 1}
          </span>
          <div className="pl-10">
            <h3 className="truncate text-base font-bold text-slate-950">{spot.title ?? spot.name}</h3>
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-600">
              {spot.title ? `${spot.name}。` : ""}
              {spot.memo ?? spot.description}
            </p>
            {typeof spot.lat !== "number" || typeof spot.lng !== "number" ? (
              <p className="mt-2 w-fit rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">
                位置情報なし
              </p>
            ) : null}
          </div>
        </button>
        <div className="col-span-2 flex items-center gap-1 sm:col-span-1">
          <button
            type="button"
            onClick={() => onMove("up")}
            disabled={!canMoveUp}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label={`${spot.name}を上へ移動`}
            title="上へ移動"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove("down")}
            disabled={!canMoveDown}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label={`${spot.name}を下へ移動`}
            title="下へ移動"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-sm font-bold text-red-700"
            aria-label={`${spot.name}を削除`}
            title="削除"
          >
            ×
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block">
          <span className="sr-only">{spot.name}のメモ</span>
          <textarea
            aria-label={`${spot.name}のメモ`}
            value={spot.memo ?? ""}
            onChange={(event) => onUpdateMemo(event.target.value)}
            onFocus={() => onSelect(spot.id)}
            rows={2}
            className="min-h-[68px] w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-5 text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            placeholder="メモを追加"
          />
        </label>
        <div className="min-w-[92px] text-xs font-medium text-slate-500 sm:text-right">
          <p>滞在 {spot.stayMinutes ?? 60}分</p>
          <p className="mt-1">{spot.travelTime ? spot.travelTime : "徒歩 15分"}</p>
        </div>
      </div>
    </article>
  );
}
