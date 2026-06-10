import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { addDays, format, startOfDay } from "date-fns";
import { db } from "@/lib/db";
import {
  calculateBatch,
  OVERSHOOT_ALLOWANCE_WITH_PRES,
  OVERSHOOT_ALLOWANCE_WITHOUT_PRES,
} from "@/lib/delivery/calculator";
import { getColorName } from "@/lib/product-colors";
import type { ProductForCalculation } from "@/lib/delivery/types";

// 度あり用カテゴリ優先順
const PRESCRIPTION_CATEGORY_ORDER = [
  "1day10P", "1day30P", "高含水等", "Pixie",
  "ハイドロゲル", "UVチャーミング", "UVピュア", "1m2p",
  "色なしコンタクト", "Charm10P", "Charm30P",
];

// 度なし用カテゴリ
const WITHOUT_PRESCRIPTION_CATEGORY_ORDER = ["度なし"];

const schema = z.object({
  productType: z.enum(["WITH_PRESCRIPTION", "WITHOUT_PRESCRIPTION"]),
  targetTotal: z.number().int().min(100).max(2000),
  selectedCategories: z.array(z.string()).min(1).max(3).optional(),
  resume: z.boolean().optional().default(true), // 前回作成済みカラーの続きから計算する
});

/**
 * 直近の納品プラン作成日（同種別・キャンセル以外）に作成されたカラー一覧を返す。
 * 翌日の計算はこのカラー群の「次のカラー」から開始する
 */
async function getLastDeliveredColors(
  productType: "WITH_PRESCRIPTION" | "WITHOUT_PRESCRIPTION"
): Promise<{ colors: string[]; staNumber: string | null; workDate: string } | null> {
  const latestPlan = await db.deliveryPlan.findFirst({
    where: {
      status: { not: "CANCELLED" },
      items: { some: { product: { productType } } },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!latestPlan) return null;

  // 同じ作成日のプラン全件からカラーを集める（プランは1日に複数作成される）
  const dayStart = startOfDay(latestPlan.createdAt);
  const sameDayPlans = await db.deliveryPlan.findMany({
    where: {
      status: { not: "CANCELLED" },
      createdAt: { gte: dayStart, lt: addDays(dayStart, 1) },
      items: { some: { product: { productType } } },
    },
    include: {
      items: { include: { product: { select: { name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  const colors = new Set<string>();
  for (const plan of sameDayPlans) {
    for (const item of plan.items) {
      colors.add(getColorName(item.product.name));
    }
  }

  return {
    colors: [...colors],
    staNumber: sameDayPlans.at(-1)?.logilessOrderCode ?? null,
    workDate: format(latestPlan.createdAt, "M/d"),
  };
}

/**
 * POST /api/delivery-plan/calculate
 * 納品予定数の仮計算を実行する（DBには保存しない）
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "リクエストパラメータが不正です", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { productType, targetTotal, selectedCategories, resume } = parsed.data;

  const isWithPrescription = productType === "WITH_PRESCRIPTION";
  const categoryOrder = isWithPrescription
    ? (selectedCategories ?? PRESCRIPTION_CATEGORY_ORDER.slice(0, 3))
    : WITHOUT_PRESCRIPTION_CATEGORY_ORDER;
  const maxCategories = categoryOrder.length;

  // 対象商品を取得（ロジレス在庫・カテゴリ含む）
  const products = await db.product.findMany({
    where: {
      productType,
      isActive: true,
    },
    include: {
      logilessInventories: true,
      category: { select: { name: true } },
    },
    orderBy: { sku: "asc" },
  });

  // 計算用の型に変換
  const productsForCalc: ProductForCalculation[] = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    productType: p.productType,
    categoryName: p.category.name,
    fbaStockQuantity: p.fbaStockQuantity,
    fbaStockUpperLimit: p.fbaStockUpperLimit,
    fbaOpenPoQuantity: p.fbaOpenPoQuantity,
    logilessStockReserve: p.logilessStockReserve,
    business3m: p.business3m,
    isDiscontinued: p.isDiscontinued,
    logilessInventories: p.logilessInventories.map((inv) => ({
      location: inv.location,
      lotNumber: inv.lotNumber,
      quantity: inv.quantity,
      expiryDate: inv.expiryDate,
    })),
  }));

  // 前回の続きから計算する場合、保存済みの終了位置を優先し、
  // なければ直近作成日のプラン実績からカラー群を導出する
  let resumeAfterColors: string[] | undefined;
  let resumeSource: { workDate: string; staNumber: string | null } | null = null;
  if (resume) {
    const stored = await db.calculationEndPosition.findUnique({
      where: { productType },
    });
    if (stored?.colorName) {
      resumeAfterColors = [stored.colorName];
      resumeSource = { workDate: format(stored.updatedAt, "M/d"), staNumber: null };
    } else {
      const lastDelivered = await getLastDeliveredColors(productType);
      if (lastDelivered) {
        resumeAfterColors = lastDelivered.colors;
        resumeSource = {
          workDate: lastDelivered.workDate,
          staNumber: lastDelivered.staNumber,
        };
      }
    }
  }

  const maxPerPlan = 300;
  const summary = calculateBatch(productsForCalc, {
    targetTotal,
    maxPerPlan,
    maxCategories,
    categoryOrder,
    overshootAllowance: isWithPrescription
      ? OVERSHOOT_ALLOWANCE_WITH_PRES
      : OVERSHOOT_ALLOWANCE_WITHOUT_PRES,
    resumeAfterColors,
  });

  return NextResponse.json({
    summary: {
      totalQuantity: summary.totalQuantity,
      deliverableCount: summary.deliverableCount,
      skippedCount: summary.skippedCount,
      categoriesUsed: summary.categoriesUsed,
      maxTotal: summary.maxTotal,
      deferredColor: summary.deferredColor,
      resumedAfterColor: summary.resumedAfterColor,
    },
    resumeInfo:
      resumeSource && summary.resumedAfterColor
        ? {
            workDate: resumeSource.workDate,
            staNumber: resumeSource.staNumber,
            afterColor: summary.resumedAfterColor,
          }
        : null,
    results: summary.results,
    lastSku:
      summary.results.filter((r) => !r.skipReason).at(-1)?.sku ?? null,
  });
}
