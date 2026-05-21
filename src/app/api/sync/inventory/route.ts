import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { db } from "@/lib/db";
import { fetchActualInventories } from "@/lib/logiless/client";
import { SyncStatus, SyncType } from "@prisma/client";
import { ndjsonStream, wantsStream, type EmitFn } from "@/lib/sync/stream";

export const maxDuration = 300;

type LogilessSyncResult = {
  synced: number;
};

async function runLogilessSync(emit: EmitFn): Promise<LogilessSyncResult> {
  const syncLog = await db.syncLog.create({
    data: { type: SyncType.LOGILESS_INVENTORY, status: SyncStatus.RUNNING },
  });

  try {
    // Logiless から在庫取得（LotNumberレベル、APIでフィルタ済み）
    emit({ type: "phase", label: "ロジレス在庫を取得中" });
    const allInventories = await fetchActualInventories(undefined, (current, page) => {
      emit({
        type: "progress",
        current,
        label: `ロジレス在庫 ページ${page} (${current}件取得済み)`,
      });
    });

    emit({ type: "phase", label: "データを整形中" });
    // 什器・備品・空箱等（2000...コード）を除外、在庫0を除外
    const inventories = allInventories.filter(
      (inv) => !inv.article.code.startsWith("2000") && (inv.available > 0 || inv.blocked > 0)
    );

    // DBの商品マスタから logilessProductCode → id のマップを作成
    const products = await db.product.findMany({
      select: { id: true, logilessProductCode: true },
    });
    const codeToId = new Map(
      products.filter((p) => p.logilessProductCode).map((p) => [p.logilessProductCode, p.id])
    );

    // 既存のロジレス在庫を全削除してから再登録（全量洗い替え）
    emit({ type: "phase", label: "既存の在庫データを削除中" });
    await db.logilessInventory.deleteMany();

    // 新しいデータを一括挿入
    const records = inventories
      .map((inv) => {
        const productId = codeToId.get(inv.article.code);
        if (!productId) return null;

        const deadline = inv.deadline ?? inv.expiration_date;

        return {
          productId,
          location: inv.location?.name ?? inv.location?.code ?? null,
          lotNumber: inv.lot_number ?? null,
          quantity: inv.available + inv.blocked,
          expiryDate: deadline ? new Date(deadline) : null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    emit({
      type: "progress",
      current: 0,
      total: records.length,
      label: `DB に書き込み中 (${records.length}件)`,
    });
    await db.logilessInventory.createMany({ data: records });
    emit({
      type: "progress",
      current: records.length,
      total: records.length,
      label: `DB 書き込み完了`,
    });

    // ログ完了
    await db.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: SyncStatus.SUCCESS,
        finishedAt: new Date(),
        message: `${records.length} 件を同期`,
      },
    });

    return { synced: records.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync/inventory]", message);

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
 * POST /api/sync/inventory
 * Logiless からロット別在庫を取得してDBに保存する
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

  if (wantsStream(req)) {
    return ndjsonStream(async (emit) => {
      const result = await runLogilessSync(emit);
      return { success: true, ...result };
    });
  }

  try {
    const result = await runLogilessSync(() => {});
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/sync/inventory
 * 最新の同期ログを返す
 */
export async function GET() {
  const logs = await db.syncLog.findMany({
    where: { type: SyncType.LOGILESS_INVENTORY },
    orderBy: { startedAt: "desc" },
    take: 10,
  });

  return NextResponse.json({ logs });
}
