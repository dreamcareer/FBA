import { subDays } from "date-fns";
import type { FbaInactiveListing } from "@prisma/client";
import { db } from "@/lib/db";
import { calcReplenishment } from "./replenishment";
import { getExclusionReason } from "./exclusions";

// ── 切替候補のエンリッチ（②突合＋③補充数＋除外） ──────────
//
// 検出済みの「停止中×FBA」候補（FbaInactiveListing）に対し、
// 商品マスタ・ロジレス在庫・進行中の納品プランを突き合わせて判定を付ける。
//
// ②の「出荷完了かどうか」は、システムの納品プランで近似する:
//   進行中（DRAFT/SUBMITTED/SHIPPED）かつ直近ウィンドウ内の納品プランが
//   そのSKUにあれば「FBA納品が進行中」= 切替せず待つ。
//   （COMPLETED/SHIPPED への遷移は現状同期していないため、期間で近似）

const IN_FLIGHT_WINDOW_DAYS = 14; // 「進行中の納品」とみなす直近日数（調整可）

const IN_FLIGHT_STATUSES = ["DRAFT", "SUBMITTED", "SHIPPED"] as const;

export type Judgement =
  | "TARGET" // 切替対象（補充数あり）
  | "WAITING" // FBA納品が進行中 → 切替しない
  | "EXCLUDED" // 度なし/セット/mpb/マスタ未登録
  | "NO_STOCK"; // ロジレス在庫不足で補充できない

export interface EnrichedCandidate {
  sku: string;
  asin: string | null;
  itemName: string | null;
  firstDetectedAt: Date;
  lastSeenAt: Date;
  processedAt: Date | null;
  replenishedQty: number | null;
  judgement: Judgement;
  exclusionReason: string | null;
  inFlight: boolean;
  inFlightOrderCode: string | null;
  replenishment: { quantity: number; ge14: number; mid: number; total: number } | null;
}

/**
 * 候補一覧に判定・補充数・除外理由を付与して返す。
 * 検出ロジック（snapshot）には手を入れず、表示・判断のための読み取り専用処理。
 */
export async function enrichCandidates(
  listings: FbaInactiveListing[],
  now: Date = new Date()
): Promise<EnrichedCandidate[]> {
  const skus = listings.map((l) => l.sku);
  if (skus.length === 0) return [];

  // 商品マスタ＋ロジレス在庫を一括取得
  const products = await db.product.findMany({
    where: { sku: { in: skus } },
    select: {
      sku: true,
      name: true,
      productType: true,
      logilessInventories: {
        select: {
          location: true,
          lotNumber: true,
          quantity: true,
          expiryDate: true,
        },
      },
    },
  });
  const productBySku = new Map(products.map((p) => [p.sku, p]));

  // 進行中（直近ウィンドウ内・未完了）の納品プランに含まれるSKUを取得
  const cutoff = subDays(now, IN_FLIGHT_WINDOW_DAYS);
  const inFlightItems = await db.deliveryPlanItem.findMany({
    where: {
      product: { sku: { in: skus } },
      deliveryPlan: {
        status: { in: [...IN_FLIGHT_STATUSES] },
        // 出荷予定日があればそれ、なければ作成日でウィンドウ判定
        OR: [
          { shipmentDate: { gte: cutoff } },
          { shipmentDate: null, createdAt: { gte: cutoff } },
        ],
      },
    },
    select: {
      product: { select: { sku: true } },
      deliveryPlan: { select: { logilessOrderCode: true } },
    },
  });
  const inFlightBySku = new Map<string, string | null>();
  for (const it of inFlightItems) {
    if (!inFlightBySku.has(it.product.sku)) {
      inFlightBySku.set(it.product.sku, it.deliveryPlan.logilessOrderCode);
    }
  }

  return listings.map((l) => {
    const product = productBySku.get(l.sku);
    const inFlight = inFlightBySku.has(l.sku);
    const inFlightOrderCode = inFlightBySku.get(l.sku) ?? null;

    let exclusionReason: string | null = null;
    let replenishment: EnrichedCandidate["replenishment"] = null;

    if (!product) {
      exclusionReason = "マスタ未登録";
    } else {
      exclusionReason = getExclusionReason({
        sku: l.sku,
        name: product.name,
        productType: product.productType,
      });
      if (!exclusionReason) {
        const r = calcReplenishment(product.logilessInventories, now);
        replenishment = {
          quantity: r.quantity,
          ge14: r.ge14,
          mid: r.mid,
          total: r.total,
        };
      }
    }

    // 判定の優先順位: 対象外 > 進行中 > 切替対象 > 在庫不足
    let judgement: Judgement;
    if (exclusionReason) judgement = "EXCLUDED";
    else if (inFlight) judgement = "WAITING";
    else if ((replenishment?.quantity ?? 0) > 0) judgement = "TARGET";
    else judgement = "NO_STOCK";

    return {
      sku: l.sku,
      asin: l.asin,
      itemName: l.itemName ?? product?.name ?? null,
      firstDetectedAt: l.firstDetectedAt,
      lastSeenAt: l.lastSeenAt,
      processedAt: l.processedAt,
      replenishedQty: l.replenishedQty,
      judgement,
      exclusionReason,
      inFlight,
      inFlightOrderCode,
      replenishment,
    };
  });
}
