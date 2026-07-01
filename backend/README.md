# Backend

旅行プランナーアプリの Python/FastAPI バックエンドです。

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

`POST /api/generate-trip` を呼ぶ前に、`backend/.env` に `OPENAI_API_KEY` を設定してください。

## Environment variables

- `OPENAI_API_KEY`: OpenAI APIキー
- `OPENAI_MODEL`: 旅行プラン生成に使うモデル。未設定時は `gpt-4.1-mini`
- `PLAN_SHARE_BASE_URL`: 共有URLのベースパス。未設定時は `/plan`
- `ANONYMOUS_DAILY_USAGE_LIMIT`: 未ログインユーザーの日次生成上限。未設定時は `3`
- `IP_DAILY_USAGE_LIMIT`: IP単位の補助的な日次生成上限。未設定時は `30`
- `PUBLIC_API_KEY_HASHES`: 外部API用キーのSHA-256ハッシュ。カンマ区切り
- `PUBLIC_API_DAILY_LIMIT`: 外部APIクライアントの日次生成上限。未設定時は `20`
- `SESSION_COOKIE_SECURE`: `true` の場合、ログインセッションCookieへ `Secure` を付与
- `PAYPAY_WEBHOOK_SECRET`: PayPay Webhook署名検証用シークレット
- `SQUARE_WEBHOOK_SECRET`: Square Webhook署名検証用シークレット

## Endpoints

- `GET /health`
- `GET /api/me/usage`
- `GET /api/me`
- `GET /api/me/subscription`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/generate-trip`
- `POST /api/billing/paypay/checkout`
- `POST /api/billing/square/checkout`
- `POST /api/webhooks/paypay`
- `POST /api/webhooks/square`
- `POST /api/public/generate-trip`
- `GET /api/public/plans/{plan_id}`

## Docker での実行

```bash
cd backend
docker build -t travel-planner-backend .
docker run --rm -p 8080:8080 \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  travel-planner-backend
```

Lambda コンテナとして使う場合は、`Dockerfile` のまま ECR にプッシュし、`app.main.handler` を Lambda ハンドラーに設定します。

## リクエスト例

```bash
curl -X POST http://127.0.0.1:8000/api/generate-trip \
  -H "Content-Type: application/json" \
  -d '{"prompt":"明日、東京から日帰りで鎌倉に行きたい。海とカフェと寺を入れて。"}'
```

## Troubleshooting

バックエンドログを確認してください。

```json
{
  "200 OK": "成功",
  "500": "バックエンドまたはOpenAI APIのエラー。tracebackを確認。",
  "429 insufficient_quota": "OpenAIの利用枠不足。課金設定または利用上限を確認。",
  "401/403": "APIキーまたは権限の問題。backend/.env と Chat Completions 権限を確認。"
}
```
