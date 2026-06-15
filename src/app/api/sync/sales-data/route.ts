import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { subMonths } from "date-fns";
import { db } from "@/lib/db";
import { requestSalesReport, fetchSalesReportResult } from "@/lib/sp-api/client";
import { SyncStatus, SyncType } from "@prisma/client";
import { ndjsonStream, wantsStream, type EmitFn } from "@/lib/sync/stream";

export const maxDuration = 300;

type SalesSyncResult = {
  fetched3m: number; // 3ヶ月で売上のあった SKU 数
  fetched1y: number; // 1年で売上のあった SKU 数
  matched: number; // 売上のあった SKU のうち商品マスタに一致した数
  unmatched: number; // 売上はあったが商品マスタに無い SKU 数
  updated: number; // business3m / business1y を更新した商品数
};

const DB_WRITE_CHUNK = 100;

async function runSalesSync(emit: EmitFn): Promise<SalesSyncResult> {
  const syncLog = await db.syncLog.create({
    data: { type: SyncType.SALES_DATA, status: SyncStatus.RUNNING },
  });

  try {
    const now = new Date();
    const end = now.toISOString();
    const start3m = subMonths(now, 3).toISOString();
    const start1y = subMonths(now, 12).toISOString();

    // 3ヶ月・1年の2レポートを並行生成して待ち時間を短縮する
    emit({ type: "phase", label: "SP-API: 売上レポートの作成をリクエスト中（3ヶ月・1年）" });
    const [reportId3m, reportId1y] = await Promise.all([
      requestSalesReport(start3m, end),
      requestSalesReport(start1y, end),
    ]);

    emit({ type: "phase", label: "Amazon でレポート生成中…（数分かかることがあります）" });
    const [sales3m, sales1y] = await Promise.all([
      fetchSalesReportResult(reportId3m, (msg) =>
        emit({ type: "phase", label: `3ヶ月レポート: ${msg}` })
      ),
      fetchSalesReportResult(reportId1y, (msg) =>
        emit({ type: "phase", label: `1年レポート: ${msg}` })
      ),
    ]);

    emit({ type: "phase", label: "DB を更新中" });

    const units3m = new Map(sales3m.map((s) => [s.sku, s.units]));
    const units1y = new Map(sales1y.map((s) => [s.sku, s.units]));

    // 親ASIN（バリエーション親）を sku→parentAsin で集約。
    // 1年レポート優先・3ヶ月で補完。親ASINは安定値なので最初に見つかった値を採用。
    const parentAsinBySku = new Map<string, string>();
    for (const s of [...sales1y, ...sales3m]) {
      if (s.parentAsin && !parentAsinBySku.has(s.sku)) {
        parentAsinBySku.set(s.sku, s.parentAsin);
      }
    }

    const products = await db.product.findMany({
      where: { isActive: true },
      select: { id: true, sku: true },
    });
    const masterSkus = new Set(products.map((p) => p.sku));

    // 売上のあった SKU のマスタ一致状況を集計
    let matched = 0;
    let unmatched = 0;
    for (const sku of new Set([...units3m.keys(), ...units1y.keys()])) {
      if (masterSkus.has(sku)) matched++;
      else unmatched++;
    }

    // アクティブ商品の売上をスナップショット更新する。
    // 期間内に売上が無い SKU は 0 で上書きし、古い値が残らないようにする。
    const syncedAt = new Date();
    const writes = products.map((p) =>
      db.product.update({
        where: { id: p.id },
        data: {
          business3m: units3m.get(p.sku) ?? 0,
          business1y: units1y.get(p.sku) ?? 0,
          salesDataSyncedAt: syncedAt,
          // 親ASINはレポートに出たSKUのみ更新（出ないSKUは既存値を保持）
          ...(parentAsinBySku.has(p.sku)
            ? { parentAsin: parentAsinBySku.get(p.sku)! }
            : {}),
        },
      })
    );

    if (writes.length > 0) {
      emit({
        type: "progress",
        current: 0,
        total: writes.length,
        label: `DB 書き込み中 (${writes.length}件)`,
      });
      for (let i = 0; i < writes.length; i += DB_WRITE_CHUNK) {
        await db.$transaction(writes.slice(i, i + DB_WRITE_CHUNK));
        emit({
          type: "progress",
          current: Math.min(i + DB_WRITE_CHUNK, writes.length),
          total: writes.length,
          label: "DB 書き込み中",
        });
      }
    }

    const updated = writes.length;
    const message = `売上更新 ${updated}件（売上あり SKU一致: ${matched}、マッチなし: ${unmatched} / 3ヶ月: ${sales3m.length}SKU、1年: ${sales1y.length}SKU）`;

    await db.syncLog.update({
      where: { id: syncLog.id },
      data: { status: SyncStatus.SUCCESS, finishedAt: new Date(), message },
    });

    return {
      fetched3m: sales3m.length,
      fetched1y: sales1y.length,
      matched,
      unmatched,
      updated,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync/sales-data]", message);

    await db.syncLog.update({
      where: { id: syncLog.id },
      data: { status: SyncStatus.FAILED, finishedAt: new Date(), message },
    });

    throw err;
  }
}

/**
 * POST /api/sync/sales-data
 * SP-API の売上・トラフィックレポートから直近3ヶ月・1年の販売数量を取得し、
 * products.business_3m / business_1y / sales_data_synced_at を更新する。
 *
 * Cronジョブ（Bearer CRON_SECRET）または画面から（Supabaseセッション）呼び出す。
 * Accept: application/x-ndjson を指定すると進捗イベントをストリーミング配信する。
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

  if (wantsStream(req)) {
    return ndjsonStream(async (emit) => {
      const result = await runSalesSync(emit);
      return { success: true, ...result };
    });
  }

  try {
    const result = await runSalesSync(() => {});
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/sync/sales-data
 * 最新の同期ログを返す
 */
export async function GET() {
  const logs = await db.syncLog.findMany({
    where: { type: SyncType.SALES_DATA },
    orderBy: { startedAt: "desc" },
    take: 10,
  });

  return NextResponse.json({ logs });
}
