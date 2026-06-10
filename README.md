# Naturali FBA管理システム

AmazonFBA納品業務の管理システム。  
Logiless APIから商品マスタ・在庫データを取得し、在庫管理・洗い出し・納品プラン作成を行う。

## フェーズ

### Phase 1（完了）
| # | 機能 | 状況 |
|---|------|------|
| 1 | **在庫同期** — Logiless APIから全SKUの在庫数を取得しDBに保存 | 完了 |
| 2 | **在庫一覧** — ロジレス在庫・ロケーション・出荷期限を一画面で確認 | 完了 |
| 3 | **在庫洗い出し** — 閾値以下の商品を自動検出、次回入荷情報の手動入力 | 完了 |
| 4 | **仮プラン作成** — 業務ルールに基づく納品数の自動計算（カラー単位・前回の続き対応） | 完了 |
| 5 | **ロジレス受注登録** — 納品プランをLogiless APIに受注伝票として登録（Dropbox CSV出力・Discord通知付き） | 完了 |

### Phase 2（SP-API連携）
| # | 機能 | 状況 |
|---|------|------|
| 6 | FBA在庫・ASINの自動同期（SP-API → DB） | 実装済み |
| 7 | FBA上限・入荷予定のCSVインポート（週次） | 実装済み |
| 8 | 売上データの自動同期（SP-API） | 未実装 |
| 9 | Seller Centralでの納品プラン自動作成（SP-API） | 計画中 |
| 10 | FNSKUラベルの自動取得・Supabase Storageに保存 | 計画中 |

## 技術スタック

| 役割 | 技術 |
|---|---|
| フロントエンド / API | Next.js 16 (App Router) + TypeScript |
| DB | Supabase (PostgreSQL) |
| ORM | Prisma |
| 認証 | Supabase Auth |
| スタイリング | Tailwind CSS |
| 外部API | Logiless API (OAuth2), Amazon SP-API, Dropbox API |
| 通知 | Discord Webhook, Chatwork API |

## セットアップ

```bash
# 依存関係インストール
npm install

# 環境変数設定
cp .env.example .env
# .env を編集

# DBスキーマ反映
npm run db:push

# Prisma Client生成
npm run db:generate

# 開発サーバー起動
npm run dev
```

### Logiless OAuth2認証（初回のみ）

1. `npm run dev` でサーバー起動
2. `http://localhost:3000/api/logiless/authorize` にアクセス
3. Logiless認可画面で許可
4. トークンがDBに自動保存される

### Dropbox OAuth2認証（初回のみ）

1. `http://localhost:3000/api/dropbox/authorize` にアクセス
2. Dropbox認可画面で許可
3. トークンがDBに自動保存される（納品プランCSVのアップロードに使用）

## 環境変数

| 変数 | 説明 |
|---|---|
| `DATABASE_URL` | Supabase DB接続文字列 |
| `DIRECT_URL` | Supabase DB直接接続文字列 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `LOGILESS_CLIENT_ID` | Logiless OAuth2 Client ID |
| `LOGILESS_CLIENT_SECRET` | Logiless OAuth2 Client Secret |
| `LOGILESS_REDIRECT_URI` | Logiless OAuth2 Redirect URI |
| `LOGILESS_MERCHANT_ID` | Logiless Merchant ID |
| `LOGILESS_BASE_URL` | Logiless API Base URL |
| `SP_API_CLIENT_ID` | Amazon SP-API LWA Client ID |
| `SP_API_CLIENT_SECRET` | Amazon SP-API LWA Client Secret |
| `SP_API_REFRESH_TOKEN` | Amazon SP-API Refresh Token |
| `SP_API_MARKETPLACE_ID` | AmazonマーケットプレイスID |
| `DROPBOX_APP_KEY` | Dropbox App Key |
| `DROPBOX_APP_SECRET` | Dropbox App Secret |
| `DROPBOX_REDIRECT_URI` | Dropbox OAuth2 Redirect URI |
| `DROPBOX_FOLDER_PATH` | 納品プランCSVのアップロード先（デフォルト: `/納品プラン`） |
| `DISCORD_WEBHOOK_URL` | Discord通知用Webhook URL |
| `CHATWORK_API_TOKEN` | Chatwork APIトークン |
| `CHATWORK_ROOM_ID` | Chatwork通知先ルームID |
| `CRON_SECRET` | 同期APIをcronから叩くときの認証シークレット |

## ディレクトリ構成

```
src/
├── app/
│   ├── (auth)/login/                # ログイン画面
│   ├── (dashboard)/
│   │   ├── inventory/               # 在庫一覧
│   │   │   └── fba-limits/          # FBA上限CSVインポート
│   │   ├── inventory-check/         # 在庫洗い出し
│   │   ├── provisional-plan/        # 仮プラン作成
│   │   └── delivery-plan/           # 納品プラン管理
│   └── api/
│       ├── sync/
│       │   ├── articles/            # 商品マスタ同期（詳細取得）
│       │   ├── inventory/           # ロット別在庫同期
│       │   └── fba-inventory/       # FBA在庫・ASIN同期（SP-API）
│       ├── logiless/
│       │   ├── authorize/           # OAuth2認可開始
│       │   └── callback/            # OAuth2コールバック
│       ├── dropbox/
│       │   ├── authorize/           # OAuth2認可開始
│       │   └── callback/            # OAuth2コールバック
│       ├── products/arrival/        # 次回入荷情報更新
│       ├── fba-limits/import/       # FBA上限指定CSVインポート
│       ├── inventory-check/         # 在庫洗い出し実行
│       ├── delivery-plan/
│       │   ├── calculate/           # 納品数計算
│       │   ├── create/              # プラン作成・ロジレス登録
│       │   ├── end-position/        # 前回計算の終了位置取得
│       │   └── [id]/cancel/         # プランキャンセル
│       ├── sp-api/test/             # SP-API疎通確認
│       └── notify/                  # Discord/Chatwork通知
├── lib/
│   ├── db.ts                        # Prismaクライアント（シングルトン）
│   ├── product-colors.ts            # 商品名からのカラー判定
│   ├── inventory-check.ts           # 在庫洗い出しロジック（閾値判定）
│   ├── logiless/
│   │   ├── client.ts                # Logiless APIクライアント（OAuth2 + リトライ）
│   │   ├── types.ts                 # 型定義
│   │   └── categories.ts            # SKUカテゴリ判定
│   ├── delivery/
│   │   ├── calculator.ts            # 納品数計算エンジン（カラー単位・超過許容・翌日回し）
│   │   ├── plan-grouping.ts         # プラン分割（first-fit、3カラー5SKU300点）
│   │   ├── shipment-schedule.ts     # 週次出荷スケジュール（作業曜日→出荷曜日）
│   │   ├── csv.ts                   # 納品プランCSV生成
│   │   └── types.ts                 # 型定義
│   ├── sp-api/                      # Amazon SP-APIクライアント
│   ├── dropbox/                     # Dropbox APIクライアント
│   ├── fba-limits/                  # FBA上限CSVパーサ
│   ├── notify.ts                    # Discord/Chatwork通知ユーティリティ
│   ├── supabase.ts                  # Supabaseブラウザクライアント
│   └── supabase-server.ts           # Supabaseサーバークライアント
└── middleware.ts                    # 認証ミドルウェア
```

## 主要API

### `POST /api/sync/articles`
Logiless商品マスタを全件同期。一覧APIで全商品のidentification_codeを取得後、1件ずつ詳細API（FNSKU、フリー項目、原価等）を取得してDBに保存。初回は約9分かかる。

### `POST /api/sync/inventory`
Logilessからロット別在庫（LotNumberレベル）を取得してDBに同期。ロケーション・出荷期限・ロット番号付き。

### `POST /api/sync/fba-inventory`
SP-APIからFBA在庫数・ASINを取得してDBに同期。

### `POST /api/fba-limits/import`
FBA上限指定CSV（SKU・上限指定）を取り込み、FBA上限・上限メモを更新。

### `PUT /api/products/arrival`
次回入荷予定日・次回入荷数を手動更新。

### `POST /api/delivery-plan/calculate`
業務ルールに基づいて納品予定数を計算する（DB保存なし）。保存済みの終了位置があれば「前回の続き」のカラーから計算を開始する。

### `POST /api/delivery-plan/create`
納品プランをDBに保存しロジレスに受注登録する。あわせて計算の終了位置を保存し、DropboxへのCSVアップロードとDiscord通知を行う。

### `GET /api/delivery-plan/end-position?productType=...`
保存済みの仮プラン計算の終了位置（カテゴリ・カラー・最後のSKU・翌日回しカラー）を返す。

### `POST /api/delivery-plan/[id]/cancel`
納品プランをキャンセルする。

## 仮プラン作成の業務ルール

### 週次スケジュール（作業曜日 → 出荷曜日）

| 作業日 | 出荷分 | 種別・目標点数 |
|--------|--------|---------------|
| 月曜 | 水曜日出荷分 | 度あり・500点 |
| 火曜 | 木曜日出荷分 | 度あり・500点 |
| 水曜 | 金曜日出荷分 | 度あり・500点 |
| 木曜 | 翌週火曜日出荷分（翌週月曜が祝日なら水曜） | 度なし・1000点 |
| 金土日 | プラン作成なし | — |

### 納品数計算

- カラー（商品名から判定）単位で積み上げる。カラーは丸ごと入れるか丸ごと外すか（途中で切らない）
- 丸ごと入れて許容上限（**度あり: 目標+200点 = 700点 / 度なし: 目標のまま = 1000点**）を超えるカラーは「翌日回し」として除外し、計算を終了する
- プラン登録時に終了位置（カテゴリ・カラー・最後のSKU・翌日回しカラー）をDBに保存し、翌日はそのカラーの次（＝翌日回しカラー）から計算を開始する

### プラン分割

- 1プランの合計は300点まで（ハード上限）
- カラーはプランをまたいで分割しない（300点を超える単独カラーを除く）
- 各カラーは丸ごと入る最初のプランに詰める（first-fit）。カラー混在プランは3カラー・5SKUまで、単独カラーのプランはSKU数制限なし

## 在庫洗い出し閾値

| 枚数 | 度なし | 度あり |
|------|--------|--------|
| 10枚入 | 300未満 | 50未満 |
| 30枚入 | 150未満 | 50未満 |
