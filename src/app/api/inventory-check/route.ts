import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { db } from "@/lib/db";
import {
  getQuantityFromSku,
  getThreshold,
  type ShortageItem,
  type CheckResult,
} from "@/lib/inventory-check";

/**
 * POST /api/inventory-check
 * 在庫洗い出しを実行し結果をDBに保存
 */
export async function POST(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll() {},
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const products = await db.product.findMany({
    where: { isActive: true },
    include: {
      logilessInventories: true,
      category: true,
    },
    orderBy: { sku: "asc" },
  });

  const shortagesByCategory: Record<string, ShortageItem[]> = {};

  for (const product of products) {
    const logilessTotal = product.logilessInventories.reduce((s, i) => s + i.quantity, 0);
    const isPrescription = product.productType === "WITH_PRESCRIPTION";
    const quantity = getQuantityFromSku(product.sku);
    const threshold = getThreshold(quantity, isPrescription);

    if (threshold === null) continue;
    if (logilessTotal >= threshold) continue;

    const categoryName = product.category.name;
    const item: ShortageItem = {
      id: product.id,
      name: product.name,
      sku: product.sku,
      fnsku: product.fnsku,
      logilessStock: logilessTotal,
      threshold,
      isPrescription,
      categoryName,
      nextArrivalDate: product.nextArrivalDate?.toISOString().slice(0, 10) ?? null,
      nextArrivalQuantity: product.nextArrivalQuantity,
    };

    if (!shortagesByCategory[categoryName]) {
      shortagesByCategory[categoryName] = [];
    }
    shortagesByCategory[categoryName].push(item);
  }

  const totalCount = Object.values(shortagesByCategory).reduce((s, items) => s + items.length, 0);
  const now = new Date();

  const result: CheckResult = {
    totalCount,
    executedAt: now.toISOString(),
    shortagesByCategory,
  };

  // DBに保存（最新1件だけ残す）
  await db.inventoryCheckResult.deleteMany();
  await db.inventoryCheckResult.create({
    data: {
      totalCount,
      data: JSON.stringify(result),
      executedAt: now,
    },
  });

  return NextResponse.json(result);
}

/**
 * GET /api/inventory-check
 * 最新の洗い出し結果を取得
 */
export async function GET() {
  const latest = await db.inventoryCheckResult.findFirst({
    orderBy: { executedAt: "desc" },
  });

  if (!latest) {
    return NextResponse.json({ result: null });
  }

  return NextResponse.json({ result: JSON.parse(latest.data) });
}
