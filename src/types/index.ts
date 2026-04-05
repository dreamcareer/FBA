import type {
  DeliveryPlan,
  DeliveryPlanItem,
  DeliveryPlanStatus,
  LogilessInventory,
  Product,
  ProductCategory,
  ProductType,
} from "@prisma/client";

// ── 画面表示用の拡張型 ────────────────────────────────────

export type ProductWithInventory = Product & {
  category: ProductCategory;
  logilessInventories: LogilessInventory[];
  _count?: { deliveryPlanItems: number };
};

export type DeliveryPlanWithItems = DeliveryPlan & {
  items: (DeliveryPlanItem & { product: Product })[];
};

// ── API レスポンス型 ───────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
}

// ── 在庫一覧フィルタ ──────────────────────────────────────

export interface InventoryFilterParams {
  productType?: ProductType;
  search?: string;
  hasLowStock?: boolean;
  isDiscontinued?: boolean;
  page?: number;
  perPage?: number;
}

// ── 納品計算リクエスト ────────────────────────────────────

export interface CalculateDeliveryRequest {
  productType: ProductType;
  targetTotal: number;         // 目標合計（500 or 1000）
  startFromSku?: string;       // 開始SKU（前回の続きから）
}

// ── プラン作成リクエスト ──────────────────────────────────

export interface CreateDeliveryPlanRequest {
  items: {
    productId: string;
    quantity: number;
    lotNumber?: string;
    expiryDate?: string;       // ISO string
  }[];
  shipmentDate: string;        // ISO string
  logilessOrderCode: string;   // STAyyyymmdd-n
}

// ── ステータスラベル ──────────────────────────────────────

export const DELIVERY_PLAN_STATUS_LABELS: Record<DeliveryPlanStatus, string> = {
  DRAFT: "作成中",
  SUBMITTED: "ロジレス登録済み",
  SHIPPED: "出荷済み",
  COMPLETED: "完了",
  CANCELLED: "キャンセル",
};

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  WITH_PRESCRIPTION: "度あり",
  WITHOUT_PRESCRIPTION: "度なし",
};
