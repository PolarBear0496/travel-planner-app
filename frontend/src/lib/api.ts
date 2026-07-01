import type { ApiTravelPlan, Itinerary, TravelPlanResult } from "../types/itinerary";

const API_URL = "/api/generate-trip";
const PUBLIC_PLANS_URL = "/api/public/plans";
const AUTH_TOKEN_STORAGE_KEY = "travel-planner:auth-token";

export type User = {
  id: string;
  email: string;
  display_name?: string | null;
  plan: string;
};

export type Subscription = {
  plan: string;
  status: string;
  provider?: string | null;
  current_period_end?: string | null;
  generation_limit: number;
  generation_remaining: number;
};

export type CheckoutSession = {
  provider: string;
  checkout_id: string;
  checkout_url: string;
  amount: number;
  currency: string;
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
  upgradeUrl?: string;
};

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  upgradeUrl?: string;

  constructor(message: string, status: number, code?: string, upgradeUrl?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.upgradeUrl = upgradeUrl;
  }
}

export async function createTravelPlan(query: string): Promise<TravelPlanResult> {
  const response = await fetch(API_URL, {
    method: "POST",
    credentials: "include",
    headers: withAuthHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ prompt: query }),
  });

  if (!response.ok) {
    throw await buildApiRequestError(response, "旅行プランの作成に失敗しました");
  }

  const travelPlan = (await response.json()) as ApiTravelPlan | Itinerary;

  return {
    itinerary: normalizeTravelPlan(travelPlan),
    planId: "id" in travelPlan ? travelPlan.id : undefined,
    shareUrl: "share_url" in travelPlan ? travelPlan.share_url : undefined,
  };
}

export async function getTravelPlan(planId: string): Promise<TravelPlanResult> {
  const response = await fetch(`${PUBLIC_PLANS_URL}/${encodeURIComponent(planId)}`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw await buildApiRequestError(response, "旅行プランの取得に失敗しました");
  }

  const travelPlan = (await response.json()) as ApiTravelPlan | Itinerary;

  return {
    itinerary: normalizeTravelPlan(travelPlan),
    planId: "id" in travelPlan ? travelPlan.id : planId,
    shareUrl: "share_url" in travelPlan ? travelPlan.share_url : undefined,
  };
}

export async function registerUser(
  email: string,
  password: string,
  displayName?: string,
): Promise<User> {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      display_name: displayName || undefined,
    }),
  });

  return handleAuthResponse(response);
}

export async function loginUser(email: string, password: string): Promise<User> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  return handleAuthResponse(response);
}

export async function logoutUser() {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
    headers: withAuthHeaders(),
  });
  clearAuthToken();
}

export async function getCurrentUser(): Promise<User | null> {
  const response = await fetch("/api/me", {
    credentials: "include",
    headers: withAuthHeaders(),
  });

  if (response.status === 401) {
    clearAuthToken();
    return null;
  }

  if (!response.ok) {
    throw new Error(`ユーザー情報の取得に失敗しました (${response.status})`);
  }

  return (await response.json()) as User;
}

export async function getSubscription(): Promise<Subscription> {
  const response = await fetch("/api/me/subscription", {
    credentials: "include",
    headers: withAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error(`プラン状態の取得に失敗しました (${response.status})`);
  }

  return (await response.json()) as Subscription;
}

export async function createCheckout(
  provider: "paypay" | "square",
  plan: "plus" | "pro",
): Promise<CheckoutSession> {
  const response = await fetch(`/api/billing/${provider}/checkout`, {
    method: "POST",
    credentials: "include",
    headers: withAuthHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({ plan }),
  });

  if (!response.ok) {
    throw new Error(`決済の開始に失敗しました (${response.status})`);
  }

  return (await response.json()) as CheckoutSession;
}

function getAuthToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

function setAuthToken(token: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  }
}

function clearAuthToken() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  }
}

function withAuthHeaders(headers: HeadersInit = {}): HeadersInit {
  const token = getAuthToken();

  if (!token) {
    return headers;
  }

  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  };
}

async function handleAuthResponse(response: Response): Promise<User> {
  if (!response.ok) {
    throw new Error(`認証に失敗しました (${response.status})`);
  }

  const data = (await response.json()) as { user: User; access_token: string };
  setAuthToken(data.access_token);
  return data.user;
}

async function buildApiRequestError(response: Response, fallbackMessage: string) {
  let body: ApiErrorResponse | null = null;

  try {
    body = (await response.json()) as ApiErrorResponse;
  } catch {
    body = null;
  }

  return new ApiRequestError(
    body?.message ?? `${fallbackMessage} (${response.status})`,
    response.status,
    body?.error,
    body?.upgradeUrl,
  );
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
