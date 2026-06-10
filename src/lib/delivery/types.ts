import type { ProductType } from "@prisma/client";

export interface ProductForCalculation {
  id: string;
  sku: string;
  name: string;
  productType: ProductType;
  categoryName: string;
  fbaStockQuantity: number;
  fbaStockUpperLimit: number | null;
  fbaOpenPoQuantity: number | null;
  logilessStockReserve: number;
  business3m: number | null;
  isDiscontinued: boolean;
  logilessInventories: LojilessInventoryForCalc[];
}

export interface LojilessInventoryForCalc {
  location: string | null;
  lotNumber: string | null;
  quantity: number;
  expiryDate: Date | null;
}

export interface DeliveryCalculationResult {
  productId: string;
  sku: string;
  name: string;
  categoryName: string;
  fbaStockQuantity: number;        // 現在のFBA在庫数
  fbaStockUpperLimit: number | null; // FBA上限（CSV取込値）
  suggestedQuantity: number;
  lotNumber: string | null;
  expiryDate: Date | null;
  expiryWarning: boolean;  // 14〜18ヶ月以内の場合 true
  skipReason: SkipReason | null;
}

export type SkipReason =
  | "NO_LOGILESS_STOCK"       // ロジレス在庫なし
  | "DISCONTINUED"            // 終売
  | "EXPIRY_TOO_CLOSE"        // 有効期限14ヶ月未満
  | "FBA_SUFFICIENT"          // FBA在庫十分
  | "UPPER_LIMIT_REACHED"     // FBA上限到達
  | "NO_SALES_DATA"           // 3ヶ月売上データなし
  | "FBA_LIMIT_NOT_SET"       // FBA上限未設定（CSV未取込）
  | "TARGET_EXCEEDED"         // カラー丸ごと追加で許容上限超過 → 翌日回し

export interface CalculationSummary {
  results: DeliveryCalculationResult[];
  totalQuantity: number;
  deliverableCount: number;
  skippedCount: number;
  categoriesUsed: string[];
  maxTotal: number;                  // 目標 + 超過許容点数（このカラーまでで超えるなら翌日回し）
  deferredColor: string | null;      // 許容上限超過で翌日回しになったカラー
  resumedAfterColor: string | null;  // 前回作成済みカラーの続きから計算した場合、その最後のカラー
}
