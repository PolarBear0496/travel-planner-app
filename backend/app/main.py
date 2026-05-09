import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from openai import OpenAI

from .schemas import ErrorResponse, GenerateTripRequest, TripPlan


load_dotenv()


OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")


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
    response_model=TripPlan,
    responses={500: {"model": ErrorResponse}},
)
async def generate_trip(request: GenerateTripRequest) -> TripPlan | JSONResponse:
    try:
        if client is None:
            raise RuntimeError("OPENAI_API_KEY is not set")

        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": request.prompt},
            ],
            response_format={"type": "json_object"},
        )

        content = response.choices[0].message.content
        if content is None:
            raise RuntimeError("OpenAI response content is empty")

        plan_data = json.loads(content)
        return TripPlan.model_validate(plan_data)
    except Exception:
        return JSONResponse(
            status_code=500,
            content=ErrorResponse(
                error="failed_to_generate_trip",
                message="旅行プランの生成に失敗しました",
            ).model_dump(),
        )
