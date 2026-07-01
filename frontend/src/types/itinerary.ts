export type Spot = {
  id: string;
  name: string;
  description: string;
  time: string;
  travelTime?: string;
  title?: string;
  memo?: string;
  lat?: number;
  lng?: number;
  dayId?: string;
};

export type ItineraryDay = {
  id: string;
  title: string;
  date?: string;
  spots: Spot[];
};

export type Itinerary = {
  title: string;
  destination?: string;
  summary?: string;
  notes?: string[];
  days: ItineraryDay[];
};

export type ApiSpot = {
  name: string;
  time: string;
  description: string;
  lat?: number;
  lng?: number;
};

export type ApiItineraryItem = {
  time: string;
  title: string;
  memo: string;
};

export type ApiTravelPlan = {
  id?: string;
  share_url?: string;
  title: string;
  destination?: string;
  summary?: string;
  spots: ApiSpot[];
  itinerary: ApiItineraryItem[];
  notes?: string[];
};

export type TravelPlanResult = {
  itinerary: Itinerary;
  planId?: string;
  shareUrl?: string;
};
