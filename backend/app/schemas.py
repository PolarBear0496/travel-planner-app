from pydantic import BaseModel


class GenerateTripRequest(BaseModel):
    prompt: str


class TripSpot(BaseModel):
    name: str
    time: str
    description: str
    lat: float
    lng: float


class TripItineraryItem(BaseModel):
    time: str
    title: str
    memo: str


class TripPlan(BaseModel):
    title: str
    destination: str
    summary: str
    spots: list[TripSpot]
    itinerary: list[TripItineraryItem]
    notes: list[str]


class TripPlanResponse(TripPlan):
    id: str
    share_url: str


class UsageStatusResponse(BaseModel):
    plan: str
    limit: int
    used: int
    remaining: int
    resetAt: str


class ErrorResponse(BaseModel):
    error: str
    message: str
    upgradeUrl: str | None = None


class AuthRequest(BaseModel):
    email: str
    password: str
    display_name: str | None = None
    anonymous_id: str | None = None


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str | None = None
    plan: str


class AuthResponse(BaseModel):
    user: UserResponse
    access_token: str


class SubscriptionResponse(BaseModel):
    plan: str
    status: str
    provider: str | None = None
    current_period_end: str | None = None
    generation_limit: int
    generation_remaining: int


class UsageResponse(BaseModel):
    remaining: int
    limit: int
    isLimited: bool
    source: str


class CheckoutRequest(BaseModel):
    plan: str


class CheckoutResponse(BaseModel):
    provider: str
    checkout_id: str
    checkout_url: str
    amount: int
    currency: str


class WebhookResponse(BaseModel):
    received: bool
    status: str
