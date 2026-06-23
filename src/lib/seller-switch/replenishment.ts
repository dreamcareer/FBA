import { differenceInMonths } from "date-fns";
import { isDeliveryExcludedLocation } from "@/lib/logiless/locations";
import type { LojilessInventoryForCalc } from "@/lib/delivery/types";

// ── 出品者出荷(FBM)切替時の補充数計算 ──────────────────────
//
// 手動手順③「補充数の決定（ロジレス保管状況で確認）」をコード化したもの。
// ロジレス在庫ロットを有効期限で2バケットに集計し、決定表で補充数を決める。
//
//   ge14  : 14ヶ月以上の在庫合計
//   mid   : 6〜14ヶ月の在庫合計
//   total : 総在庫 = ge14 + mid（6ヶ月未満ロットは数えない）
//
// 除外ロケーション（出荷期限切れ品/アウトレット専用/FBA専用/Amazon倉庫等）は
// 集計前に弾く（納品数量計算と共通: isDeliveryExcludedLocation）。

const EXPIRY_GE_MONTHS = 14; // 「14ヶ月以上」の境界
const EXPIRY_MID_MONTHS = 6; // 「6〜14ヶ月」の下限

export type ReplenishmentRule =
  | "RULE_1_STABLE" // 14ヶ月以上が潤沢（または6〜14ヶ月十分＋14ヶ月以上40以上）
  | "RULE_2_MID" // 6〜14ヶ月が潤沢・14ヶ月以上が1〜40未満
  | "RULE_3_HALF" // 14ヶ月以上が0・6〜14ヶ月のみ → 総在庫の半分（偶数）
  | "NONE"; // どの条件にも当たらず補充0（在庫不足）

export interface ReplenishmentResult {
  /** 補充数。0 = 在庫不足で補充対象外 */
  quantity: number;
  /** 14ヶ月以上の在庫合計 */
  ge14: number;
  /** 6〜14ヶ月の在庫合計 */
  mid: number;
  /** 総在庫（ge14 + mid） */
  total: number;
  /** 適用された決定表の枝 */
  matchedRule: ReplenishmentRule;
}

/** 偶数に切り下げ（例: 7→6, 5.5→4, 6→6） */
function floorToEven(n: number): number {
  return Math.floor(n / 2) * 2;
}

/**
 * ロジレス在庫ロットから出品者出荷切替時の補充数を算出する。
 *
 * @param lots 対象商品のロジレス在庫ロット（除外ロケーションは内部で弾く）
 * @param now  基準日時（テスト用に注入可能）
 */
export function calcReplenishment(
  lots: LojilessInventoryForCalc[],
  now: Date = new Date()
): ReplenishmentResult {
  let ge14 = 0;
  let mid = 0;

  for (const lot of lots) {
    if (lot.quantity <= 0) continue;
    if (isDeliveryExcludedLocation(lot.location)) continue;
    // 期限なし（長期保存品）は14ヶ月以上扱い（納品数量計算と同じ扱い）
    const months =
      lot.expiryDate == null
        ? Number.POSITIVE_INFINITY
        : differenceInMonths(lot.expiryDate, now);

    if (months >= EXPIRY_GE_MONTHS) ge14 += lot.quantity;
    else if (months >= EXPIRY_MID_MONTHS) mid += lot.quantity;
    // 6ヶ月未満（期限切れ含む）は総在庫に数えない
  }

  const total = ge14 + mid;

  let quantity = 0;
  let matchedRule: ReplenishmentRule = "NONE";

  if (ge14 >= 50 || (mid >= 10 && ge14 >= 40)) {
    // ①14ヶ月以上が50以上 または（6〜14ヶ月が10以上 かつ 14ヶ月以上が40以上）
    matchedRule = "RULE_1_STABLE";
    quantity = total >= 80 ? 6 : total >= 50 ? 2 : 0;
  } else if (mid >= 30 && ge14 >= 1 && ge14 < 40) {
    // ②6〜14ヶ月が30以上 かつ 14ヶ月以上が1〜40未満
    matchedRule = "RULE_2_MID";
    quantity = total >= 80 ? 20 : total >= 50 ? 10 : total >= 30 ? 6 : 0;
  } else if (mid >= 10 && ge14 === 0) {
    // ③6〜14ヶ月が10以上 かつ 14ヶ月以上が0 → 総在庫の半分（偶数個）
    matchedRule = "RULE_3_HALF";
    quantity = floorToEven(total / 2);
  }
  // 上記いずれにも当たらない隙間（例: ge14∈[40,50) かつ mid<10）は
  // 仕様どおり補充0（在庫不足扱い）。

  return { quantity, ge14, mid, total, matchedRule };
}
