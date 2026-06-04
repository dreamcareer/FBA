/**
 * 計算済みの納品予定（DeliveryCalculationResult[]）を、手順書のルールに従って
 * 複数の納品プランに分割する。
 *
 * 共通ルール:
 *   - 1プランの合計納品数は 300点まで（300を超えるのは禁止）
 *
 * 度あり（WITH_PRESCRIPTION）の追加ルール:
 *   - カラー（商品名から判定）単位でまとめる
 *   - 1プランは「3カラー・5SKU」まで（背景色3種・5行分まで）
 *
 * 度なし（WITHOUT_PRESCRIPTION）:
 *   - カラー制約なし。300点ごとに区切るだけ。
 */

import type { DeliveryCalculationResult } from "./types";
import { getColorName } from "@/lib/product-colors";

export const MAX_UNITS_PER_PLAN = 300; // 1プランの最大納品数（点）
export const MAX_COLORS_PER_PLAN = 3; // 度あり: 1プランの最大カラー数
export const MAX_SKUS_PER_PLAN = 5; // 度あり: 1プランの最大SKU数

export interface DeliveryPlanGroup {
  items: DeliveryCalculationResult[];
  colorNames: string[];
  totalQuantity: number;
}

type QuantityMap = Record<string, number>;

/** プランごとの集計を組み立てる */
function buildGroup(items: DeliveryCalculationResult[], qtyOf: (r: DeliveryCalculationResult) => number): DeliveryPlanGroup {
  const colorNames: string[] = [];
  for (const r of items) {
    const c = getColorName(r.name);
    if (!colorNames.includes(c)) colorNames.push(c);
  }
  return {
    items,
    colorNames,
    totalQuantity: items.reduce((s, r) => s + qtyOf(r), 0),
  };
}

/** 度なし: 300点ごとに区切る */
function packByUnits(
  results: DeliveryCalculationResult[],
  qtyOf: (r: DeliveryCalculationResult) => number
): DeliveryCalculationResult[][] {
  const plans: DeliveryCalculationResult[][] = [];
  let current: DeliveryCalculationResult[] = [];
  let currentUnits = 0;

  for (const r of results) {
    const q = qtyOf(r);
    if (current.length > 0 && currentUnits + q > MAX_UNITS_PER_PLAN) {
      plans.push(current);
      current = [];
      currentUnits = 0;
    }
    current.push(r);
    currentUnits += q;
  }
  if (current.length > 0) plans.push(current);
  return plans;
}

/** 度あり: カラー単位でまとめ、3カラー5SKU・300点で区切る */
function packWithColors(
  results: DeliveryCalculationResult[],
  qtyOf: (r: DeliveryCalculationResult) => number
): DeliveryCalculationResult[][] {
  // 同じカラーが連続するようカラー名でグルーピング（安定ソート）
  const sorted = [...results].sort((a, b) =>
    getColorName(a.name).localeCompare(getColorName(b.name), "ja")
  );

  const plans: DeliveryCalculationResult[][] = [];
  let current: DeliveryCalculationResult[] = [];
  let currentUnits = 0;
  const currentColors = new Set<string>();

  for (const r of sorted) {
    const color = getColorName(r.name);
    const q = qtyOf(r);

    const wouldColors = new Set(currentColors).add(color);
    const fits =
      current.length === 0 ||
      (current.length < MAX_SKUS_PER_PLAN &&
        wouldColors.size <= MAX_COLORS_PER_PLAN &&
        currentUnits + q <= MAX_UNITS_PER_PLAN);

    if (!fits) {
      plans.push(current);
      current = [];
      currentUnits = 0;
      currentColors.clear();
    }
    current.push(r);
    currentUnits += q;
    currentColors.add(color);
  }
  if (current.length > 0) plans.push(current);
  return plans;
}

/**
 * 納品予定（skipReason なしの結果）を複数プランに分割する。
 * quantities を渡すと手動編集後の数量で集計する（未指定時は suggestedQuantity）。
 */
export function groupIntoPlans(
  results: DeliveryCalculationResult[],
  productType: "WITH_PRESCRIPTION" | "WITHOUT_PRESCRIPTION",
  quantities?: QuantityMap
): DeliveryPlanGroup[] {
  const qtyOf = (r: DeliveryCalculationResult) =>
    quantities?.[r.productId] ?? r.suggestedQuantity;

  const deliverable = results.filter((r) => !r.skipReason);
  const planArrays =
    productType === "WITH_PRESCRIPTION"
      ? packWithColors(deliverable, qtyOf)
      : packByUnits(deliverable, qtyOf);

  return planArrays.map((items) => buildGroup(items, qtyOf));
}
