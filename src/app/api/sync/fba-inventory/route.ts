import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { db } from "@/lib/db";
import { fetchFbaInventory } from "@/lib/sp-api/client";
import { SyncStatus, SyncType } from "@prisma/client";

/**
 * POST /api/sync/fba-inventory
 * SP-API から FBA 在庫を取得し、以下を1パスで更新する:
 *  - products.sku / products.asin（FNSKU一致で SP-API 値に更新）
 *  - products.fba_stock_quantity（fulfillableQuantity）
 *
 * Cronジョブ（Bearer CRON_SECRET）または画面から（Supabaseセッション）呼び出す
 */
export async function POST(req: NextRequest) {
  // 認証: CRON_SECRET or Supabaseセッション
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

  const syncLog = await db.syncLog.create({
    data: { type: SyncType.FBA_INVENTORY, status: SyncStatus.RUNNING },
  });

  try {
    // SP-API から FBA 在庫を全件取得（1回のみ）
    const fbaItems = await fetchFbaInventory();

    const products = await db.product.findMany({
      select: { id: true, sku: true, fnsku: true, asin: true },
    });
    const skuToId = new Map(products.map((p) => [p.sku, p.id]));
    const fnskuToProduct = new Map(
      products.filter((p) => p.fnsku).map((p) => [p.fnsku as string, p])
    );

    // FNSKU → SP-APIの sellerSku/asin（SKU/ASIN更新の参照用、最初の1件を採用）
    const fnskuToSpApi = new Map<string, { sellerSku: string; asin: string | null }>();
    for (const item of fbaItems) {
      if (item.fnsku && !fnskuToSpApi.has(item.fnsku)) {
        fnskuToSpApi.set(item.fnsku, { sellerSku: item.sellerSku, asin: item.asin });
      }
    }

    // productId 単位で在庫を集約（同一商品が複数 condition で返ることがある）
    const stockByProductId = new Map<string, number>();
    let matchedBySku = 0;
    let matchedByFnsku = 0;
    let unmatched = 0;
    const unmatchedSamples: { sellerSku: string; fnsku: string | null }[] = [];

    for (const item of fbaItems) {
      let productId = skuToId.get(item.sellerSku);
      if (productId) {
        matchedBySku++;
      } else if (item.fnsku) {
        const p = fnskuToProduct.get(item.fnsku);
        productId = p?.id;
        if (productId) matchedByFnsku++;
      }

      if (!productId) {
        unmatched++;
        if (unmatchedSamples.length < 20) {
          unmatchedSamples.push({ sellerSku: item.sellerSku, fnsku: item.fnsku });
        }
        continue;
      }

      stockByProductId.set(
        productId,
        (stockByProductId.get(productId) ?? 0) + item.fulfillableQuantity
      );
    }

    // ── SKU/ASIN 更新の準備（FNSKU一致で値が変わる商品のみ） ──
    const skuOwners = new Map(products.map((p) => [p.sku, p.id]));
    const skuAsinWrites: ReturnType<typeof db.product.update>[] = [];
    let skuUpdated = 0;
    let skuConflicts = 0;

    for (const product of products) {
      if (!product.fnsku) continue;
      const spApi = fnskuToSpApi.get(product.fnsku);
      if (!spApi) continue;
      if (product.sku === spApi.sellerSku && product.asin === spApi.asin) continue;

      const owner = skuOwners.get(spApi.sellerSku);
      if (owner && owner !== product.id) {
        skuConflicts++;
        continue;
      }

      skuAsinWrites.push(
        db.product.update({
          where: { id: product.id },
          data: { sku: spApi.sellerSku, asin: spApi.asin },
        })
      );
      skuOwners.delete(product.sku);
      skuOwners.set(spApi.sellerSku, product.id);
      skuUpdated++;
    }

    // ── 数量更新の準備 ──
    const now = new Date();
    const stockWrites = Array.from(stockByProductId).map(([productId, quantity]) =>
      db.product.update({
        where: { id: productId },
        data: { fbaStockQuantity: quantity, fbaStockSyncedAt: now },
      })
    );

    // ── まとめてトランザクション実行（1往復で全件書き込み） ──
    if (skuAsinWrites.length > 0) {
      await db.$transaction(skuAsinWrites);
    }
    if (stockWrites.length > 0) {
      await db.$transaction(stockWrites);
    }

    const updated = stockWrites.length;
    const message = `数量${updated}件 / SKU${skuUpdated}件更新（SKU一致: ${matchedBySku}、FNSKU一致: ${matchedByFnsku}、マッチなし: ${unmatched}、SKU衝突: ${skuConflicts} / SP-API取得: ${fbaItems.length}件）`;

    await db.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: SyncStatus.SUCCESS,
        finishedAt: new Date(),
        message,
      },
    });

    return NextResponse.json({
      success: true,
      fetched: fbaItems.length,
      updated,
      skuUpdated,
      skuConflicts,
      matchedBySku,
      matchedByFnsku,
      unmatched,
      unmatchedSamples,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync/fba-inventory]", message);

    await db.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: SyncStatus.FAILED,
        finishedAt: new Date(),
        message,
      },
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/sync/fba-inventory
 * 最新の同期ログを返す
 */
export async function GET() {
  const logs = await db.syncLog.findMany({
    where: { type: SyncType.FBA_INVENTORY },
    orderBy: { startedAt: "desc" },
    take: 10,
  });

  return NextResponse.json({ logs });
}
