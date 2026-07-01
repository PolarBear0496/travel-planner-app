# Twitter/LINE/APIからの呼び出し

## 目的

Twitter、LINE、外部サービスから会話の流れで旅行プラン作成を呼び出せるようにする。ユーザーがSNSで「週末どこ行く？」と話している文脈から、Webアプリへ自然に遷移し、必要に応じて結果を共有できる状態を目指す。

## 想定ユースケース

- LINEで友人と旅行相談中に、共有URLからプラン生成ページを開く。
- Twitter投稿のリンクから、投稿文を初期プロンプトとして旅行プランを作る。
- 外部Botや別アプリがAPI経由で旅行プランを生成する。
- 生成された旅行プランをURLで再共有する。

## 要件

- URLクエリから初期入力を受け取れる。
  - 例: `/plan?prompt=鎌倉で海とカフェ`
- 生成結果を共有可能なIDで保存できる。
- SNS向けOGPメタ情報を設定できる。
- 外部API利用者向けに認証方式を用意する。
- API呼び出し元、ユーザー、匿名ユーザーを区別して利用制限を適用する。
- LINE/Twitterアプリ内ブラウザでもログインや課金導線が破綻しない。

## 非要件

- Twitter APIやLINE Messaging APIへのBot実装は初期段階では必須にしない。
- 最初はWebリンク共有と外部API呼び出しに集中する。

## ルーティング案

- `/`
  - 軽量な生成入口
- `/plan/:planId`
  - 保存済み旅行プランの閲覧
- `/api/generate-trip`
  - Webアプリからの生成
- `/api/public/generate-trip`
  - 外部サービス向け生成API
- `/api/public/plans/:planId`
  - 外部サービス向けプラン取得API

## API認証案

- Webユーザー
  - Cookieまたは匿名ID
- 外部API
  - API Key
  - API Keyは平文では保存せず、SHA-256などでハッシュ化した値だけを保持する。
  - 初期実装では `PUBLIC_API_KEY_HASHES` にカンマ区切りのハッシュを設定し、リクエストの `X-API-Key` をハッシュ化して照合する。
  - 将来的にOAuthまたは署名付きリクエスト
- SNS共有URL
  - 認証不要で閲覧可能。ただし編集や再生成は利用制限対象。

## OGPメタ情報の方針

- 静的な `index.html` にプラン固有のtitle/descriptionを固定しない。
- `/plan/:planId` の共有URLを正とし、将来的にSSR、Edge Function、またはOGP画像生成APIでプラン別メタ情報を返す。
- フロントエンドは保存APIから返る `id` と `share_url` を表示・コピーするだけにし、OGP生成の責務をバックエンドまたは配信層へ寄せる。
- OGPに内部エラー、外部APIレスポンス、生の生成プロンプト全文を不用意に含めない。

## データ要件

- `plans`
  - `id`
  - `owner_user_id`
  - `anonymous_owner_id`
  - `title`
  - `destination`
  - `prompt`
  - `plan_json`
  - `visibility`
  - `created_at`
  - `expires_at`
- `api_clients`
  - `id`
  - `name`
  - `api_key_hash`
  - `rate_limit_per_day`
  - `created_at`

## エージェントへの実装指示

1. URLクエリ `prompt` を `SearchBar` の初期値に反映する。
2. 生成成功時にプラン保存APIへ保存し、共有URLを生成できる構造にする。
3. OGP情報を将来動的に差し替えられるよう、静的HTML依存を減らす方針を記録する。
4. 外部API用エンドポイントはWeb用エンドポイントと内部サービス関数を共有する。
5. API Keyは平文保存しない。ハッシュ化して保存する。
6. 外部APIのレスポンスには内部エラー詳細やOpenAIの生レスポンスを返さない。

## 完了条件

- `/plan?prompt=...` で入力欄に初期値が入る。
- 生成済みプランをIDで再表示する設計がある。
- Web利用と外部API利用を分けて制限できる。
- SNS共有を前提にしたURLとメタ情報の設計が文書化されている。
