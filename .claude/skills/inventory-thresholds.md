# 在庫閾値・洗い出しロジック

## 概要

FBA在庫が閾値を下回った商品を検出し、補充対象リストを作成する。

## 閾値テーブル

| パック数 | 商品タイプ | 閾値 |
|----------|-----------|------|
| 10枚入   | 度なし (WITHOUT_PRESCRIPTION) | 300未満 |
| 10枚入   | 度あり (WITH_PRESCRIPTION)    | 30未満  |
| 30枚入   | 度なし (WITHOUT_PRESCRIPTION) | 150未満 |
| 30枚入   | 度あり (WITH_PRESCRIPTION)    | 20未満  |

## パック数の判定

商品名またはSKUから10枚入/30枚入を判定:
- `10P`, `10枚` → 10枚入
- `30P`, `30枚` → 30枚入

## 洗い出し結果の構造

カテゴリ別にグルーピングして表示:
- 1day10P
- Pixie
- ハイドロゲル
- etc.

各商品について:
- 現在のFBA在庫数
- 閾値との差分
- 次回入荷予定（日付・数量）

## 実装場所

- `src/lib/inventory-check.ts` - 閾値判定ロジック
- `src/app/api/inventory-check/route.ts` - APIエンドポイント
- `src/app/(dashboard)/inventory-check/page.tsx` - 画面

## カラーグルーピング

在庫一覧画面では商品名からカラーを判定してグルーピング表示:
- `src/lib/product-colors.ts` に色判定ロジック
- 同じ色の度あり/度なしを隣接表示
