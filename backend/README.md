# Backend

Python/FastAPI backend for the travel planner app.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Set `OPENAI_API_KEY` in `backend/.env` before calling `POST /api/generate-trip`.

## Environment variables

- `OPENAI_API_KEY`: OpenAI API key.
- `OPENAI_MODEL`: Model used for trip generation. Defaults to `gpt-4.1-mini`.
- `PLAN_SHARE_BASE_URL`: Base path for shared plan URLs. Defaults to `/plan`.
- `ANONYMOUS_DAILY_USAGE_LIMIT`: Daily generation limit for anonymous users. Defaults to `3`.
- `IP_DAILY_USAGE_LIMIT`: Supplemental daily generation limit per IP address. Defaults to `30`.
- `PUBLIC_API_KEY_HASHES`: Comma-separated SHA-256 hashes for public API keys.
- `PUBLIC_API_DAILY_LIMIT`: Daily generation limit for each public API client. Defaults to `20`.

## Endpoints

- `GET /health`
- `GET /api/me/usage`
- `POST /api/generate-trip`
- `POST /api/public/generate-trip`
- `GET /api/public/plans/{plan_id}`

## Example request

```bash
curl -X POST http://127.0.0.1:8000/api/generate-trip \
  -H "Content-Type: application/json" \
  -d '{"prompt":"明日、東京から日帰りで鎌倉に行きたい。海とカフェと寺を入れて。"}'
```
