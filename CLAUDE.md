# FBA System - CLAUDE.md

## プロジェクト概要

Naturaliブランドのコンタクトレンズ FBA(Fulfillment by Amazon)在庫管理システム。
ロジレス倉庫連携とAmazon納品プラン作成を行う業務システム。

## 技術スタック

- **フレームワーク**: Next.js 16 (App Router) + TypeScript
- **フロントエンド**: React 18 + Tailwind CSS 3
- **DB**: PostgreSQL (Supabase) + Prisma 5
- **認証**: Supabase Auth
- **外部API**: ロジレス API (OAuth2), Amazon SP-API (Phase 2)
- **通知**: Discord Webhook, Chatwork API
- **バリデーション**: Zod
- **日付処理**: date-fns

## ディレクトリ構成

```
src/
├── app/
│   ├── (auth)/login/          # ログイン画面
│   ├── (dashboard)/           # 認証必須エリア
│   │   ├── inventory/         # 在庫一覧
│   │   ├── inventory-check/   # 在庫洗い出し
│   │   ├── provisional-plan/  # 仮プラン作成
│   │   ├── delivery-plan/     # 納品プラン管理
│   │   └── _components/       # ダッシュボード共通コンポーネント
│   └── api/                   # APIルート
│       ├── sync/              # 同期(articles, inventory)
│       ├── logiless/          # OAuth認可フロー
│       ├── products/          # 商品マスタ操作
│       ├── delivery-plan/     # 納品プラン(calculate, create)
│       ├── inventory-check/   # 在庫不足チェック
│       └── notify/            # 通知送信
├── lib/
│   ├── db.ts                  # Prismaシングルトン
│   ├── supabase.ts            # ブラウザクライアント
│   ├── supabase-server.ts     # サーバークライアント
│   ├── logiless/              # ロジレスAPI連携
│   ├── delivery/              # 納品数量計算エンジン
│   └── sp-api/                # SP-API (Phase 2)
├── types/                     # グローバル型定義
└── middleware.ts               # 認証ミドルウェア
```

## 開発コマンド

```bash
npm run dev          # 開発サーバー起動
npm run build        # ビルド
npm run lint         # ESLint
npm run db:generate  # Prisma Client生成
npm run db:push      # スキーマをDBに反映
npm run db:migrate   # マイグレーション作成
npm run db:studio    # Prisma Studio起動
```

## パスエイリアス

- `@/*` → `./src/*`

## 重要なビジネスルール

### 在庫閾値（在庫洗い出し）

| パック | 度なし | 度あり |
|--------|--------|--------|
| 10枚入 | 300未満 | 50未満 |
| 30枚入 | 150未満 | 50未満 |

### 納品数量計算ルール

- **度あり**: min 10, max 30, step 10
- **度なし**: min 10, max 100, step 10 (月販の1.2倍を目標)
- **使用期限**: 14ヶ月未満はスキップ、14-18ヶ月は警告
- **ロジレス在庫引当**: デフォルト25個をロジレスに残す
- **除外ロケーション**: 出荷期限切れ、アウトレット専用、Amazon倉庫、FBA専用、不具合品、返送品
- **不具合品・返送品・出荷期限切れ品**: 在庫一覧・在庫洗い出しの在庫数にも含めない（`src/lib/logiless/locations.ts`）

### 納品プランステータス

`DRAFT` → `SUBMITTED` → `SHIPPED` → `COMPLETED` / `CANCELLED`

### ロジレス受注コード

`STAyyyymmdd-n` 形式（例: STA20260407-1）

## フェーズ

- **Phase 1 (現在)**: ロジレス連携、在庫管理、納品プラン作成
- **Phase 2 (計画)**: SP-API連携、FBA在庫・売上自動同期、セラーセントラル直接納品

## コーディング規約

### 命名規則

- **ファイル名**: kebab-case（例: `delivery-plan.tsx`, `inventory-check.ts`）
- **コンポーネント**: PascalCase（例: `ColorGroup`, `SyncButton`）
- **関数・変数**: camelCase（例: `getAccessToken`, `deliveryPlanItems`）
- **DBテーブル**: snake_case 複数形（例: `delivery_plans`, `logiless_inventories`）
- **DBカラム**: snake_case（例: `product_master_id`, `fba_stock_quantity`）
- **Prismaモデル**: PascalCase 単数形（例: `DeliveryPlan`, `Product`）
- **API ルート**: kebab-case（例: `/api/delivery-plan/calculate`）
- **環境変数**: UPPER_SNAKE_CASE（例: `LOGILESS_CLIENT_ID`）

### コード規則

- 日本語コメントOK（UIテキストは日本語）
- APIレスポンスは `ApiResponse<T>` 型で統一
- エラーハンドリングは try-catch + 適切なHTTPステータスコード
- Prismaクエリは `src/lib/db.ts` のシングルトンインスタンスを使用
- 環境変数は `.env` で管理、`NEXT_PUBLIC_` プレフィックスでクライアント公開
- Server Component をデフォルトとし、インタラクションが必要な場合のみ `"use client"`

### ディレクトリ構造ルール

- ページコンポーネント → `src/app/(dashboard)/[feature]/page.tsx`
- 共有UIコンポーネント → `src/app/(dashboard)/_components/`
- ビジネスロジック → `src/lib/[domain]/`
- 型定義 → `src/types/`
- APIルート → `src/app/api/[resource]/route.ts`

## ドメインルール

### 業務用語の定義

| 用語 | 意味 | コード上の表現 |
|------|------|---------------|
| 度あり | 視力矯正レンズ（処方箋あり） | `WITH_PRESCRIPTION` / `product_type` |
| 度なし | カラーコンタクト（処方箋なし） | `WITHOUT_PRESCRIPTION` / `product_type` |
| 10P / 10枚入 | 10枚パック商品 | SKU・商品名から判定 |
| 30P / 30枚入 | 30枚パック商品 | SKU・商品名から判定 |
| FBA在庫 | Amazon倉庫の在庫数 | `fba_stock_quantity` |
| ロジレス在庫 | 自社倉庫（ロジレス管理）の在庫数 | `logiless_inventories.quantity` |
| 在庫引当 | ロジレスに残しておく最低在庫数 | `logiless_stock_reserve`（デフォルト25） |
| 納品プラン | FBA倉庫への出荷計画 | `DeliveryPlan` |
| 仮プラン | 計算結果のプレビュー（未登録） | `/provisional-plan` 画面 |
| 洗い出し | 閾値を下回った在庫の検出 | `inventory-check` |

### 名称の揺らぎ管理

同じ概念に複数の呼び方がある場合、コード上は以下に統一する:

| 揺らぎ | 統一名 | 備考 |
|--------|--------|------|
| SKU / 品番 / 識別コード | `sku` | ロジレスでは `identification_code` |
| 商品コード / アーティクルコード | `logiless_product_code` | ロジレスでは `article_code` |
| ASIN / Amazon商品ID | `asin` | Amazon固有 |
| FNSKU / FBA商品ID | `fnsku` | FBA固有 |
| JAN / バーコード | `jan_code` | |
| 使用期限 / 消費期限 / ロット期限 | `expiry_date` | ロジレスでは `expiration_date` |
| カテゴリ / シリーズ | `category_name` | 1day10P, Pixie 等 |

## やってはいけないこと

### 認証・セキュリティ

- `.env` ファイルをコミットしない（機密情報含む）
- `SUPABASE_SERVICE_ROLE_KEY` をクライアントコードで使わない
- `NEXT_PUBLIC_` 以外の環境変数をフロントエンドで参照しない
- Supabase セッション検証をスキップしてAPIを公開しない
- OAuthトークンをログに出力しない

### データベース

- 本番DBに直接 `DELETE` / `DROP` / `TRUNCATE` を実行しない
- `prisma db push` を本番環境で使わない（`migrate deploy` を使う）
- Prismaクライアントを `new PrismaClient()` で直接生成しない（`src/lib/db.ts` のシングルトンを使う）
- マイグレーションファイルを手動で編集しない

### 外部API

- ロジレスAPIを `src/lib/logiless/client.ts` を経由せずに直接叩かない
- リトライロジックなしでロジレスAPIを呼ばない（429対策）
- 在庫同期中にロジレス在庫テーブルを部分更新しない（全量洗い替えのみ）

### デプロイ

- `git push --force` を main ブランチに対して行わない
- ビルド確認（`npm run build`）なしでデプロイしない
- Prismaスキーマ変更後に `db:generate` を忘れない

## テスト方針

### 現在の状態

本プロジェクトにはまだ自動テストが導入されていない。今後テストを追加する際は以下の方針に従う。

### 優先度: 高（最初に書くべきテスト）

- **納品数量計算ロジック** (`src/lib/delivery/calculator.ts`)
  - 度あり/度なしで計算結果が正しいこと
  - step丸め（10単位切り上げ）が正しいこと
  - 使用期限フィルタ（14ヶ月/18ヶ月）が正しく動くこと
  - ロジレス在庫引当が反映されること
- **在庫閾値判定** (`src/lib/inventory-check.ts`)
  - 各パック×度あり/度なしの閾値が正しいこと
- **カラー判定** (`src/lib/product-colors.ts`)
  - 商品名からカラーが正しく抽出されること

### 優先度: 中

- **APIルート**: リクエスト/レスポンスの形式、バリデーション、エラーケース
- **ロジレスAPIクライアント**: リトライロジック、トークンリフレッシュ

### 優先度: 低

- **UIコンポーネント**: フィルタ操作、ページネーション、表示切り替え

### テスト範囲の原則

- ビジネスロジック（`src/lib/`）は単体テストでカバーする
- APIルートは統合テストでカバーする
- UIは手動確認を基本とし、重要な操作フローのみE2Eを検討
- 外部API（ロジレス）はモックで対応し、実APIは叩かない
