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

// POST /sales_orders リクエスト
export interface LogilessSalesOrderRequest {
  order_no: string;
  order_date: string;
  shipping_date: string;
  store_name: string;
  items: LogilessSalesOrderItem[];
}

export interface LogilessSalesOrderItem {
  article_code: string;
  quantity: number;
  expiration_date?: string;
  lot_number?: string;
}

// POST /sales_orders レスポンス
export interface LogilessSalesOrderResponse {
  id: number;
  order_no: string;
  status: string;
  items: {
    id: number;
    article_code: string;
    quantity: number;
  }[];
}

// ページネーション付き汎用レスポンス
export interface LogilessPagedResponse<T> {
  data: T[];
  current_page: number;
  limit: number;
  total_count: number;
}
