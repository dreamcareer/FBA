import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { db } from "@/lib/db";
import { fetchFbaInventory } from "@/lib/sp-api/client";
import { SyncStatus, SyncType } from "@prisma/client";
import { ndjsonStream, wantsStream, type EmitFn } from "@/lib/sync/stream";

export const maxDuration = 300;

type FbaSyncResult = {
  fetched: number;
  updated: number;
  asinUpdated: number;
  matched: number;
  unmatched: number;
  unmatchedSamples: { sellerSku: string }[];
};

async function runFbaSync(emit: EmitFn, updateAsin: boolean): Promise<FbaSyncResult> {
  const syncLog = await db.syncLog.create({
    data: { type: SyncType.FBA_INVENTORY, status: SyncStatus.RUNNING },
  });

  try {
    emit({ type: "phase", label: "SP-API から FBA 在庫を取得中" });
    const fbaItems = await fetchFbaInventory((current) => {
      emit({
        type: "progress",
        current,
        label: `FBA在庫 ${current}件取得済み`,
      });
    });

    emit({ type: "phase", label: "DB を更新中" });

    const products = await db.product.findMany({
      select: { id: true, sku: true, asin: true },
    });
    const skuToProduct = new Map(products.map((p) => [p.sku, p]));

    // SKU → SP-APIの asin（ASIN更新用、最初の1件を採用）
    const skuToSpApiAsin = new Map<string, string | null>();
    for (const item of fbaItems) {
      if (!skuToSpApiAsin.has(item.sellerSku)) {
        skuToSpApiAsin.set(item.sellerSku, item.asin);
      }
    }

    // productId 単位で在庫を集約（同一商品が複数 condition で返ることがある）
    const stockByProductId = new Map<string, number>();
    let matched = 0;
    let unmatched = 0;
    const unmatchedSamples: { sellerSku: string }[] = [];

    for (const item of fbaItems) {
      const product = skuToProduct.get(item.sellerSku);
      if (!product) {
        unmatched++;
        if (unmatchedSamples.length < 20) {
          unmatchedSamples.push({ sellerSku: item.sellerSku });
        }
        continue;
      }
      matched++;

      stockByProductId.set(
        product.id,
        (stockByProductId.get(product.id) ?? 0) + item.fulfillableQuantity
      );
    }

    // ── ASIN 更新の準備（SKU一致でSP-APIのASINと差分があるもののみ） ──
    // updateAsin=false（通常のFBA在庫のみ同期）のときは ASIN を触らない。
    // ASIN 更新は商品マスタ再取得の一環としてのみ行う。
    const asinWrites: ReturnType<typeof db.product.update>[] = [];
    let asinUpdated = 0;

    if (updateAsin) {
      for (const product of products) {
        const spApiAsin = skuToSpApiAsin.get(product.sku);
        if (spApiAsin === undefined) continue;
        if (product.asin === spApiAsin) continue;

        asinWrites.push(
          db.product.update({
            where: { id: product.id },
            data: { asin: spApiAsin },
          })
        );
        asinUpdated++;
      }
    }

    // ── 数量更新の準備 ──
    const now = new Date();
    const stockWrites = Array.from(stockByProductId).map(([productId, quantity]) =>
      db.product.update({
        where: { id: productId },
        data: { fbaStockQuantity: quantity, fbaStockSyncedAt: now },
      })
    );

    // ── まとめてトランザクション実行 ──
    const totalWrites = asinWrites.length + stockWrites.length;
    if (totalWrites > 0) {
      emit({
        type: "progress",
        current: 0,
        total: totalWrites,
        label: `DB 書き込み中 (${totalWrites}件)`,
      });
    }
    if (asinWrites.length > 0) {
      await db.$transaction(asinWrites);
      emit({
        type: "progress",
        current: asinWrites.length,
        total: totalWrites,
        label: `DB 書き込み中 (ASIN 完了)`,
      });
    }
    if (stockWrites.length > 0) {
      await db.$transaction(stockWrites);
      emit({
        type: "progress",
        current: totalWrites,
        total: totalWrites,
        label: `DB 書き込み完了`,
      });
    }

    const updated = stockWrites.length;
    const asinPart = updateAsin ? ` / ASIN${asinUpdated}件` : "";
    const message = `数量${updated}件${asinPart}更新（SKU一致: ${matched}、マッチなし: ${unmatched} / SP-API取得: ${fbaItems.length}件）`;

    await db.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: SyncStatus.SUCCESS,
        finishedAt: new Date(),
        message,
      },
    });

    return {
      fetched: fbaItems.length,
      updated,
      asinUpdated,
      matched,
      unmatched,
      unmatchedSamples,
    };
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

    throw err;
  }
}

/**
 * POST /api/sync/fba-inventory
 * SP-API から FBA 在庫を取得して更新する:
 *  - products.fba_stock_quantity（fulfillableQuantity）← 常に更新
 *  - products.asin（SKU一致で SP-API 値に更新）← ?withAsin=true のときのみ
 *
 * ?withAsin=true は商品マスタ再取得の一環として呼ぶ用途。
 * 通常の「FBA在庫のみ」同期では ASIN を触らない。
 *
 * Cronジョブ（Bearer CRON_SECRET）または画面から（Supabaseセッション）呼び出す
 *
 * Accept: application/x-ndjson を指定すると進捗イベントをストリーミング配信する
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

  // ?withAsin=true のときだけ ASIN を更新する（商品マスタ再取得の一環）。
  // 通常の「FBA在庫のみ」同期では ASIN を触らない。
  const updateAsin = req.nextUrl.searchParams.get("withAsin") === "true";

  if (wantsStream(req)) {
    return ndjsonStream(async (emit) => {
      const result = await runFbaSync(emit, updateAsin);
      return { success: true, ...result };
    });
  }

  try {
    const result = await runFbaSync(() => {}, updateAsin);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
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
