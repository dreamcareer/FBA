import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { db } from "@/lib/db";
import { fetchFbaInventory } from "@/lib/sp-api/client";

// 長時間実行を許可
export const maxDuration = 300;

/**
 * POST /api/sync/sp-api-skus
 *
 * SP-API FBA在庫から sellerSku / asin を取得し、FNSKU一致で
 * products.sku / products.asin を更新する。
 *
 * 認証: CRON_SECRET または Supabaseセッション
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isCron) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll() {},
        },
      }
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const fbaItems = await fetchFbaInventory();

    // FNSKU → SP-APIの sellerSku / asin（同一FNSKUの重複は最初の1件を採用）
    const fnskuMap = new Map<string, { sellerSku: string; asin: string | null }>();
    for (const item of fbaItems) {
      if (!item.fnsku) continue;
      if (!fnskuMap.has(item.fnsku)) {
        fnskuMap.set(item.fnsku, { sellerSku: item.sellerSku, asin: item.asin });
      }
    }

    // 既存全SKU → productId（衝突判定用）
    const allProducts = await db.product.findMany({
      select: { id: true, sku: true, fnsku: true, asin: true },
    });
    const skuToProductId = new Map(allProducts.map((p) => [p.sku, p.id]));

    let updated = 0;
    let alreadyOk = 0;
    let notFoundInSpApi = 0;
    let noFnsku = 0;
    const conflicts: {
      productId: string;
      fnsku: string;
      spApiSku: string;
      conflictingProductId: string;
    }[] = [];
    const updatedSamples: {
      productId: string;
      from: string;
      to: string;
      asin: string | null;
    }[] = [];

    const writes: ReturnType<typeof db.product.update>[] = [];

    for (const product of allProducts) {
      if (!product.fnsku) {
        noFnsku++;
        continue;
      }

      const spApi = fnskuMap.get(product.fnsku);
      if (!spApi) {
        notFoundInSpApi++;
        continue;
      }

      if (product.sku === spApi.sellerSku && product.asin === spApi.asin) {
        alreadyOk++;
        continue;
      }

      const conflictId = skuToProductId.get(spApi.sellerSku);
      if (conflictId && conflictId !== product.id) {
        conflicts.push({
          productId: product.id,
          fnsku: product.fnsku,
          spApiSku: spApi.sellerSku,
          conflictingProductId: conflictId,
        });
        continue;
      }

      writes.push(
        db.product.update({
          where: { id: product.id },
          data: { sku: spApi.sellerSku, asin: spApi.asin },
        })
      );
      skuToProductId.delete(product.sku);
      skuToProductId.set(spApi.sellerSku, product.id);

      if (updatedSamples.length < 20) {
        updatedSamples.push({
          productId: product.id,
          from: product.sku,
          to: spApi.sellerSku,
          asin: spApi.asin,
        });
      }
      updated++;
    }

    if (writes.length > 0) {
      await db.$transaction(writes);
    }

    return NextResponse.json({
      success: true,
      fetched: fbaItems.length,
      fnskusInSpApi: fnskuMap.size,
      productsTotal: allProducts.length,
      updated,
      alreadyOk,
      notFoundInSpApi,
      noFnsku,
      conflicts,
      updatedSamples,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync/sp-api-skus]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
