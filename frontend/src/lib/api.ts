import type { ApiTravelPlan, Itinerary, TravelPlanResult } from "../types/itinerary";

const API_URL = "/api/generate-trip";
const PUBLIC_PLANS_URL = "/api/public/plans";

export async function createTravelPlan(query: string): Promise<TravelPlanResult> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt: query }),
  });

  if (!response.ok) {
    throw new Error(`旅行プランの作成に失敗しました (${response.status})`);
  }

  const travelPlan = (await response.json()) as ApiTravelPlan | Itinerary;

  return {
    itinerary: normalizeTravelPlan(travelPlan),
    planId: "id" in travelPlan ? travelPlan.id : undefined,
    shareUrl: "share_url" in travelPlan ? travelPlan.share_url : undefined,
  };
}

export async function getTravelPlan(planId: string): Promise<TravelPlanResult> {
  const response = await fetch(`${PUBLIC_PLANS_URL}/${encodeURIComponent(planId)}`);

  if (!response.ok) {
    throw new Error(`旅行プランの取得に失敗しました (${response.status})`);
  }

  const travelPlan = (await response.json()) as ApiTravelPlan | Itinerary;

  return {
    itinerary: normalizeTravelPlan(travelPlan),
    planId: "id" in travelPlan ? travelPlan.id : planId,
    shareUrl: "share_url" in travelPlan ? travelPlan.share_url : undefined,
  };
}

export function normalizeTravelPlan(travelPlan: ApiTravelPlan | Itinerary): Itinerary {
  if ("days" in travelPlan) {
    return {
      ...travelPlan,
      days: travelPlan.days.map((day) => ({
        ...day,
        spots: day.spots
          .map((spot, index) => ({
            ...spot,
            order: spot.order ?? index + 1,
            stayMinutes: spot.stayMinutes ?? 60,
            transportMode: spot.transportMode ?? "walk",
          }))
          .sort((current, next) => (current.order ?? 0) - (next.order ?? 0)),
      })),
    };
  }

  return {
    title: travelPlan.title,
    destination: travelPlan.destination,
    summary: travelPlan.summary,
    notes: travelPlan.notes,
    days: [
      {
        id: "day-1",
        title: travelPlan.destination ? `${travelPlan.destination}プラン` : "Day 1",
        spots: travelPlan.spots.map((spot, index) => {
          const itineraryItem = travelPlan.itinerary[index];

          return {
            id: `spot-${index + 1}`,
            name: spot.name,
            time: spot.time,
            description: spot.description,
            title: itineraryItem?.title,
            memo: itineraryItem?.memo,
            lat: spot.lat,
            lng: spot.lng,
            order: index + 1,
            stayMinutes: 60,
            transportMode: "walk",
          };
        }),
      },
    ],
  };
}
