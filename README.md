# Naturali FBA管理システム

AmazonFBA納品業務の管理システム。  
Logiless APIから商品マスタ・在庫データを取得し、在庫管理・洗い出し・納品プラン作成を行う。

## フェーズ

### Phase 1（現在）
| # | 機能 | 状況 |
|---|------|------|
| 1 | **在庫同期** — Logiless APIから全SKUの在庫数を取得しDBに保存 | 完了 |
| 2 | **在庫一覧** — ロジレス在庫・ロケーション・出荷期限を一画面で確認 | 完了 |
| 3 | **在庫洗い出し** — 閾値以下の商品を自動検出、次回入荷情報の手動入力 | 完了 |
| 4 | **仮プラン作成** — 業務ルールに基づく納品数の自動計算 | 画面あり（FBA在庫・売上データはSP-API連携後） |
| 5 | **ロジレス受注登録** — 納品プランをLogiless APIに受注伝票として登録 | コードあり（SP-API連携後に本番運用可能） |

### Phase 2（SP-API取得後）
| # | 機能 |
|---|------|
| 6 | FBA在庫・売上データの自動同期（SP-API → DB、毎日バッチ） |
| 7 | Seller Centralでの納品プラン自動作成（SP-API） |
| 8 | FNSKUラベルの自動取得・Supabase Storageに保存 |

> Phase 2が完了するとPhase 1の仮プラン作成・受注登録がFBA在庫・売上データ付きで本番運用可能になる

## 技術スタック

| 役割 | 技術 |
|---|---|
| フロントエンド / API | Next.js 16 (App Router) + TypeScript |
| DB | Supabase (PostgreSQL) |
| ORM | Prisma |
| 認証 | Supabase Auth |
| スタイリング | Tailwind CSS |
| 外部API | Logiless API (OAuth2) |

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
npx prisma generate

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

## ディレクトリ構成

```
src/
├── app/
│   ├── (auth)/login/                # ログイン画面
│   ├── (dashboard)/
│   │   ├── inventory/               # 在庫一覧
│   │   ├── inventory-check/         # 在庫洗い出し
│   │   ├── provisional-plan/        # 仮プラン作成
│   │   └── delivery-plan/           # 納品プラン管理
│   └── api/
│       ├── sync/
│       │   ├── articles/            # 商品マスタ同期（詳細取得）
│       │   └── inventory/           # ロット別在庫同期
│       ├── logiless/
│       │   ├── authorize/           # OAuth2認可開始
│       │   └── callback/            # OAuth2コールバック
│       ├── products/arrival/        # 次回入荷情報更新
│       ├── delivery-plan/
│       │   ├── calculate/           # 納品数計算
│       │   └── create/              # プラン作成・ロジレス登録
│       └── notify/                  # Discord/Chatwork通知
├── lib/
│   ├── db.ts                        # Prismaクライアント
│   ├── product-colors.ts            # 商品カラー判定
│   ├── logiless/
│   │   ├── client.ts                # Logiless APIクライアント（OAuth2 + リトライ）
│   │   ├── types.ts                 # 型定義
│   │   └── categories.ts            # SKUカテゴリ判定
│   ├── delivery/                    # 納品数計算エンジン
│   ├── notify.ts                    # 通知ユーティリティ
│   ├── supabase.ts                  # Supabaseブラウザクライアント
│   └── supabase-server.ts           # Supabaseサーバークライアント
└── middleware.ts                    # 認証ミドルウェア
```

## 主要API

### `POST /api/sync/articles`
Logiless商品マスタを全件同期。一覧APIで全商品のidentification_codeを取得後、1件ずつ詳細API（FNSKU、フリー項目、原価等）を取得してDBに保存。初回は約9分かかる。

### `POST /api/sync/inventory`
Logilessからロット別在庫（LotNumberレベル）を取得してDBに同期。ロケーション・出荷期限・ロット番号付き。

### `PUT /api/products/arrival`
次回入荷予定日・次回入荷数を手動更新。

### `POST /api/delivery-plan/calculate`
業務ルールに基づいて納品予定数を計算する（DB保存なし）。

### `POST /api/delivery-plan/create`
納品プランをDBに保存しロジレスに受注登録する。

## 在庫洗い出し閾値

| 枚数 | 度なし | 度あり |
|------|--------|--------|
| 10枚入 | 300未満 | 30未満 |
| 30枚入 | 150未満 | 20未満 |
