# Naturali FBA管理システム

AmazonFBA納品業務の管理システム。
Logiless APIから商品マスタ・在庫データを取得し、SP-APIからFBA在庫を取得して、在庫管理・洗い出し・納品プラン作成を行う。

## フェーズ

### Phase 1（完了）
| # | 機能 | 状況 |
|---|------|------|
| 1 | **在庫同期** — Logiless APIから全SKUの在庫数を取得しDBに保存 | 完了 |
| 2 | **在庫一覧** — ロジレス在庫・ロケーション・出荷期限を一画面で確認 | 完了 |
| 3 | **在庫洗い出し** — 閾値以下の商品を自動検出、次回入荷情報の手動入力 | 完了 |
| 4 | **仮プラン作成** — 業務ルールに基づく納品数の自動計算 | 完了 |
| 5 | **ロジレス受注登録** — 納品プランをLogiless APIに受注伝票として登録 | 完了 |

### Phase 2（SP-API連携・進行中）
| # | 機能 | 状況 |
|---|------|------|
| 6 | **SP-API SKU/ASIN同期** — Amazon出品レポートからSKU・ASINを取得 | 完了 |
| 7 | **FBA在庫同期** — SP-APIからFBA在庫数を取得しDBに保存 | 完了 |
| 8 | **FBA容量上限取り込み** — CSVから各商品のFBA容量上限を取り込み | 完了 |
| 9 | Seller Centralでの納品プラン自動作成（SP-API） | 未実装 |
| 10 | FNSKUラベルの自動取得・Supabase Storageに保存 | 未実装 |

### Phase 3（Dropbox API連携・計画）
| # | 機能 |
|---|------|
| 11 | **FNSKUラベルPDFの自動アップロード** — Seller Centralから取得したSKUラベルPDFを Dropbox API 経由で `redect×ﾅﾁｭﾗﾘ/FBA` 配下に自動格納 |
| 12 | **出荷日フォルダの自動生成** — 出荷日（例: `20260109火出荷`）のフォルダを作成し、注文番号（STAyyyymmdd-n）ごとのPDFを配置 |
| 13 | **月次アーカイブ** — 月末に前月分フォルダを `使用済み_yyyymm` へ自動移動 |

> Phase 3が完了すると、現状デスクトップツール（`label_in_dropbox.exe`）で行っているDropboxへのバーコード追加作業がWebシステム内で完結する

## 技術スタック

| 役割 | 技術 |
|---|---|
| フロントエンド / API | Next.js 16 (App Router) + TypeScript |
| DB | Supabase (PostgreSQL) |
| ORM | Prisma 5 |
| 認証 | Supabase Auth |
| スタイリング | Tailwind CSS 3 |
| バリデーション | Zod |
| 外部API | Logiless API (OAuth2), Amazon SP-API |
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
| `SP_API_CLIENT_ID` | Amazon SP-API Client ID |
| `SP_API_CLIENT_SECRET` | Amazon SP-API Client Secret |
| `SP_API_REFRESH_TOKEN` | Amazon SP-API Refresh Token |
| `SP_API_MARKETPLACE_ID` | Amazon Marketplace ID（JP） |
| `DISCORD_WEBHOOK_URL` | Discord通知用Webhook URL |
| `CHATWORK_API_TOKEN` | Chatwork APIトークン |
| `CHATWORK_ROOM_ID` | Chatwork通知先ルームID |
| `NEXT_PUBLIC_APP_URL` | アプリのベースURL |
| `CRON_SECRET` | Cronジョブ用シークレット |

## ディレクトリ構成

```
src/
├── app/
│   ├── (auth)/login/                # ログイン画面
│   ├── (dashboard)/
│   │   ├── inventory/               # 在庫一覧
│   │   │   └── fba-limits/          # FBA容量上限CSV取り込み
│   │   ├── inventory-check/         # 在庫洗い出し
│   │   ├── provisional-plan/        # 仮プラン作成
│   │   └── delivery-plan/           # 納品プラン管理
│   └── api/
│       ├── sync/
│       │   ├── articles/            # 商品マスタ同期（Logiless）
│       │   ├── inventory/           # ロット別在庫同期（Logiless）
│       │   └── fba-inventory/       # FBA在庫同期（SP-API）
│       ├── logiless/
│       │   ├── authorize/           # OAuth2認可開始
│       │   └── callback/            # OAuth2コールバック
│       ├── sp-api/test/             # SP-API接続テスト
│       ├── products/arrival/        # 次回入荷情報更新
│       ├── inventory-check/         # 在庫不足チェック
│       ├── fba-limits/import/       # FBA容量上限CSV取り込み
│       ├── delivery-plan/
│       │   ├── calculate/           # 納品数計算
│       │   └── create/              # プラン作成・ロジレス登録
│       └── notify/                  # Discord/Chatwork通知
├── lib/
│   ├── db.ts                        # Prismaクライアント
│   ├── product-colors.ts            # 商品カラー判定
│   ├── inventory-check.ts           # 在庫閾値判定
│   ├── notify.ts                    # 通知ユーティリティ
│   ├── supabase.ts                  # Supabaseブラウザクライアント
│   ├── supabase-server.ts           # Supabaseサーバークライアント
│   ├── logiless/
│   │   ├── client.ts                # Logiless APIクライアント（OAuth2 + リトライ）
│   │   ├── types.ts                 # 型定義
│   │   └── categories.ts            # SKUカテゴリ判定
│   ├── sp-api/
│   │   └── client.ts                # Amazon SP-APIクライアント
│   ├── fba-limits/
│   │   └── csv-parser.ts            # FBA容量上限CSVパーサ
│   ├── delivery/                    # 納品数計算エンジン
│   └── sync/
│       └── stream.ts                # 同期処理のNDJSONストリーミング
└── middleware.ts                    # 認証ミドルウェア
```

## 主要API

### `POST /api/sync/articles`
Logiless商品マスタを全件同期。一覧APIで全商品のidentification_codeを取得後、1件ずつ詳細API（FNSKU、フリー項目、原価等）を取得してDBに保存。初回は約9分かかる。

### `POST /api/sync/inventory`
Logilessからロット別在庫（LotNumberレベル）を取得してDBに同期。ロケーション・出荷期限・ロット番号付き。

### `POST /api/sync/fba-inventory`
Amazon SP-APIからFBA在庫を取得してDBに同期。SKU・ASINの自動マッピングも実行。

### `POST /api/fba-limits/import`
Seller CentralからダウンロードしたCSVを取り込み、各商品のFBA容量上限を更新。

### `PUT /api/products/arrival`
次回入荷予定日・次回入荷数を手動更新。

### `POST /api/inventory-check`
在庫閾値を下回った商品を抽出（カテゴリ別にグループ化）。

### `POST /api/delivery-plan/calculate`
業務ルールに基づいて納品予定数を計算する（DB保存なし）。

### `POST /api/delivery-plan/create`
納品プランをDBに保存しロジレスに受注登録する。

## 在庫洗い出し閾値

| 枚数 | 度なし | 度あり |
|------|--------|--------|
| 10枚入 | 300未満 | 50未満 |
| 30枚入 | 150未満 | 50未満 |

## 開発コマンド

```bash
npm run dev          # 開発サーバー起動
npm run build        # ビルド（Prisma Client生成 + Next.jsビルド）
npm run lint         # ESLint
npm run db:generate  # Prisma Client生成
npm run db:push      # スキーマをDBに反映
npm run db:migrate   # マイグレーション作成
npm run db:studio    # Prisma Studio起動
```
