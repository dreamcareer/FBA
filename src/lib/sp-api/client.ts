/**
 * Amazon SP-API クライアント（Phase 2 実装予定）
 *
 * Phase 1 では未使用。SP-API アクセス取得後に実装する。
 * 現時点でこのファイルから関数を呼び出すと NotImplementedError がスローされる。
 */

class NotImplementedError extends Error {
  constructor(method: string) {
    super(`SP-API: ${method} は Phase 2 で実装予定です。`);
    this.name = "NotImplementedError";
  }
}

export interface FbaInventoryItem {
  sku: string;
  asin: string;
  quantity: number;
  upperLimit: number | null;
}

export interface FbaShipmentPlan {
  shipmentId: string;
  shipmentName: string;
  items: { sku: string; quantity: number }[];
}

// ── FBA在庫 ─────────────────────────────────────────────

/**
 * FBA在庫一覧を取得する
 * @phase 2
 */
export async function fetchFbaInventory(): Promise<FbaInventoryItem[]> {
  throw new NotImplementedError("fetchFbaInventory");
}

/**
 * FBA在庫上限（UpperReport相当）を取得する
 * @phase 2
 */
export async function fetchFbaUpperLimits(): Promise<
  { sku: string; upperLimit: number }[]
> {
  throw new NotImplementedError("fetchFbaUpperLimits");
}

// ── 納品プラン ───────────────────────────────────────────

/**
 * 納品プランを作成する
 * @phase 2
 */
export async function createInboundShipmentPlan(items: {
  sku: string;
  quantity: number;
  expiryDate?: string;
}[]): Promise<FbaShipmentPlan> {
  throw new NotImplementedError("createInboundShipmentPlan");
}

/**
 * FNSKUバーコードラベルを取得する
 * @phase 2
 */
export async function getFnskuLabels(
  shipmentId: string
): Promise<{ sku: string; pdfUrl: string }[]> {
  throw new NotImplementedError("getFnskuLabels");
}

// ── ビジネスレポート ──────────────────────────────────────

/**
 * 売上データ（BusinessReport）を取得する
 * @phase 2
 */
export async function fetchSalesData(
  startDate: string,
  endDate: string
): Promise<{ sku: string; units: number }[]> {
  throw new NotImplementedError("fetchSalesData");
}
