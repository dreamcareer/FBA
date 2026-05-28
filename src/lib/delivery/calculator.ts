import { addMonths, isAfter, isBefore } from "date-fns";
import type {
  CalculationSummary,
  DeliveryCalculationResult,
  LojilessInventoryForCalc,
  ProductForCalculation,
  SkipReason,
} from "./types";

// ── 定数 ──────────────────────────────────────────────────
const EXPIRY_MIN_MONTHS = 14;        // 最低有効期限（月）
const EXPIRY_WARN_MONTHS = 18;       // 警告有効期限（月）

const WITH_PRES_QTY_MIN = 10;        // 度あり：最小納品数
const WITH_PRES_QTY_MAX = 30;        // 度あり：最大納品数（ハード上限）
const WITH_PRES_QTY_STEP = 10;       // 度あり：刻み幅
const WITH_PRES_TARGET = 20;         // 度あり：通常時の目安在庫

const WITHOUT_PRES_QTY_MIN = 10;     // 度なし：最小納品数
const WITHOUT_PRES_QTY_MAX = 100;    // 度なし：最大納品数
const WITHOUT_PRES_QTY_STEP = 10;    // 度なし：刻み幅

const SALES_MONTHS = 3;              // business3m の集計月数
const SALES_TARGET_MULTIPLIER = 1.2; // 月販に対する目標倍率

// ── ユーティリティ ────────────────────────────────────────

/** 指定の刻みで切り上げ（例: 23 → step=10 → 30） */
function roundUpToStep(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

/** 指定の刻みで切り捨て（例: 27 → step=10 → 20） */
function roundDownToStep(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

/** min〜maxにクランプしてstep刻みに調整 */
function clampToRange(value: number, min: number, max: number, step: number): number {
  const rounded = roundUpToStep(value, step);
  return Math.min(Math.max(rounded, min), max);
}

// ── 期限チェック ──────────────────────────────────────────

/**
 * ロジレス在庫から納品可能なロット（期限 >= EXPIRY_MIN_MONTHS）を取得する
 * 複数ロットがある場合は期限の近い順に返す
 */
function getDeliverableLots(
  inventories: LojilessInventoryForCalc[]
): LojilessInventoryForCalc[] {
  const now = new Date();
  const minExpiry = addMonths(now, EXPIRY_MIN_MONTHS);

  return inventories
    .filter((inv) => {
      // ロケーションが納品不可の場合はスキップ
      if (isUnavailableLocation(inv.location)) return false;
      // 期限なし（長期保存品）は納品可
      if (!inv.expiryDate) return true;
      // 期限が14ヶ月以上先のみ納品可
      return isAfter(inv.expiryDate, minExpiry) || inv.expiryDate.getTime() === minExpiry.getTime();
    })
    .sort((a, b) => {
      // 期限の近い順（FIFOで消費）
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return a.expiryDate.getTime() - b.expiryDate.getTime();
    });
}

/** 納品不可ロケーション判定 */
function isUnavailableLocation(location: string | null): boolean {
  if (!location) return false;
  const unavailable = [
    "出荷期限切れ",
    "アウトレット専用在庫",
    "FBA専用在庫",
  ];
  // "Amazon" + 数字 または 地名（簡易判定）
  if (/^Amazon\d+/.test(location)) return true;
  return unavailable.some((u) => location.startsWith(u));
}

/** 期限が14〜18ヶ月以内かどうか */
function isExpiryWarning(expiryDate: Date | null): boolean {
  if (!expiryDate) return false;
  const now = new Date();
  const warnThreshold = addMonths(now, EXPIRY_WARN_MONTHS);
  const minThreshold = addMonths(now, EXPIRY_MIN_MONTHS);
  return isAfter(expiryDate, minThreshold) && isBefore(expiryDate, warnThreshold);
}

// ── 度あり 計算 ───────────────────────────────────────────

function calcWithPrescription(
  product: ProductForCalculation
): { quantity: number; skipReason: SkipReason | null } {
  const { fbaStockQuantity, fbaStockUpperLimit, fbaOpenPoQuantity, business3m } = product;

  // FBA上限CSVが未取込の SKU はスキップ（マスタ未整備のサイン）
  if (fbaStockUpperLimit === null) {
    return { quantity: 0, skipReason: "FBA_LIMIT_NOT_SET" };
  }

  // 3ヶ月売上が無い/0 の SKU はスキップ
  if (!business3m || business3m <= 0) {
    return { quantity: 0, skipReason: "NO_SALES_DATA" };
  }

  // 月販×1.2 (月販目安)。通常は WITH_PRES_TARGET(=20) を目安にし、
  // 月販目安がそれを超えるホット商品のみ WITH_PRES_QTY_MAX(=30) まで伸ばす
  const monthlyCap = (business3m / SALES_MONTHS) * SALES_TARGET_MULTIPLIER;
  const effectiveTarget = Math.min(Math.max(WITH_PRES_TARGET, monthlyCap), WITH_PRES_QTY_MAX);

  // 目安在庫 - FBA在庫 - 入荷予定 = 不足数
  const openPo = fbaOpenPoQuantity ?? 0;
  const needed = effectiveTarget - fbaStockQuantity - openPo;
  if (needed <= 0) {
    return { quantity: 0, skipReason: "FBA_SUFFICIENT" };
  }

  // 10〜30の範囲でstep 10に丸める
  const qty = clampToRange(needed, WITH_PRES_QTY_MIN, WITH_PRES_QTY_MAX, WITH_PRES_QTY_STEP);
  return { quantity: qty, skipReason: null };
}

// ── 度なし 計算 ───────────────────────────────────────────

function calcWithoutPrescription(
  product: ProductForCalculation
): { quantity: number; skipReason: SkipReason | null } {
  const { fbaStockQuantity, fbaStockUpperLimit, fbaOpenPoQuantity, business3m } = product;

  // FBA上限CSVが未取込の SKU はスキップ（マスタ未整備のサイン）
  if (fbaStockUpperLimit === null) {
    return { quantity: 0, skipReason: "FBA_LIMIT_NOT_SET" };
  }

  // 3ヶ月売上が無い/0 の SKU はスキップ
  if (!business3m || business3m <= 0) {
    return { quantity: 0, skipReason: "NO_SALES_DATA" };
  }

  // 月販×1.2 を目標とし、WITHOUT_PRES_QTY_MAX(=100) でハード上限
  const monthlyCap = (business3m / SALES_MONTHS) * SALES_TARGET_MULTIPLIER;
  const effectiveTarget = Math.min(monthlyCap, WITHOUT_PRES_QTY_MAX);

  // 目標 - FBA在庫 - 入荷予定 = 不足数
  const openPo = fbaOpenPoQuantity ?? 0;
  const needed = effectiveTarget - fbaStockQuantity - openPo;
  if (needed <= 0) {
    return { quantity: 0, skipReason: "FBA_SUFFICIENT" };
  }

  // 10〜100の範囲でstep 10に丸める
  const qty = clampToRange(needed, WITHOUT_PRES_QTY_MIN, WITHOUT_PRES_QTY_MAX, WITHOUT_PRES_QTY_STEP);
  return { quantity: qty, skipReason: null };
}

// ── メイン計算 ────────────────────────────────────────────

export function calculateDeliveryQuantity(
  product: ProductForCalculation
): DeliveryCalculationResult {
  const baseResult = {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    categoryName: product.categoryName,
    suggestedQuantity: 0,
    lotNumber: null,
    expiryDate: null,
    expiryWarning: false,
    skipReason: null as SkipReason | null,
  };

  // 終売チェック
  if (product.isDiscontinued) {
    return { ...baseResult, skipReason: "DISCONTINUED" };
  }

  // 納品可能ロット取得
  const deliverableLots = getDeliverableLots(product.logilessInventories);

  // ロジレスに残す在庫数（Pixie: 35、その他: 25）
  const reserve = product.categoryName === "Pixie" ? 35 : 25;

  // 利用可能在庫の合計（reserve控除後）
  const totalDeliverable = deliverableLots.reduce((sum, l) => sum + l.quantity, 0);
  const availableForDelivery = totalDeliverable - reserve;

  if (availableForDelivery <= 0) {
    return { ...baseResult, skipReason: "NO_LOGILESS_STOCK" };
  }

  // 種別ごとに計算（FBA上限チェック含む）
  const { quantity, skipReason } =
    product.productType === "WITH_PRESCRIPTION"
      ? calcWithPrescription(product)
      : calcWithoutPrescription(product);

  if (skipReason) {
    return { ...baseResult, skipReason };
  }

  // ロジレス在庫が不足する場合は step 単位で切り捨てて調整
  const step = product.productType === "WITH_PRESCRIPTION" ? WITH_PRES_QTY_STEP : WITHOUT_PRES_QTY_STEP;
  const min = product.productType === "WITH_PRESCRIPTION" ? WITH_PRES_QTY_MIN : WITHOUT_PRES_QTY_MIN;
  const availableStepped = roundDownToStep(availableForDelivery, step);
  const finalQuantity = Math.min(quantity, availableStepped);
  if (finalQuantity < min) {
    return { ...baseResult, skipReason: "NO_LOGILESS_STOCK" };
  }

  // 使用するロットを特定（期限の近い順）
  const usedLot = deliverableLots[0];
  const expiryDate = usedLot?.expiryDate ?? null;

  return {
    ...baseResult,
    suggestedQuantity: finalQuantity,
    lotNumber: usedLot?.lotNumber ?? null,
    expiryDate,
    expiryWarning: isExpiryWarning(expiryDate),
    skipReason: null,
  };
}

// ── バッチ計算 ────────────────────────────────────────────

export interface BatchCalculationOptions {
  targetTotal: number;       // 目標合計（度あり:500、度なし:1000）
  maxPerPlan: number;        // 1プランあたり最大SKU数（300）
  maxCategories?: number;    // 度あり: 最大3カテゴリ、度なし: 1カテゴリ
  categoryOrder: string[];   // カテゴリ優先順
}

export function calculateBatch(
  products: ProductForCalculation[],
  options: BatchCalculationOptions
): CalculationSummary {
  const results: DeliveryCalculationResult[] = [];
  let runningTotal = 0;
  const categoriesUsed: string[] = [];
  const maxCats = options.maxCategories ?? options.categoryOrder.length;

  // カテゴリ順に処理
  for (const categoryName of options.categoryOrder) {
    // カテゴリ上限に達したら終了
    if (categoriesUsed.length >= maxCats) break;

    const categoryProducts = products.filter(
      (p) => p.categoryName === categoryName
    );
    if (categoryProducts.length === 0) continue;

    let categoryHasDeliverable = false;

    for (const product of categoryProducts) {
      // 目標到達済みなら以降のSKUは計算しない
      if (runningTotal >= options.targetTotal) break;

      const result = calculateDeliveryQuantity(product);
      results.push(result);

      if (!result.skipReason) {
        runningTotal += result.suggestedQuantity;
        categoryHasDeliverable = true;
      }
    }

    if (categoryHasDeliverable) {
      categoriesUsed.push(categoryName);
    }

    // 目標超えたら次のカテゴリに進まない
    if (runningTotal >= options.targetTotal) break;
  }

  const deliverable = results.filter((r) => !r.skipReason);
  const skipped = results.filter((r) => r.skipReason);

  return {
    results,
    totalQuantity: deliverable.reduce((s, r) => s + r.suggestedQuantity, 0),
    deliverableCount: deliverable.length,
    skippedCount: skipped.length,
    categoriesUsed,
  };
}
