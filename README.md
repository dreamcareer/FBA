# Naturali FBA管理システム

AmazonFBA納品業務の完全API化・自動化システム。  
スクレイピング（Playwright）→ API連携に移行し、GAS・Dropboxを廃止。

## 技術スタック

| 役割 | 技術 |
|---|---|
| フロントエンド / API | Next.js 14 (App Router) + TypeScript |
| DB | Supabase (PostgreSQL) |
| ORM | Prisma |
| 認証 | Supabase Auth |
| スタイリング | Tailwind CSS |
| ホスティング | Vercel (フロント) + Supabase (DB) |

## フェーズ

| Phase | 内容 | ステータス |
|---|---|---|
| Phase 1 | Logiless API連携・納品数計算・ロジレス受注登録 | 実装済み |
| Phase 2 | SP-API連携・FBA在庫同期・納品プラン自動作成 | SP-API取得後に実装 |

## セットアップ

```bash
# 依存関係インストール
npm install

# 環境変数設定
cp .env.example .env.local
# .env.local を編集
envのurl (https://docs.google.com/document/d/1cCpWHhkd0h9ES68jOH-M1bUCQgK1Pb-_vNKefazPHV0/edit?tab=t.0)

# DBスキーマ反映
npm run db:push

# 開発サーバー起動
npm run dev
```

## ディレクトリ構成

```
src/
├── app/
│   ├── (auth)/login/          # ログイン画面
│   ├── (dashboard)/
│   │   ├── inventory/         # 在庫一覧
│   │   ├── provisional-plan/  # 仮プラン作成
│   │   └── delivery-plan/     # 納品プラン管理
│   └── api/
│       ├── sync/inventory/    # Logiless在庫同期
│       ├── delivery-plan/
│       │   ├── calculate/     # 納品数計算
│       │   └── create/        # プラン作成・ロジレス登録
│       └── notify/            # Discord/Chatwork通知
├── lib/
│   ├── db.ts                  # Prismaクライアント
│   ├── logiless/              # Logiless APIクライアント
│   ├── sp-api/                # SP-APIクライアント（Phase 2）
│   ├── delivery/              # 納品数計算エンジン
│   ├── notify.ts              # 通知ユーティリティ
│   └── supabase.ts            # Supabaseクライアント
└── types/                     # 共通型定義
```

## 主要API

### `POST /api/sync/inventory`
Logilessからロット別在庫を取得してDBに同期する。

### `POST /api/delivery-plan/calculate`
業務ルールに基づいて納品予定数を計算する（DB保存なし）。

```json
{
  "productType": "WITH_PRESCRIPTION",
  "targetTotal": 500,
  "startFromSku": "1d10hi145mh"
}
```

### `POST /api/delivery-plan/create`
納品プランをDBに保存しロジレスに受注登録する。

```json
{
  "items": [{ "productId": "...", "quantity": 10, "expiryDate": "2027-06-01" }],
  "shipmentDate": "2026-01-08T00:00:00.000Z",
  "logilessOrderCode": "STA20260106-1"
}
```

## Phase 2 実装時の作業

1. `src/lib/sp-api/client.ts` の各関数を実装
2. `POST /api/sync/inventory` にFBA在庫同期を追加
3. `POST /api/delivery-plan/create` にSP-API納品プラン作成を追加
4. Vercel Cron Jobs で定期同期をスケジュール設定

## 業務ルール（計算エンジン）

`src/lib/delivery/calculator.ts` に実装。

**度あり**
- FBA在庫=0 → 20個
- FBA在庫≤15 かつ 3ヶ月売上≥5 → 10個
- FBA在庫<10 → 10個
- 目標: 500点/バッチ

**度なし**
- FBA在庫=0 → 50個
- FBA在庫 < 3ヶ月売上×1.2 → 差分を補充（10〜100個、10刻み）
- 目標: 1000点/バッチ

**共通**
- 有効期限14ヶ月未満は納品不可
- 14〜18ヶ月は警告表示
- 終売商品はスキップ
- ロジレス在庫は最低確保数を控除して計算
