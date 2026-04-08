import type { ProductType } from "@prisma/client";

export interface ProductForCalculation {
  id: string;
  sku: string;
  name: string;
  productType: ProductType;
  categoryName: string;
  fbaStockQuantity: number;
  fbaStockUpperLimit: number | null;
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

export interface CalculationSummary {
  results: DeliveryCalculationResult[];
  totalQuantity: number;
  deliverableCount: number;
  skippedCount: number;
  categoriesUsed: string[];
}
