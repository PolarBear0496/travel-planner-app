import json
import logging
import os
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from hmac import compare_digest
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import Cookie, FastAPI, Header, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from mangum import Mangum
from openai import OpenAI

from .schemas import ErrorResponse, GenerateTripRequest, TripPlan, TripPlanResponse, UsageStatusResponse
from .usage_limiter import (
    ANONYMOUS_COOKIE_NAME,
    InMemoryUsageCounterStore,
    UsageStatus,
    UsageLimiter,
    UsageLimitExceeded,
)


load_dotenv()


logger = logging.getLogger(__name__)


OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
PLAN_SHARE_BASE_URL = os.getenv("PLAN_SHARE_BASE_URL", "/plan")
PUBLIC_API_KEY_HASHES = {
    item.strip()
    for item in os.getenv("PUBLIC_API_KEY_HASHES", "").split(",")
    if item.strip()
}
PUBLIC_API_DAILY_LIMIT = int(os.getenv("PUBLIC_API_DAILY_LIMIT", "20"))


SYSTEM_PROMPT = """あなたは旅行プランナーです。
ユーザーの希望から旅行の行程を作成してください。

制約:
- 出力はJSONのみ
- Markdownや説明文は出力しない
- spots は3〜5件
- 各spotには name, time, description, lat, lng を含める
- itinerary には time, title, memo を含める
- notes には旅行時の注意点を2〜4件入れる
- description, memo, notes は日本語
- 緯度経度は地図表示に使える程度の精度でよい
- レスポンスのトップレベルには title, destination, summary, spots, itinerary, notes を含める
"""


client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
plans: dict[str, dict[str, object]] = {}
api_usage_counts: dict[tuple[str, str], int] = defaultdict(int)
usage_limiter = UsageLimiter.from_env(InMemoryUsageCounterStore())


app = FastAPI(title="travel-planner-backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post(
    "/api/generate-trip",
    response_model=TripPlanResponse,
    responses={429: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def generate_trip(
    request: GenerateTripRequest,
    http_request: Request,
    response: Response,
    anonymous_id: str | None = Cookie(default=None, alias=ANONYMOUS_COOKIE_NAME),
) -> TripPlanResponse | JSONResponse:
    active_anonymous_id = anonymous_id or uuid4().hex
    client_ip = get_client_ip(http_request)
    set_anonymous_cookie(response, active_anonymous_id)

    try:
        usage_limiter.ensure_anonymous_allowed(active_anonymous_id, client_ip)
    except UsageLimitExceeded:
        return usage_limit_error()

    try:
        plan = generate_trip_plan(request.prompt)
        usage_limiter.record_anonymous_generation(active_anonymous_id, client_ip)
        return save_plan(plan=plan, prompt=request.prompt, owner_type="web")
    except Exception as exc:
        logger.exception("Failed to generate trip: %s", exc)
        return JSONResponse(
            status_code=500,
            content=ErrorResponse(
                error="failed_to_generate_trip",
                message="旅行プランの生成に失敗しました",
            ).model_dump(),
        )


@app.get("/api/me/usage", response_model=UsageStatusResponse)
async def get_usage_status(
    response: Response,
    anonymous_id: str | None = Cookie(default=None, alias=ANONYMOUS_COOKIE_NAME),
) -> UsageStatusResponse:
    active_anonymous_id = anonymous_id or uuid4().hex
    set_anonymous_cookie(response, active_anonymous_id)

    return build_usage_status_response(
        usage_limiter.get_anonymous_status(active_anonymous_id),
    )


@app.post(
    "/api/public/generate-trip",
    response_model=TripPlanResponse,
    responses={
        401: {"model": ErrorResponse},
        429: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
)
async def generate_trip_from_public_api(
    request: GenerateTripRequest,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> TripPlanResponse | JSONResponse:
    api_client_hash = authenticate_api_client(x_api_key)

    if api_client_hash is None:
        return JSONResponse(
            status_code=401,
            content=ErrorResponse(
                error="invalid_api_key",
                message="APIキーが無効です",
            ).model_dump(),
        )

    if is_api_client_limited(api_client_hash):
        return JSONResponse(
            status_code=429,
            content=ErrorResponse(
                error="api_rate_limited",
                message="APIの日次利用上限に達しました",
            ).model_dump(),
        )

    try:
        plan = generate_trip_plan(request.prompt)
        record_api_usage(api_client_hash)
        return save_plan(plan=plan, prompt=request.prompt, owner_type="api")
    except Exception as exc:
        logger.exception("Failed to generate trip from public API: %s", exc)
        return JSONResponse(
            status_code=500,
            content=ErrorResponse(
                error="failed_to_generate_trip",
                message="旅行プランの生成に失敗しました",
            ).model_dump(),
        )


@app.get(
    "/api/public/plans/{plan_id}",
    response_model=TripPlanResponse,
    responses={404: {"model": ErrorResponse}},
)
async def get_public_plan(plan_id: str) -> TripPlanResponse | JSONResponse:
    record = plans.get(plan_id)

    if record is None:
        return JSONResponse(
            status_code=404,
            content=ErrorResponse(
                error="plan_not_found",
                message="旅行プランが見つかりません",
            ).model_dump(),
        )

    return build_plan_response(plan_id, record["plan"])


def generate_trip_plan(prompt: str) -> TripPlan:
    if client is None:
        raise RuntimeError("OPENAI_API_KEY is not set")

    response = client.chat.completions.create(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
    )

    content = response.choices[0].message.content
    if content is None:
        raise RuntimeError("OpenAI response content is empty")

    plan_data = json.loads(content)
    return TripPlan.model_validate(plan_data)


def save_plan(plan: TripPlan, prompt: str, owner_type: str) -> TripPlanResponse:
    plan_id = uuid4().hex
    plans[plan_id] = {
        "plan": plan,
        "prompt": prompt,
        "owner_type": owner_type,
        "visibility": "public",
        "created_at": datetime.now(UTC),
        "expires_at": datetime.now(UTC) + timedelta(days=30),
    }
    return build_plan_response(plan_id, plan)


def authenticate_api_client(api_key: str | None) -> str | None:
    if not api_key or not PUBLIC_API_KEY_HASHES:
        return None

    api_key_hash = hash_api_key(api_key)
    for known_hash in PUBLIC_API_KEY_HASHES:
        if compare_digest(api_key_hash, known_hash):
            return api_key_hash

    return None


def hash_api_key(api_key: str) -> str:
    return sha256(api_key.encode("utf-8")).hexdigest()


def is_api_client_limited(api_client_hash: str) -> bool:
    today = datetime.now(UTC).date().isoformat()
    return api_usage_counts[(api_client_hash, today)] >= PUBLIC_API_DAILY_LIMIT


def record_api_usage(api_client_hash: str) -> None:
    today = datetime.now(UTC).date().isoformat()
    api_usage_counts[(api_client_hash, today)] += 1


def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")

    if forwarded_for:
        return forwarded_for.split(",", maxsplit=1)[0].strip()

    return request.client.host if request.client else "unknown"


def set_anonymous_cookie(response: Response, anonymous_id: str) -> None:
    response.set_cookie(
        key=ANONYMOUS_COOKIE_NAME,
        value=anonymous_id,
        max_age=60 * 60 * 24 * 365,
        httponly=True,
        samesite="lax",
    )


def usage_limit_error() -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content=ErrorResponse(
            error="usage_limit_exceeded",
            message="本日の無料生成回数を使い切りました",
            upgradeUrl="/pricing",
        ).model_dump(),
    )


def build_usage_status_response(status: UsageStatus) -> UsageStatusResponse:
    return UsageStatusResponse(
        plan=status.plan,
        limit=status.limit,
        used=status.used,
        remaining=status.remaining,
        resetAt=status.reset_at.isoformat(),
    )


def build_plan_response(plan_id: str, plan: object) -> TripPlanResponse:
    if not isinstance(plan, TripPlan):
        raise RuntimeError("Stored plan has an invalid type")

    return TripPlanResponse(
        **plan.model_dump(),
        id=plan_id,
        share_url=f"{PLAN_SHARE_BASE_URL.rstrip('/')}/{plan_id}",
    )


handler = Mangum(app)
