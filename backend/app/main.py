import json
import logging
import os
import secrets
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from hashlib import pbkdf2_hmac, sha256
from hmac import compare_digest
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import Cookie, FastAPI, Header, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from mangum import Mangum
from openai import OpenAI

from .billing.providers import PayPayProvider, SquareProvider, get_plan_definition
from .schemas import (
    AuthRequest,
    AuthResponse,
    CheckoutRequest,
    CheckoutResponse,
    ErrorResponse,
    GenerateTripRequest,
    SubscriptionResponse,
    TripPlan,
    TripPlanResponse,
    UsageStatusResponse,
    UserResponse,
    WebhookResponse,
)
from .usage_limiter import (
    ANONYMOUS_COOKIE_NAME,
    InMemoryUsageCounterStore,
    UsageStatus,
    UsageLimiter,
    UsageLimitExceeded,
    next_utc_midnight,
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
SESSION_COOKIE_NAME = "travel_planner_session"
PAYPAY_WEBHOOK_SECRET = os.getenv("PAYPAY_WEBHOOK_SECRET")
SQUARE_WEBHOOK_SECRET = os.getenv("SQUARE_WEBHOOK_SECRET")


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
users: dict[str, dict[str, object]] = {}
users_by_email: dict[str, str] = {}
sessions: dict[str, str] = {}
subscriptions: dict[str, dict[str, object]] = {}
payments: dict[str, dict[str, object]] = {}
processed_webhook_events: set[tuple[str, str]] = set()
user_usage_counts: dict[tuple[str, str], int] = defaultdict(int)
paypay_provider = PayPayProvider(PAYPAY_WEBHOOK_SECRET)
square_provider = SquareProvider(SQUARE_WEBHOOK_SECRET)


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
    authorization: str | None = Header(default=None, alias="Authorization"),
    anonymous_id: str | None = Cookie(default=None, alias=ANONYMOUS_COOKIE_NAME),
    session_cookie: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> TripPlanResponse | JSONResponse:
    user = get_user_from_token(extract_bearer_token(authorization) or session_cookie)
    if user is not None:
        subscription = get_subscription_for_user(str(user["id"]))
        plan_name = str(subscription["plan"])
        user_limit = get_generation_limit(plan_name)

        if is_user_limited(str(user["id"]), user_limit):
            return usage_limit_error()

        try:
            plan = generate_trip_plan(request.prompt)
            record_user_generation(str(user["id"]))
            return save_plan(plan=plan, prompt=request.prompt, owner_type=plan_name)
        except Exception as exc:
            logger.exception("Failed to generate trip: %s", exc)
            return JSONResponse(
                status_code=500,
                content=ErrorResponse(
                    error="failed_to_generate_trip",
                    message="旅行プランの生成に失敗しました",
                ).model_dump(),
            )

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
    authorization: str | None = Header(default=None, alias="Authorization"),
    anonymous_id: str | None = Cookie(default=None, alias=ANONYMOUS_COOKIE_NAME),
    session_cookie: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> UsageStatusResponse:
    user = get_user_from_token(extract_bearer_token(authorization) or session_cookie)
    if user is not None:
        subscription = get_subscription_for_user(str(user["id"]))
        plan_name = str(subscription["plan"])
        user_limit = get_generation_limit(plan_name)
        used = get_user_usage(str(user["id"]))
        return UsageStatusResponse(
            plan=plan_name,
            limit=user_limit,
            used=used,
            remaining=max(user_limit - used, 0),
            resetAt=next_utc_midnight(datetime.now(UTC)).isoformat(),
        )

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


@app.post(
    "/api/auth/register",
    response_model=AuthResponse,
    responses={409: {"model": ErrorResponse}},
)
async def register(request: AuthRequest, response: Response) -> AuthResponse | JSONResponse:
    email = normalize_email(request.email)

    if email in users_by_email:
        return JSONResponse(
            status_code=409,
            content=ErrorResponse(
                error="email_already_registered",
                message="このメールアドレスは登録済みです",
            ).model_dump(),
        )

    user_id = uuid4().hex
    users[user_id] = {
        "id": user_id,
        "email": email,
        "display_name": request.display_name,
        "password_hash": hash_password(request.password),
        "created_at": datetime.now(UTC),
        "last_login_at": datetime.now(UTC),
    }
    users_by_email[email] = user_id
    subscriptions[user_id] = create_free_subscription(user_id)

    token = create_session(user_id, response)
    return AuthResponse(user=build_user_response(users[user_id]), access_token=token)


@app.post(
    "/api/auth/login",
    response_model=AuthResponse,
    responses={401: {"model": ErrorResponse}},
)
async def login(request: AuthRequest, response: Response) -> AuthResponse | JSONResponse:
    user_id = users_by_email.get(normalize_email(request.email))

    if user_id is None:
        return invalid_login_response()

    user = users[user_id]
    if not verify_password(request.password, str(user["password_hash"])):
        return invalid_login_response()

    user["last_login_at"] = datetime.now(UTC)
    token = create_session(user_id, response)
    return AuthResponse(user=build_user_response(user), access_token=token)


@app.post("/api/auth/logout")
async def logout(
    response: Response,
    authorization: str | None = Header(default=None, alias="Authorization"),
    session_cookie: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> dict[str, bool]:
    token = extract_bearer_token(authorization) or session_cookie
    if token is not None:
        sessions.pop(token, None)
    response.delete_cookie(SESSION_COOKIE_NAME)
    return {"ok": True}


@app.get(
    "/api/me",
    response_model=UserResponse,
    responses={401: {"model": ErrorResponse}},
)
async def get_me(
    authorization: str | None = Header(default=None, alias="Authorization"),
    session_cookie: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> UserResponse | JSONResponse:
    user = get_user_from_token(extract_bearer_token(authorization) or session_cookie)
    if user is None:
        return unauthorized_response()
    return build_user_response(user)


@app.get("/api/me/subscription", response_model=SubscriptionResponse)
async def get_my_subscription(
    authorization: str | None = Header(default=None, alias="Authorization"),
    session_cookie: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> SubscriptionResponse:
    user = get_user_from_token(extract_bearer_token(authorization) or session_cookie)

    if user is None:
        status = usage_limiter.get_anonymous_status("anonymous-preview")
        return SubscriptionResponse(
            plan="anonymous",
            status="active",
            provider=None,
            current_period_end=status.reset_at.isoformat(),
            generation_limit=status.limit,
            generation_remaining=status.remaining,
        )

    subscription = get_subscription_for_user(str(user["id"]))
    plan_name = str(subscription["plan"])
    limit = get_generation_limit(plan_name)
    return SubscriptionResponse(
        plan=plan_name,
        status=str(subscription["status"]),
        provider=subscription.get("provider"),
        current_period_end=format_optional_datetime(subscription.get("current_period_end")),
        generation_limit=limit,
        generation_remaining=max(limit - get_user_usage(str(user["id"])), 0),
    )


@app.post(
    "/api/billing/paypay/checkout",
    response_model=CheckoutResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}},
)
async def create_paypay_checkout(
    request: CheckoutRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    session_cookie: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> CheckoutResponse | JSONResponse:
    return create_checkout_response("paypay", request, authorization, session_cookie)


@app.post(
    "/api/billing/square/checkout",
    response_model=CheckoutResponse,
    responses={400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}},
)
async def create_square_checkout(
    request: CheckoutRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    session_cookie: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> CheckoutResponse | JSONResponse:
    return create_checkout_response("square", request, authorization, session_cookie)


@app.post("/api/webhooks/paypay", response_model=WebhookResponse)
async def paypay_webhook(
    request: Request,
    x_paypay_signature: str | None = Header(default=None, alias="X-PayPay-Signature"),
) -> WebhookResponse | JSONResponse:
    return await handle_billing_webhook("paypay", request, x_paypay_signature)


@app.post("/api/webhooks/square", response_model=WebhookResponse)
async def square_webhook(
    request: Request,
    x_square_signature: str | None = Header(default=None, alias="X-Square-Signature"),
) -> WebhookResponse | JSONResponse:
    return await handle_billing_webhook("square", request, x_square_signature)


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


def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        120_000,
    ).hex()
    return f"pbkdf2_sha256${salt}${digest}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, salt, expected_digest = stored_hash.split("$", maxsplit=2)
    except ValueError:
        return False

    if algorithm != "pbkdf2_sha256":
        return False

    digest = pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        120_000,
    ).hex()
    return compare_digest(digest, expected_digest)


def create_session(user_id: str, response: Response) -> str:
    token = secrets.token_urlsafe(32)
    sessions[token] = user_id
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=60 * 60 * 24 * 30,
        httponly=True,
        secure=os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true",
        samesite="lax",
    )
    return token


def extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None

    return token


def get_user_from_token(token: str | None) -> dict[str, object] | None:
    if token is None:
        return None

    user_id = sessions.get(token)
    if user_id is None:
        return None

    return users.get(user_id)


def create_free_subscription(user_id: str) -> dict[str, object]:
    now = datetime.now(UTC)
    return {
        "id": uuid4().hex,
        "user_id": user_id,
        "plan": "free",
        "status": "active",
        "provider": None,
        "provider_customer_id": None,
        "provider_subscription_id": None,
        "current_period_start": now,
        "current_period_end": None,
        "created_at": now,
        "updated_at": now,
    }


def get_subscription_for_user(user_id: str) -> dict[str, object]:
    subscription = subscriptions.get(user_id)
    if subscription is None:
        subscription = create_free_subscription(user_id)
        subscriptions[user_id] = subscription
    return subscription


def get_generation_limit(plan_name: str) -> int:
    plan = get_plan_definition(plan_name)
    if plan is not None:
        return plan.generation_limit

    return usage_limiter.anonymous_daily_limit


def current_usage_key() -> str:
    return datetime.now(UTC).date().isoformat()


def get_user_usage(user_id: str) -> int:
    return user_usage_counts[(user_id, current_usage_key())]


def is_user_limited(user_id: str, limit: int) -> bool:
    return get_user_usage(user_id) >= limit


def record_user_generation(user_id: str) -> None:
    user_usage_counts[(user_id, current_usage_key())] += 1


def build_user_response(user: dict[str, object]) -> UserResponse:
    subscription = get_subscription_for_user(str(user["id"]))
    return UserResponse(
        id=str(user["id"]),
        email=str(user["email"]),
        display_name=user.get("display_name"),
        plan=str(subscription["plan"]),
    )


def invalid_login_response() -> JSONResponse:
    return JSONResponse(
        status_code=401,
        content=ErrorResponse(
            error="invalid_credentials",
            message="メールアドレスまたはパスワードが違います",
        ).model_dump(),
    )


def unauthorized_response() -> JSONResponse:
    return JSONResponse(
        status_code=401,
        content=ErrorResponse(
            error="authentication_required",
            message="ログインが必要です",
        ).model_dump(),
    )


def create_checkout_response(
    provider_name: str,
    request: CheckoutRequest,
    authorization: str | None,
    session_cookie: str | None,
) -> CheckoutResponse | JSONResponse:
    user = get_user_from_token(extract_bearer_token(authorization) or session_cookie)
    if user is None:
        return unauthorized_response()

    plan = get_plan_definition(request.plan)
    if plan is None or plan.name == "free":
        return JSONResponse(
            status_code=400,
            content=ErrorResponse(
                error="invalid_plan",
                message="有効な有料プランを選択してください",
            ).model_dump(),
        )

    provider = get_billing_provider(provider_name)
    checkout = provider.create_checkout(str(user["id"]), plan)
    payments[checkout.checkout_id] = {
        "id": uuid4().hex,
        "user_id": user["id"],
        "provider": provider_name,
        "provider_payment_id": checkout.checkout_id,
        "plan": plan.name,
        "amount": plan.amount,
        "currency": plan.currency,
        "status": "pending",
        "raw_event_json": None,
        "created_at": datetime.now(UTC),
    }

    return CheckoutResponse(
        provider=checkout.provider,
        checkout_id=checkout.checkout_id,
        checkout_url=checkout.checkout_url,
        amount=checkout.amount,
        currency=checkout.currency,
    )


async def handle_billing_webhook(
    provider_name: str,
    request: Request,
    signature: str | None,
) -> WebhookResponse | JSONResponse:
    body = await request.body()
    provider = get_billing_provider(provider_name)

    if not provider.verify_webhook(body, signature):
        return JSONResponse(
            status_code=401,
            content=ErrorResponse(
                error="invalid_webhook_signature",
                message="Webhook署名が無効です",
            ).model_dump(),
        )

    event = json.loads(body)
    event_id = str(event.get("event_id") or event.get("id") or "")
    provider_payment_id = str(event.get("provider_payment_id") or event.get("payment_id") or "")
    status = str(event.get("status") or "")

    if not event_id or not provider_payment_id:
        return JSONResponse(
            status_code=400,
            content=ErrorResponse(
                error="invalid_webhook_payload",
                message="Webhook payload が不正です",
            ).model_dump(),
        )

    event_key = (provider_name, event_id)
    if event_key in processed_webhook_events:
        return WebhookResponse(received=True, status="duplicate_ignored")

    payment = payments.get(provider_payment_id)
    if payment is None:
        return JSONResponse(
            status_code=404,
            content=ErrorResponse(
                error="payment_not_found",
                message="対象の支払いが見つかりません",
            ).model_dump(),
        )

    processed_webhook_events.add(event_key)
    payment["status"] = normalize_payment_status(status)
    payment["raw_event_json"] = event

    if payment["status"] == "succeeded":
        activate_paid_subscription(payment, provider_name)
    elif payment["status"] in {"failed", "canceled", "refunded"}:
        downgrade_subscription(str(payment["user_id"]))

    return WebhookResponse(received=True, status=str(payment["status"]))


def normalize_payment_status(status: str) -> str:
    normalized = status.lower()
    if normalized in {"paid", "completed", "success", "succeeded"}:
        return "succeeded"
    if normalized in {"cancelled", "canceled"}:
        return "canceled"
    if normalized in {"refund", "refunded"}:
        return "refunded"
    if normalized in {"failed", "failure"}:
        return "failed"
    return normalized or "unknown"


def activate_paid_subscription(payment: dict[str, object], provider_name: str) -> None:
    now = datetime.now(UTC)
    subscriptions[str(payment["user_id"])] = {
        "id": uuid4().hex,
        "user_id": payment["user_id"],
        "plan": payment["plan"],
        "status": "active",
        "provider": provider_name,
        "provider_customer_id": None,
        "provider_subscription_id": payment["provider_payment_id"],
        "current_period_start": now,
        "current_period_end": now + timedelta(days=30),
        "created_at": now,
        "updated_at": now,
    }


def downgrade_subscription(user_id: str) -> None:
    subscriptions[user_id] = create_free_subscription(user_id)


def get_billing_provider(provider_name: str) -> PayPayProvider | SquareProvider:
    if provider_name == "paypay":
        return paypay_provider
    if provider_name == "square":
        return square_provider
    raise RuntimeError(f"Unsupported billing provider: {provider_name}")


def format_optional_datetime(value: object) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    return None


def build_plan_response(plan_id: str, plan: object) -> TripPlanResponse:
    if not isinstance(plan, TripPlan):
        raise RuntimeError("Stored plan has an invalid type")

    return TripPlanResponse(
        **plan.model_dump(),
        id=plan_id,
        share_url=f"{PLAN_SHARE_BASE_URL.rstrip('/')}/{plan_id}",
    )


handler = Mangum(app)
