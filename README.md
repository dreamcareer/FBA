# Naturali FBA管理システム

Amazon FBA納品業務の管理システム。
Logiless APIから商品マスタ・在庫データを取得し、Amazon SP-APIからFBA在庫・売上・出品ステータスを取得して、在庫管理・洗い出し・納品プラン作成・出品者出荷切替を行う。

## フェーズ

### Phase 1（完了）
| # | 機能 | 状況 |
|---|------|------|
| 1 | **在庫同期** — Logiless APIから全SKUのロット別在庫数を取得しDBに保存 | 完了 |
| 2 | **在庫一覧** — ロジレス在庫・FBA在庫・ロケーション・出荷期限を一画面で確認 | 完了 |
| 3 | **在庫洗い出し** — 閾値以下の商品を自動検出、次回入荷情報の手動入力 | 完了 |
| 4 | **仮プラン作成** — 業務ルールに基づく納品数の自動計算（カラー単位・前回の続き対応） | 完了 |
| 5 | **ロジレス受注登録** — 納品プランをLogiless APIに受注伝票として登録（Dropbox CSV出力・Discord通知付き） | 完了 |

### Phase 2（SP-API連携）
| # | 機能 | 状況 |
|---|------|------|
| 6 | FBA在庫・ASINの自動同期（SP-API → DB） | 実装済み |
| 7 | FBA上限・在庫上限のCSVインポート（週次） | 実装済み |
| 8 | 売上データの自動同期（SP-API 売上・トラフィックレポート、3ヶ月・1年・親ASIN） | 実装済み |
| 9 | **出品者出荷切替** — 在庫切れで「停止中」になったFBA出品を検出し、出品者出荷(FBM)への切替と補充数を判定 | 実装済み |
| 10 | Seller Centralでの納品プラン自動作成（SP-API） | 計画中 |
| 11 | FNSKUラベルの自動取得・Supabase Storageに保存 | 計画中 |

## 技術スタック

| 役割 | 技術 |
|---|---|
| フロントエンド / API | Next.js 16 (App Router) + TypeScript |
| フロント | React 18 + Tailwind CSS 3 |
| DB | Supabase (PostgreSQL) |
| ORM | Prisma 5 |
| 認証 | Supabase Auth |
| 外部API | Logiless API (OAuth2), Amazon SP-API (LWA), Dropbox API (OAuth2) |
| 通知 | Discord Webhook, Chatwork API |
| バリデーション | Zod |
| 日付処理 | date-fns |

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
4. トークンが `oauth_tokens` テーブルに自動保存される（`provider="logiless"`）

### Dropbox OAuth2認証（初回のみ）

1. `http://localhost:3000/api/dropbox/authorize` にアクセス
2. Dropbox認可画面で許可
3. トークンが `oauth_tokens` テーブルに自動保存される（納品プランCSVのアップロードに使用）

### Amazon SP-API認証

SP-APIは LWA（Login with Amazon）の `refresh_token` をセルフ認可で発行し、環境変数 `SP_API_REFRESH_TOKEN` に保持する。
`access_token` は `oauth_tokens` テーブルに `provider="sp-api"` でキャッシュされ、期限5分前に自動リフレッシュ・401時に1回強制リフレッシュされる。

## 開発コマンド

```bash
npm run dev          # 開発サーバー起動
npm run build        # prisma generate + next build
npm run lint         # ESLint
npm run db:generate  # Prisma Client生成
npm run db:push      # スキーマをDBに反映（開発用）
npm run db:migrate   # マイグレーション作成
npm run db:studio    # Prisma Studio起動
```

## 環境変数

| 変数 | 説明 |
|---|---|
| `DATABASE_URL` | Supabase DB接続文字列 |
| `DIRECT_URL` | Supabase DB直接接続文字列（マイグレーション用） |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `LOGILESS_CLIENT_ID` | Logiless OAuth2 Client ID |
| `LOGILESS_CLIENT_SECRET` | Logiless OAuth2 Client Secret |
| `LOGILESS_REDIRECT_URI` | Logiless OAuth2 Redirect URI |
| `LOGILESS_MERCHANT_ID` | Logiless Merchant ID |
| `LOGILESS_BASE_URL` | Logiless API Base URL |
| `LOGILESS_STORE_ID` | 受注登録先のロジレス店舗ID（納品プラン作成で使用） |
| `SP_API_CLIENT_ID` | Amazon SP-API LWA Client ID |
| `SP_API_CLIENT_SECRET` | Amazon SP-API LWA Client Secret |
| `SP_API_REFRESH_TOKEN` | Amazon SP-API Refresh Token（セルフ認可で発行） |
| `SP_API_MARKETPLACE_ID` | AmazonマーケットプレイスID（JP: `A1VC38T7YXB528`） |
| `SP_API_SELLER_ID` | 出品者ID / Merchant Token（出品検索 `searchListings` に必須） |
| `DROPBOX_APP_KEY` | Dropbox App Key |
| `DROPBOX_APP_SECRET` | Dropbox App Secret |
| `DROPBOX_REDIRECT_URI` | Dropbox OAuth2 Redirect URI |
| `DROPBOX_FOLDER_PATH` | 納品プランCSVのアップロード先（デフォルト: `/納品プラン`） |
| `DISCORD_WEBHOOK_URL` | Discord通知用Webhook URL |
| `CHATWORK_API_TOKEN` | Chatwork APIトークン |
| `CHATWORK_ROOM_ID` | Chatwork通知先ルームID |
| `CRON_SECRET` | 同期・検出APIをcronから叩くときのBearer認証シークレット |

## ディレクトリ構成

```
src/
├── app/
│   ├── (auth)/login/                  # ログイン画面
│   ├── (dashboard)/
│   │   ├── inventory/                 # 在庫一覧（ロジレス在庫＋FBA在庫）
│   │   │   ├── fba-limits/            # FBA上限指定CSVインポート
│   │   │   └── stock-limits/          # 在庫上限CSVインポート（UpperReport）
│   │   ├── inventory-check/           # 在庫洗い出し
│   │   ├── provisional-plan/          # 仮プラン作成
│   │   ├── delivery-plan/             # 納品プラン管理
│   │   └── seller-switch/             # 出品者出荷切替（検出・補充数判定）
│   └── api/
│       ├── sync/
│       │   ├── articles/              # 商品マスタ同期（一覧→詳細取得）
│       │   ├── inventory/             # ロット別在庫同期（ロジレス）
│       │   ├── fba-inventory/         # FBA在庫・ASIN同期（SP-API）
│       │   └── sales-data/            # 売上データ同期（SP-API レポート）
│       ├── logiless/                  # OAuth2 authorize / callback
│       ├── dropbox/                   # OAuth2 authorize / callback
│       ├── products/arrival/          # 次回入荷情報更新
│       ├── fba-limits/import/         # FBA上限指定CSVインポート
│       ├── stock-limits/import/       # 在庫上限CSVインポート
│       ├── inventory-check/           # 在庫洗い出し実行
│       ├── delivery-plan/
│       │   ├── calculate/             # 納品数計算
│       │   ├── create/                # プラン作成・ロジレス登録・Dropbox・通知
│       │   ├── end-position/          # 前回計算の終了位置取得
│       │   └── [id]/cancel/           # プランキャンセル
│       ├── seller-switch/
│       │   ├── detect/                # 停止中×FBAの検出（スナップショット差分）
│       │   └── process/               # 切替済み化・補充数記録・取消
│       ├── sp-api/                    # SP-API 疎通・デバッグ用（test, listings-test, fba-updated-test）
│       └── notify/                    # Discord/Chatwork通知
├── lib/
│   ├── db.ts                          # Prismaクライアント（シングルトン）
│   ├── product-colors.ts              # 商品名からのカラー判定
│   ├── inventory-check.ts             # 在庫洗い出しロジック（パック判定・閾値判定）
│   ├── notify.ts                      # Discord/Chatwork通知ユーティリティ
│   ├── supabase.ts / supabase-server.ts  # Supabaseクライアント（ブラウザ / サーバー）
│   ├── logiless/
│   │   ├── client.ts                  # Logiless APIクライアント（OAuth2 + リトライ）
│   │   ├── categories.ts              # SKUカテゴリ判定
│   │   ├── locations.ts               # 在庫ロケーションの除外判定（販売不可・納品対象外）
│   │   └── types.ts                   # 型定義
│   ├── delivery/
│   │   ├── calculator.ts              # 納品数計算エンジン（カラー単位・超過許容・翌日回し）
│   │   ├── plan-grouping.ts           # プラン分割（first-fit、3カラー5SKU300点）
│   │   ├── shipment-schedule.ts       # 週次出荷スケジュール（作業曜日→出荷曜日）
│   │   ├── csv.ts                     # 納品プランCSV生成
│   │   └── types.ts                   # 型定義
│   ├── seller-switch/
│   │   ├── snapshot.ts                # 停止中×FBAのスナップショット取得・差分検出
│   │   ├── enrich.ts                  # 候補の判定付与（突合・進行中・補充数・除外）
│   │   ├── exclusions.ts              # 切替対象外判定（度なし・セット・mpb）
│   │   └── replenishment.ts           # 補充数の決定表（期限バケット別）
│   ├── sp-api/client.ts               # Amazon SP-APIクライアント（LWA・FBA在庫・出品・レポート）
│   ├── dropbox/client.ts              # Dropbox APIクライアント
│   ├── fba-limits/csv-parser.ts       # FBA上限/在庫上限CSVパーサ（Shift-JIS/UTF-8対応）
│   └── sync/stream.ts                 # NDJSON進捗ストリーミング共通ヘルパー
└── proxy.ts                           # 認証プロキシ（Next.js 16のミドルウェア相当）
```

## 認証

`src/proxy.ts`（Next.js 16の旧 `middleware.ts` 相当）でSupabaseセッションを検証する。

- 未ログインで保護ルートにアクセス → `/login` へリダイレクト
- ログイン済みで `/login` にアクセス → `/inventory` へリダイレクト
- `matcher` で `/api/*` と静的アセットは対象外（APIは各ルートで個別に認証）

APIルートの認証は2系統:

- **画面操作系**（`inventory-check`, `stock-limits/import`, `seller-switch/process` 等）: Supabaseセッションのみ
- **同期・検出系**（`sync/*`, `seller-switch/detect`, `sp-api/*`）: `Authorization: Bearer ${CRON_SECRET}`（cron想定）または Supabaseセッション

## 主要API

### 同期

| エンドポイント | 説明 |
|---|---|
| `POST /api/sync/articles` | Logiless商品マスタを全件同期。一覧APIで全 `identification_code` を取得後、1件ずつ詳細API（FNSKU等）を取得してDBに保存。初回は数分かかる。 |
| `POST /api/sync/inventory` | Logilessからロット別在庫（LotNumberレベル）を同期。ロケーション・出荷期限・ロット番号付き。 |
| `POST /api/sync/fba-inventory` | SP-APIからFBA在庫数（fulfillable）を同期。`?withAsin=true` のときのみASINも更新（商品マスタ再取得の一環）。 |
| `POST /api/sync/sales-data` | SP-API 売上・トラフィックレポートから直近3ヶ月・1年の販売数量・親ASINを取得し、`business_3m` / `business_1y` / `parent_asin` を更新。 |

> 同期系APIは `Accept: application/x-ndjson` を付けると進捗イベントをNDJSONでストリーミング配信する（未指定なら通常のJSONレスポンス）。

### 在庫・上限

| エンドポイント | 説明 |
|---|---|
| `POST /api/inventory-check` | 在庫閾値を下回った商品を抽出（カテゴリ別にグループ化）。 |
| `PUT /api/products/arrival` | 次回入荷予定日・次回入荷数を手動更新。 |
| `POST /api/fba-limits/import` | FBA上限指定CSV（SKU・上限指定）を取り込み、FBA上限・上限メモを更新。 |
| `POST /api/stock-limits/import` | 在庫上限CSVを取り込み `stock_upper_limit` を更新。SKU列、またはAmazon在庫計画レポート（Child_ASIN・Upper_Limit）の2形式に対応。 |

### 納品プラン

| エンドポイント | 説明 |
|---|---|
| `POST /api/delivery-plan/calculate` | 業務ルールに基づき納品予定数を計算（DB保存なし）。保存済みの終了位置があれば「前回の続き」のカラーから開始。 |
| `POST /api/delivery-plan/create` | プランをDBに保存しロジレスに受注登録。計算の終了位置を保存し、DropboxへのCSVアップロードとDiscord通知を行う。 |
| `GET /api/delivery-plan/end-position?productType=...` | 保存済みの計算終了位置（カテゴリ・カラー・最後のSKU・翌日回しカラー）を返す。 |
| `POST /api/delivery-plan/[id]/cancel` | 納品プランをキャンセルする。 |

### 出品者出荷切替

| エンドポイント | 説明 |
|---|---|
| `GET /api/seller-switch/detect` | 現在の切替候補（停止中×FBA）一覧を判定・補充数付きで返す。 |
| `POST /api/seller-switch/detect` | SP-API Listingsで停止中×FBAを再取得し、スナップショットと差分を取り新規SKUを検出（cron想定）。 |
| `POST /api/seller-switch/process` | 候補を「切替済み」にして補充数を記録（日報用）。`undo=true` で未処理に戻す。 |

### 通知

| エンドポイント | 説明 |
|---|---|
| `POST /api/notify` | Chatworkへの日報（`type:"daily"`）/ 週次サマリー（`type:"weekly"`）通知。 |

## 仮プラン作成の業務ルール

### 週次スケジュール（作業曜日 → 出荷曜日）

| 作業日 | 出荷分 | 種別・目標点数 |
|--------|--------|---------------|
| 月曜 | 水曜日出荷分 | 度あり・500点 |
| 火曜 | 木曜日出荷分 | 度あり・500点 |
| 水曜 | 金曜日出荷分 | 度あり・500点 |
| 木曜 | 翌週火曜日出荷分（翌週月曜が祝日なら水曜） | 度なし・1000点 |
| 金土日 | プラン作成なし | — |

### 納品数計算（`src/lib/delivery/calculator.ts`）

- **度あり**: min 10 / max 30 / step 10、通常時の目安在庫 20
- **度なし**: min 10 / max 100 / step 10、直近3ヶ月の月販 × 1.2 を目標
- **使用期限**: 14ヶ月未満のロットはスキップ、14〜18ヶ月は警告。期限なし（長期保存品）は納品可。期限の近い順（FIFO）に消費
- **除外ロケーション**: 不具合品・返送品・出荷期限切れ品・Amazon倉庫（`Amazon`+数字）・アウトレット専用・FBA専用（`src/lib/logiless/locations.ts`）
- **ロジレス在庫引当（残す在庫）**: 度あり25（Pixie 35）／度なし50（Pixie 300）
- カラー（商品名から判定）単位で積み上げ、カラーは丸ごと入れるか丸ごと外す（途中で切らない）
- 丸ごと入れて許容上限（**度あり: 目標+200点＝700点 / 度なし: 目標のまま＝1000点**）を超えるカラーは「翌日回し」として除外し計算終了
- プラン登録時に終了位置（カテゴリ・カラー・最後のSKU・翌日回しカラー）をDBに保存し、翌日はそのカラーの次から計算を開始

### プラン分割（`src/lib/delivery/plan-grouping.ts`）

- 1プランの合計は300点まで（ハード上限）
- カラーはプランをまたいで分割しない（300点を超える単独カラーを除く）
- 各カラーは丸ごと入る最初のプランに詰める（first-fit）。カラー混在プランは3カラー・5SKUまで、単独カラーのプランはSKU数制限なし

## 在庫洗い出し閾値（`src/lib/inventory-check.ts`）

| パック | 度なし | 度あり |
|------|--------|--------|
| 10枚入 | 300未満 | 50未満 |
| 30枚入 | 150未満 | 50未満 |

パック数（10P / 30P）はSKUの接頭辞から判定する。

## 出品者出荷切替の業務ルール

FBA在庫が切れて「停止中」になった出品を検出し、出品者出荷(FBM)へ切り替えて補充数を決める一連の手順をコード化したもの。

### ① 検出（`src/lib/seller-switch/snapshot.ts`）

- SP-API Listings（`withoutStatus=BUYABLE` ＝停止中相当、出荷元=Amazonのみ）で「停止中×FBA」の現在集合を取得
- 状態テーブル `fba_inactive_listings` と差分を取り、**前回に無かったSKU＝新たに在庫切れになったSKU**を検出（画面の「最終更新日」の代替）
- 既存SKUは `last_seen_at` を更新、在庫復活で集合から消えたSKUは削除（次に切れたら再び新規扱い）
- 初回（テーブルが空）は全件を基準として登録するのみ。SP-APIが0件を返した場合は障害の可能性があるためテーブルを変更しない

### ② 判定（`src/lib/seller-switch/enrich.ts`）

候補に商品マスタ・ロジレス在庫・進行中の納品プランを突き合わせ、優先順位で判定する:

| 判定 | 条件 |
|---|---|
| `EXCLUDED`（対象外） | マスタ未登録、度なし、セット商品（〇箱）、ミスティピーチブラウン（mpb） |
| `WAITING`（待ち） | 直近14日以内の進行中（DRAFT/SUBMITTED/SHIPPED）納品プランあり＝FBA納品が進行中 |
| `TARGET`（切替対象） | 上記以外で補充数 > 0 |
| `NO_STOCK`（在庫不足） | 補充数 0 |

> ②の「FBA納品が完了したか」は、SHIPPED/COMPLETEDへの遷移を同期していないため納品プランの直近ウィンドウ（14日）で近似している。

### ③ 補充数の決定（`src/lib/seller-switch/replenishment.ts`）

ロジレス在庫ロットを有効期限で2バケットに集計し（除外ロケーションは弾く）、決定表で補充数を求める。

- `ge14` = 14ヶ月以上の在庫合計（期限なしは14ヶ月以上扱い）
- `mid` = 6〜14ヶ月の在庫合計
- `total` = `ge14 + mid`（6ヶ月未満ロットは数えない）

| 枝 | 条件 | 補充数 |
|---|---|---|
| RULE_1_STABLE | `ge14 ≥ 50` または（`mid ≥ 10` かつ `ge14 ≥ 40`） | `total≥80`→6 / `≥50`→2 / それ未満→0 |
| RULE_2_MID | `mid ≥ 30` かつ `1 ≤ ge14 < 40` | `total≥80`→20 / `≥50`→10 / `≥30`→6 / それ未満→0 |
| RULE_3_HALF | `mid ≥ 10` かつ `ge14 = 0` | 総在庫の半分（偶数に切り下げ） |
| NONE | 上記いずれにも該当しない | 0（在庫不足扱い） |

### ④ 処理・通知

- 画面で「切替済みにする」と `processed_at` と補充数（`replenished_qty`）を記録（`POST /api/seller-switch/process`）
- 日報（`POST /api/notify` type=daily）に「出品者出荷切替＆在庫数記載（切り替え〇SKU）」として件数を出力

## データモデル（Prisma / `prisma/schema.prisma`）

| モデル / テーブル | 役割 |
|---|---|
| `Product` / `products` | 商品マスタ（SKU・ASIN・親ASIN・FNSKU・FBA在庫・上限・売上・在庫引当・次回入荷 等） |
| `ProductCategory` / `product_categories` | 商品カテゴリ（1day10P, Pixie 等） |
| `LogilessInventory` / `logiless_inventories` | ロジレスのロット・期限別在庫（全量洗い替え） |
| `DeliveryPlan` / `delivery_plans` | 納品プラン（`DRAFT`→`SUBMITTED`→`SHIPPED`→`COMPLETED`/`CANCELLED`） |
| `DeliveryPlanItem` / `delivery_plan_items` | 納品プラン明細 |
| `CalculationEndPosition` / `calculation_end_positions` | 仮プラン計算の終了位置（種別ごとに最新1件） |
| `InventoryCheckResult` / `inventory_check_results` | 在庫洗い出し結果のスナップショット（JSON） |
| `FbaInactiveListing` / `fba_inactive_listings` | 「停止中×FBA」の状態テーブル（出品者出荷切替の検出用） |
| `SyncLog` / `sync_logs` | 同期ログ（`LOGILESS_INVENTORY` / `FBA_INVENTORY` / `SALES_DATA`） |
| `OAuthToken` / `oauth_tokens` | OAuthトークン（`provider`: `logiless` / `sp-api` / `dropbox`） |

## 補足

- 詳細なコーディング規約・ドメイン用語・禁止事項は [CLAUDE.md](CLAUDE.md) を参照。
- 自動テストは未導入。導入時は納品数量計算・在庫閾値判定・カラー判定（`src/lib/`）を優先する方針。
</content>
</invoke>
