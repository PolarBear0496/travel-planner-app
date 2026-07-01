import type { Itinerary } from "../types/itinerary";
import { SpotCard } from "./SpotCard";

type ItineraryPanelProps = {
  itinerary: Itinerary;
  selectedSpotId: string | null;
  onSelectSpot: (spotId: string) => void;
  onMoveSpot: (dayId: string, spotId: string, direction: "up" | "down") => void;
  onDeleteSpot: (dayId: string, spotId: string) => void;
  onUpdateSpotMemo: (dayId: string, spotId: string, memo: string) => void;
  onSave: () => void;
  saveStatus: "idle" | "dirty" | "saved";
  shareUrl?: string | null;
};

export function ItineraryPanel({
  itinerary,
  selectedSpotId,
  onSelectSpot,
  onMoveSpot,
  onDeleteSpot,
  onUpdateSpotMemo,
  onSave,
  saveStatus,
  shareUrl,
}: ItineraryPanelProps) {
  function handleShare() {
    if (!shareUrl) {
      return;
    }

    void navigator.clipboard?.writeText(shareUrl);
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.10)] lg:p-5">
      <div className="mb-5 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 text-sm font-bold text-blue-600">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50">▣</span>
            日程のしおり
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleShare}
              disabled={!shareUrl}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              共有
            </button>
            <button
              type="button"
              onClick={onSave}
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
            >
              保存
            </button>
          </div>
        </div>
        <p
          className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${
            saveStatus === "dirty"
              ? "bg-amber-50 text-amber-700"
              : saveStatus === "saved"
                ? "bg-green-50 text-green-700"
                : "bg-slate-100 text-slate-500"
          }`}
        >
          {saveStatus === "dirty"
            ? "未保存の編集あり"
            : saveStatus === "saved"
              ? "この端末に保存済み"
              : "保存するとこの端末で続きから編集できます"}
        </p>
        <h2 className="text-2xl font-extrabold tracking-normal text-slate-950">{itinerary.title}</h2>
        {itinerary.summary ? (
          <p className="max-w-2xl text-sm leading-6 text-slate-600">{itinerary.summary}</p>
        ) : null}
        {itinerary.destination ? (
          <p className="inline-flex w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
            {itinerary.destination}
          </p>
        ) : null}
      </div>

      <div className="space-y-5">
        {itinerary.days.map((day) => (
          <div key={day.id}>
            <div className="mb-2 flex items-center gap-3">
              <span className="rounded-lg bg-blue-600 px-3 py-1 text-sm font-bold text-white">
                {day.title}
              </span>
              <p className="text-sm font-semibold text-slate-700">
                {day.date ?? "おすすめルートをゆったり巡る"}
              </p>
            </div>
            <div className="space-y-2">
              {day.spots.map((spot, index) => (
                <SpotCard
                  key={spot.id}
                  spot={spot}
                  index={index}
                  canMoveUp={index > 0}
                  canMoveDown={index < day.spots.length - 1}
                  isSelected={spot.id === selectedSpotId}
                  onSelect={onSelectSpot}
                  onMove={(direction) => onMoveSpot(day.id, spot.id, direction)}
                  onDelete={() => onDeleteSpot(day.id, spot.id)}
                  onUpdateMemo={(memo) => onUpdateSpotMemo(day.id, spot.id, memo)}
                />
              ))}
              {day.spots.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-sm font-semibold text-slate-500">
                  この日のスポットはすべて削除されました。
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {itinerary.notes?.length ? (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <h3 className="text-sm font-bold text-green-800">このプランのポイント</h3>
          <ul className="mt-1 space-y-1 text-sm leading-6 text-green-800">
            {itinerary.notes.map((note) => (
              <li key={note}>・{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
