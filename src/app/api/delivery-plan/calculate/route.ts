import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { calculateBatch } from "@/lib/delivery/calculator";
import type { ProductForCalculation } from "@/lib/delivery/types";

const schema = z.object({
  productType: z.enum(["WITH_PRESCRIPTION", "WITHOUT_PRESCRIPTION"]),
  targetTotal: z.number().int().min(100).max(2000),
  startFromSku: z.string().optional(),
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

  const { productType, targetTotal, startFromSku } = parsed.data;

  // 対象商品を取得（ロジレス在庫含む）
  const products = await db.product.findMany({
    where: {
      productType,
      isActive: true,
    },
    include: {
      logilessInventories: true,
    },
    orderBy: { sku: "asc" },
  });

  // startFromSku が指定されている場合はそのSKU以降を対象にする
  const startIndex = startFromSku
    ? products.findIndex((p) => p.sku >= startFromSku)
    : 0;
  const targetProducts = products.slice(Math.max(startIndex, 0));

  // 計算用の型に変換
  const productsForCalc: ProductForCalculation[] = targetProducts.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    productType: p.productType,
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
  const summary = calculateBatch(productsForCalc, { targetTotal, maxPerPlan });

  return NextResponse.json({
    summary: {
      totalQuantity: summary.totalQuantity,
      deliverableCount: summary.deliverableCount,
      skippedCount: summary.skippedCount,
    },
    results: summary.results,
    lastSku:
      summary.results.filter((r) => !r.skipReason).at(-1)?.sku ?? null,
  });
}
