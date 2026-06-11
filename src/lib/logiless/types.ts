// ── Logiless APIレスポンス型定義 ──────────────────────────

// 一覧APIで返る簡易版
export interface LogilessArticleSummary {
  id: number;
  code: string;
  identification_code: string | null;
  object_code: string | null;
  name: string;
  article_type: string;
  tags: string[];
}

// 個別検索で返る詳細版（FNSKU、フリー項目、原価等を含む）
export interface LogilessArticleDetail extends LogilessArticleSummary {
  model_number: string | null;  // FNSKU
  price: number | null;
  cost: number | null;
  color: string | null;         // DIA等
  color_code: string | null;
  attr1: string | null;         // フリー項目1
  attr2: string | null;         // フリー項目2
  attr3: string | null;         // フリー項目3
  attr4: string | null;         // フリー項目4 (SKU)
  attr5: string | null;         // フリー項目5
  attr6: string | null;         // フリー項目6
  attr7: string | null;         // フリー項目7
  attr8: string | null;         // フリー項目8
  attr9: string | null;         // フリー項目9
  attr10: string | null;        // フリー項目10
  attr11: string | null;        // フリー項目11
  delivery_category: string | null;
  default_delivery_method: string | null;
  size_coefficient: number | null;
  contents_description: string | null;
  reorder_point: number | null;
  supplier: {
    id: number;
    code: string;
    name: string;
  } | null;
}

// 後方互換
export type LogilessArticle = LogilessArticleSummary;

// GET /actual_inventory_summaries?aggregate_type=expiration_date レスポンスアイテム
export interface LogilessActualInventory {
  id: number;
  layer: string;
  received: number;
  available: number;
  blocked: number;
  allocated: number;
  shipped: number;
  issued: number;
  article_id: number;
  article: LogilessArticleSummary;
  location?: { id: number; code: string; name: string } | null;
  lot_number?: string | null;
  expiration_date?: string | null;
  deadline?: string | null;        // 有効期限（実際のフィールド名）
  warehouse_id: number;
  warehouse: { id: number; name: string };
}

// GET /logical_inventory_summaries レスポンスアイテム
export interface LogilessLogicalInventory {
  id: number;
  article_id: number;
  article: LogilessArticleSummary;
  available: number;
  allocated: number;
  received: number;
}

// POST /sales_orders/new リクエスト（ボディは { sales_order: {...} } でラップして送る）
export interface LogilessSalesOrderRequest {
  code: string;                      // 受注コード（STAyyyymmdd-n）
  buyer_name1: string;
  buyer_post_code?: string;
  buyer_prefecture?: string;
  buyer_address1?: string;
  buyer_address2?: string;
  buyer_address3?: string;
  buyer_phone?: string;
  recipient_name1: string;
  recipient_post_code?: string;
  recipient_prefecture?: string;
  recipient_address1: string;
  recipient_address2?: string;
  recipient_address3?: string;
  recipient_phone?: string;
  payment_method: string;            // 例: no_payment
  delivery_method: string;           // 例: yamato
  ordered_at?: string;               // Y-m-d H:i:s
  scheduled_shipping_date?: string;  // Y-m-d
  picking_notes?: string;            // 出荷指示書特記事項
  store: number;                     // 店舗ID
  warehouse?: number;
  lines: LogilessSalesOrderLine[];
}

export interface LogilessSalesOrderLine {
  article_code: string;              // 商品コード（店舗）= 商品対応表の mapped_code
  article_name: string;
  quantity: number;
  price?: number;
  deadline?: string;                 // 使用期限 Y-m-d
  lot_number?: string;
}

// 受注伝票レスポンス（GET一覧の要素 / POST /sales_orders/new の201レスポンス）
export interface LogilessSalesOrderResponse {
  id: number;
  code: string;
  document_status: string;
  lines: {
    id: number;
    article_code: string;
    quantity: number;
  }[];
}

// GET /article_maps レスポンスアイテム（商品対応表: 店舗の出品コード→商品マスタ）
export interface LogilessArticleMap {
  id: number;
  mapped_code: string;
  article: { id: number; code: string; identification_code: string | null } | null;
  store: { id: number; name: string } | null;
}

// ページネーション付き汎用レスポンス
export interface LogilessPagedResponse<T> {
  data: T[];
  current_page: number;
  limit: number;
  total_count: number;
}
