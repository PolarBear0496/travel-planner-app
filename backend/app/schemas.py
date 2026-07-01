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
