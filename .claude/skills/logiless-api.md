# ロジレスAPI連携ガイド

## 概要

ロジレスは倉庫管理(WMS)・受注管理(OMS)のSaaSサービス。
本システムではOAuth2認証でAPIを利用し、在庫データ取得と受注登録を行う。

## 認証フロー

1. `/api/logiless/authorize` → ロジレス認可画面へリダイレクト
2. ユーザー認可後 → `/api/logiless/callback` でトークン取得
3. トークンは `OAuthToken` テーブルに保存
4. 期限5分前に自動リフレッシュ（`getAccessToken()`）

## 主要エンドポイント

### 商品一覧取得
- `GET /api/v1/merchant/{id}/articles`
- ページネーション: `limit=100`, `page=N`
- 個別詳細は `identification_code`（=SKU）で取得

### 在庫取得（ロット別）
- `GET /api/v1/merchant/{id}/logics/inventory/lot`
- `article_code` でフィルタ
- レスポンスにロット番号、使用期限、ロケーション、数量が含まれる

### 受注登録（納品プラン）
- `POST /api/v1/merchant/{id}/sales_orders/new`（`/sales_orders` へのPOSTは405）
- ボディは `{ "sales_order": {...} }` でラップする
- 必須: `code`, `buyer_name1`, `recipient_name1`, `recipient_address1`, `payment_method`, `delivery_method`, `store`(店舗ID), `lines`
- 受注コード(`code`): `STAyyyymmdd-n` 形式
- 明細行(`lines[].article_code`)は**商品コード（店舗）= 商品対応表の出品コード**。
  商品マスタのJANを `GET /article_maps?article_code={JAN}&store={店舗ID}` で `mapped_code` に変換して使う
- 店舗一覧は `GET /api/v1/merchant/{id}/stores` で確認（本番: 4847 = ナチュラリAmazon店(手動)）

## エラーハンドリング

- **429 Too Many Requests**: 3秒後にリトライ（最大3回、バックオフ: 3s, 6s, 9s）
- **502/503**: サーバー側エラー、同じリトライロジック
- **401**: トークン期限切れ → リフレッシュ後リトライ

## 実装場所

- `src/lib/logiless/client.ts` - APIクライアント本体
- `src/lib/logiless/types.ts` - レスポンス型定義
- `src/lib/logiless/categories.ts` - カテゴリ判定ロジック

## 注意点

- ロジレスAPIのレート制限は厳しいため、不要なリクエストを避ける
- 機器コード（2000番台）は在庫同期から除外する
- 在庫同期は全量洗い替え方式（差分更新ではない）
