import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { db } from "@/lib/db";
import { fetchFbaInventory } from "@/lib/sp-api/client";
import { SyncStatus, SyncType } from "@prisma/client";

/**
 * POST /api/sync/fba-inventory
 * SP-API から FBA 在庫を取得して products テーブルの fba_stock_quantity を更新する
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
    // SP-API から FBA 在庫を全件取得
    const fbaItems = await fetchFbaInventory();

    // DB の商品マスタから sku / fnsku → id のマップを作成
    const products = await db.product.findMany({
      select: { id: true, sku: true, fnsku: true },
    });
    const skuToId = new Map(products.map((p) => [p.sku, p.id]));
    const fnskuToId = new Map(
      products.filter((p) => p.fnsku).map((p) => [p.fnsku as string, p.id])
    );

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
        productId = fnskuToId.get(item.fnsku);
        if (productId) matchedByFnsku++;
      }

      if (!productId) {
        unmatched++;
        if (unmatchedSamples.length < 20) {
          unmatchedSamples.push({ sellerSku: item.sellerSku, fnsku: item.fnsku });
        }
        continue;
      }

      // FBA在庫 = 手持ち在庫（fulfillableQuantity）
      // 納品中・入出荷作業中・調査中・販売不可は含めない
      stockByProductId.set(
        productId,
        (stockByProductId.get(productId) ?? 0) + item.fulfillableQuantity
      );
    }

    // DB 更新
    const now = new Date();
    let updated = 0;
    for (const [productId, quantity] of stockByProductId) {
      await db.product.update({
        where: { id: productId },
        data: { fbaStockQuantity: quantity, fbaStockSyncedAt: now },
      });
      updated++;
    }

    const message = `${updated} 件更新（SKU一致: ${matchedBySku}、FNSKU一致: ${matchedByFnsku}、マッチなし: ${unmatched} / SP-API取得: ${fbaItems.length} 件）`;

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
