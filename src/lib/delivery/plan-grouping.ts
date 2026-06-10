/**
 * 計算済みの納品予定（DeliveryCalculationResult[]）を、手順書のルールに従って
 * 複数の納品プランに分割する。
 *
 * 共通ルール:
 *   - 1プランの合計納品数は 300点まで（300を超えるのは禁止）
 *
 * 度あり（WITH_PRESCRIPTION）の追加ルール:
 *   - カラー（商品名から判定）単位でまとめる
 *   - カラーはプランをまたいで分割しない（300点を超える単独カラーを除く）
 *   - 同一カラーのみのプランはSKU数制限なし（300点の上限のみ）
 *   - カラーが混在するプランは「3カラー・5SKU」まで（背景色3種・5行分まで）
 *
 * 度なし（WITHOUT_PRESCRIPTION）:
 *   - カラー制約なし。300点ごとに区切るだけ。
 */

import type { DeliveryCalculationResult } from "./types";
import { getColorName } from "@/lib/product-colors";

export const MAX_UNITS_PER_PLAN = 300; // 1プランの最大納品数（点）
export const MAX_COLORS_PER_PLAN = 3; // 度あり: 1プランの最大カラー数
export const MAX_SKUS_PER_PLAN = 5; // 度あり: カラー混在プランの最大SKU数（同一カラーのみなら制限なし）

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

/**
 * 度あり: カラー単位で丸ごと詰める（カラーはプランをまたいで分割しない）。
 *
 * 各カラーは「丸ごと相乗りできる最初の既存プラン」に入れる（first-fit）。
 * どのプランにも収まらないカラーは単独で新しいプランを作る。
 * 入りきらなかったカラーの代わりに、後続の小さいカラーが前のプランの
 * 空き枠を丸ごと埋めることができる。
 *
 * - 混在プランは3カラー・5SKU・300点まで
 * - 単独カラーのプランはSKU数制限なし（300点を超える場合のみカラー内で分割）
 */
function packWithColors(
  results: DeliveryCalculationResult[],
  qtyOf: (r: DeliveryCalculationResult) => number
): DeliveryCalculationResult[][] {
  // 出現順を保ってカラー単位にグルーピング（計算結果はカラー順に並んでいる）
  const colorGroups = new Map<string, DeliveryCalculationResult[]>();
  for (const r of results) {
    const color = getColorName(r.name);
    const list = colorGroups.get(color);
    if (list) list.push(r);
    else colorGroups.set(color, [r]);
  }

  interface OpenPlan {
    items: DeliveryCalculationResult[];
    units: number;
    colors: Set<string>;
  }
  const plans: OpenPlan[] = [];

  for (const [color, group] of colorGroups) {
    const groupUnits = group.reduce((s, r) => s + qtyOf(r), 0);

    // カラーを丸ごと相乗りできる最初のプランを探す（混在は3カラー・5SKU・300点まで）
    const host = plans.find(
      (p) =>
        p.items.length + group.length <= MAX_SKUS_PER_PLAN &&
        new Set(p.colors).add(color).size <= MAX_COLORS_PER_PLAN &&
        p.units + groupUnits <= MAX_UNITS_PER_PLAN
    );
    if (host) {
      host.items.push(...group);
      host.units += groupUnits;
      host.colors.add(color);
      continue;
    }

    // どこにも相乗りできなければ、このカラー単独で新しいプランを作る。
    // 単独カラーはSKU数制限なし。300点を超える場合のみカラー内で分割する
    let current: OpenPlan = { items: [], units: 0, colors: new Set([color]) };
    plans.push(current);
    for (const r of group) {
      const q = qtyOf(r);
      if (current.items.length > 0 && current.units + q > MAX_UNITS_PER_PLAN) {
        current = { items: [], units: 0, colors: new Set([color]) };
        plans.push(current);
      }
      current.items.push(r);
      current.units += q;
    }
  }

  return plans.map((p) => p.items);
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
