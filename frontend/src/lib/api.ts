import type { ApiTravelPlan, Itinerary } from "../types/itinerary";

const API_URL = "/api/generate-trip";

export async function createTravelPlan(query: string): Promise<Itinerary> {
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

  return normalizeTravelPlan(travelPlan);
}

export function normalizeTravelPlan(travelPlan: ApiTravelPlan | Itinerary): Itinerary {
  if ("days" in travelPlan) {
    return travelPlan;
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
          };
        }),
      },
    ],
  };
}
