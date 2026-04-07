# Prisma Schema ルール

適用対象: `prisma/schema.prisma`

## 命名規則

- テーブル名: snake_case 複数形（例: `delivery_plans`）
- カラム名: snake_case（例: `product_master_id`）
- モデル名: PascalCase 単数形（例: `DeliveryPlan`）
- `@@map()` でテーブル名を明示する

## 変更時の手順

1. `schema.prisma` を編集
2. `npx prisma validate` でスキーマ検証
3. `npx prisma format` でフォーマット
4. `npm run db:migrate` でマイグレーション作成
5. `npm run db:generate` で Prisma Client 再生成

## 注意

- 既存カラムの型変更・削除は破壊的変更。必ず確認を取る
- enum は PostgreSQL の enum として作成される（`SyncType`, `SyncStatus` 等）
- `@default(now())` と `@updatedAt` を適切に使う
