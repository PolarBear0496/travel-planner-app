import { normalizeTravelPlan } from "../lib/api";
import type { Itinerary } from "../types/itinerary";

export const sampleItinerary: Itinerary = normalizeTravelPlan({
  title: "鎌倉日帰りさんぽ",
  destination: "鎌倉",
  summary: "海、カフェ、寺をめぐる日帰りプランです。",
  spots: [
    {
      name: "鶴岡八幡宮",
      time: "10:00",
      description: "鎌倉を代表する神社。朝のうちにゆっくり参拝します。",
      lat: 35.3261,
      lng: 139.5564,
    },
    {
      name: "小町通り",
      time: "11:30",
      description: "食べ歩きや土産探しに便利な通り。早めの昼食に向いています。",
      lat: 35.3192,
      lng: 139.5505,
    },
    {
      name: "由比ヶ浜",
      time: "14:00",
      description: "海辺を散歩しながらひと休みできるスポットです。",
      lat: 35.3068,
      lng: 139.5359,
    },
  ],
  itinerary: [
    {
      time: "10:00",
      title: "鶴岡八幡宮を散策",
      memo: "鎌倉駅から徒歩で移動。混む前に参拝します。",
    },
    {
      time: "11:30",
      title: "小町通りで昼食",
      memo: "カフェや甘味も候補に入れ、気分で選べる余白を残します。",
    },
    {
      time: "14:00",
      title: "由比ヶ浜を散歩",
      memo: "海沿いで休憩。天気が悪い日は駅近くのカフェに切り替えます。",
    },
  ],
  notes: ["歩きやすい靴がおすすめ", "海沿いは風が強い可能性あり"],
});
