import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { calculateBatch } from "@/lib/delivery/calculator";
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
});

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

  const { productType, targetTotal, selectedCategories } = parsed.data;

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

  const maxPerPlan = 300;
  const summary = calculateBatch(productsForCalc, {
    targetTotal,
    maxPerPlan,
    maxCategories,
    categoryOrder,
  });

  return NextResponse.json({
    summary: {
      totalQuantity: summary.totalQuantity,
      deliverableCount: summary.deliverableCount,
      skippedCount: summary.skippedCount,
      categoriesUsed: summary.categoriesUsed,
    },
    results: summary.results,
    lastSku:
      summary.results.filter((r) => !r.skipReason).at(-1)?.sku ?? null,
  });
}
