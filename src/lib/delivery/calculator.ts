import { addMonths, isAfter, isBefore } from "date-fns";
import { getColorName } from "@/lib/product-colors";
import { isUnsellableLocation } from "@/lib/logiless/locations";
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

// カラーを丸ごと追加するとき目標合計を超えてよい許容点数。
// これを超えるカラーは丸ごと翌日回しにする
export const OVERSHOOT_ALLOWANCE_WITH_PRES = 200;  // 度あり: 500点目標 → 700点まで許容
export const OVERSHOOT_ALLOWANCE_WITHOUT_PRES = 0; // 度なし: 1000点のまま（超過なし）

// ロジレスに残す在庫数（在庫引当）— 度あり/度なしで異なる
const RESERVE_WITH_PRES_DEFAULT = 25;     // 度あり：基本
const RESERVE_WITH_PRES_PIXIE = 35;       // 度あり：Pixie
const RESERVE_WITHOUT_PRES_DEFAULT = 50;  // 度なし：基本
const RESERVE_WITHOUT_PRES_PIXIE = 300;   // 度なし：Pixie

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
  // 不具合品・返送品・出荷期限切れ品は納品対象外（共通の販売不可判定）
  if (isUnsellableLocation(location)) return true;
  const unavailable = [
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

  // 手順書: 目標在庫 = 3か月売上(business3m) × 1.2。WITHOUT_PRES_QTY_MAX(=100) でハード上限
  const salesTarget = business3m * SALES_TARGET_MULTIPLIER;
  const effectiveTarget = Math.min(salesTarget, WITHOUT_PRES_QTY_MAX);

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
    fbaStockQuantity: product.fbaStockQuantity,
    fbaStockUpperLimit: product.fbaStockUpperLimit,
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

  // ロジレスに残す在庫数（度あり: 基本25/Pixie35、度なし: 基本50/Pixie300）
  const isPixie = product.categoryName === "Pixie";
  const reserve =
    product.productType === "WITH_PRESCRIPTION"
      ? isPixie
        ? RESERVE_WITH_PRES_PIXIE
        : RESERVE_WITH_PRES_DEFAULT
      : isPixie
        ? RESERVE_WITHOUT_PRES_PIXIE
        : RESERVE_WITHOUT_PRES_DEFAULT;

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
  if (availableStepped < min) {
    return { ...baseResult, skipReason: "NO_LOGILESS_STOCK" };
  }

  // FBA在庫が既にFBA上限を超えている商品は納品不要なので一覧に出さない（上限が10等でも同様）
  if (product.fbaStockQuantity > product.fbaStockUpperLimit!) {
    return { ...baseResult, skipReason: "UPPER_LIMIT_REACHED" };
  }

  // FBA上限までの余裕(step切り捨て)を算出。最小納品数すら入らない場合は
  // 納品しても上限超過になるだけなので「上限到達」としてスキップする。
  const openPoForLimit = product.fbaOpenPoQuantity ?? 0;
  const limitHeadroom = roundDownToStep(
    Math.max(0, product.fbaStockUpperLimit! - product.fbaStockQuantity - openPoForLimit),
    step
  );
  if (limitHeadroom < min) {
    return { ...baseResult, skipReason: "UPPER_LIMIT_REACHED" };
  }

  // 上限を超えないよう、余裕の範囲で納品数をキャップする
  const finalQuantity = Math.min(quantity, availableStepped, limitHeadroom);

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
  targetTotal: number;         // 目標合計（度あり:500、度なし:1000）
  maxPerPlan: number;          // 1プランあたり最大SKU数（300）
  maxCategories?: number;      // 度あり: 最大3カテゴリ、度なし: 1カテゴリ
  categoryOrder: string[];     // カテゴリ優先順
  overshootAllowance?: number; // カラー丸ごと追加時に目標を超えてよい点数（度あり200 / 度なし0）
  resumeAfterColors?: string[]; // 前回作成済みのカラー群。並び順で最後のカラーの次から計算を開始する
}

interface ColorGroup {
  categoryName: string;
  colorName: string;
  products: ProductForCalculation[];
}

/** カテゴリ優先順・SKU順を保ったまま、カラー単位のグループ列を作る */
function buildColorGroups(
  products: ProductForCalculation[],
  categoryOrder: string[]
): ColorGroup[] {
  const groups: ColorGroup[] = [];
  for (const categoryName of categoryOrder) {
    const byColor = new Map<string, ProductForCalculation[]>();
    for (const p of products) {
      if (p.categoryName !== categoryName) continue;
      const color = getColorName(p.name);
      const list = byColor.get(color);
      if (list) list.push(p);
      else byColor.set(color, [p]);
    }
    for (const [colorName, colorProducts] of byColor) {
      groups.push({ categoryName, colorName, products: colorProducts });
    }
  }
  return groups;
}

/**
 * カラー単位で納品予定を積み上げる。
 *
 * - カラーは丸ごと入れるか丸ごと外すか（途中で切らない）
 * - 丸ごと入れて目標+許容点数（maxTotal）を超えるカラーは翌日回し（deferredColor）にして終了
 * - resumeAfterColors（前回作成済みカラー）が渡された場合は、並び順で
 *   その最後のカラーの次から開始する（前回の続き = 翌日回しカラーが先頭に来る）
 */
export function calculateBatch(
  products: ProductForCalculation[],
  options: BatchCalculationOptions
): CalculationSummary {
  const results: DeliveryCalculationResult[] = [];
  let runningTotal = 0;
  const categoriesUsed: string[] = [];
  const maxCats = options.maxCategories ?? options.categoryOrder.length;
  const maxTotal = options.targetTotal + (options.overshootAllowance ?? 0);

  let colorGroups = buildColorGroups(products, options.categoryOrder);

  // 前回の続きから: 作成済みカラーのうち並び順で最後のものを探し、その次へ回転させる
  // （作成済みカラーは末尾に回り、FBA在庫十分などのスキップ判定に委ねる）
  let resumedAfterColor: string | null = null;
  if (options.resumeAfterColors?.length) {
    const delivered = new Set(options.resumeAfterColors);
    let lastIdx = -1;
    colorGroups.forEach((g, i) => {
      if (delivered.has(g.colorName)) lastIdx = i;
    });
    if (lastIdx >= 0) {
      resumedAfterColor = colorGroups[lastIdx].colorName;
      colorGroups = [
        ...colorGroups.slice(lastIdx + 1),
        ...colorGroups.slice(0, lastIdx + 1),
      ];
    }
  }

  let deferredColor: string | null = null;

  for (const group of colorGroups) {
    // 目標到達済みなら新しいカラーには進まない
    if (runningTotal >= options.targetTotal) break;

    // カテゴリ上限: 未使用カテゴリは上限到達後は処理しない
    const isNewCategory = !categoriesUsed.includes(group.categoryName);
    if (isNewCategory && categoriesUsed.length >= maxCats) continue;

    // カラー内の全SKUを計算
    const groupResults = group.products.map(calculateDeliveryQuantity);
    const colorTotal = groupResults
      .filter((r) => !r.skipReason)
      .reduce((s, r) => s + r.suggestedQuantity, 0);

    // 納品対象なし（全SKUスキップ）→ 理由表示のため結果には含めて次へ
    if (colorTotal === 0) {
      results.push(...groupResults);
      continue;
    }

    // 丸ごと入れると許容上限を超えるカラーは翌日回しにして終了。
    // ただし最初のカラー（runningTotal=0）まで外すとプランが空になり
    // 永遠に作成できないため、最初のカラーは超過しても採用する
    if (runningTotal + colorTotal > maxTotal && runningTotal > 0) {
      results.push(
        ...groupResults.map((r) =>
          r.skipReason
            ? r
            : { ...r, suggestedQuantity: 0, skipReason: "TARGET_EXCEEDED" as SkipReason }
        )
      );
      deferredColor = group.colorName;
      break;
    }

    results.push(...groupResults);
    runningTotal += colorTotal;
    if (isNewCategory) categoriesUsed.push(group.categoryName);
  }

  const deliverable = results.filter((r) => !r.skipReason);
  const skipped = results.filter((r) => r.skipReason);

  return {
    results,
    totalQuantity: deliverable.reduce((s, r) => s + r.suggestedQuantity, 0),
    deliverableCount: deliverable.length,
    skippedCount: skipped.length,
    categoriesUsed,
    maxTotal,
    deferredColor,
    resumedAfterColor,
  };
}
