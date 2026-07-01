import json
import logging
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from mangum import Mangum
from openai import OpenAI

from .schemas import ErrorResponse, GenerateTripRequest, TripPlan, TripPlanResponse


load_dotenv()


logger = logging.getLogger(__name__)


OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
PLAN_SHARE_BASE_URL = os.getenv("PLAN_SHARE_BASE_URL", "/plan")


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
    responses={500: {"model": ErrorResponse}},
)
async def generate_trip(request: GenerateTripRequest) -> TripPlanResponse | JSONResponse:
    try:
        plan = generate_trip_plan(request.prompt)
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


def build_plan_response(plan_id: str, plan: object) -> TripPlanResponse:
    if not isinstance(plan, TripPlan):
        raise RuntimeError("Stored plan has an invalid type")

    return TripPlanResponse(
        **plan.model_dump(),
        id=plan_id,
        share_url=f"{PLAN_SHARE_BASE_URL.rstrip('/')}/{plan_id}",
    )


handler = Mangum(app)
