import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { db } from "@/lib/db";
import { fetchActualInventories } from "@/lib/logiless/client";
import { SyncStatus, SyncType } from "@prisma/client";

/**
 * POST /api/sync/inventory
 * Logiless からロット別在庫を取得してDBに保存する
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
          getAll() { return req.cookies.getAll(); },
          setAll() {},
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // 同期ログ開始
  const syncLog = await db.syncLog.create({
    data: { type: SyncType.LOGILESS_INVENTORY, status: SyncStatus.RUNNING },
  });

  try {
    // Logiless から在庫取得（LotNumberレベル、APIでフィルタ済み）
    // 什器・備品・空箱等（2000...コード）を除外、在庫0を除外
    const allInventories = await fetchActualInventories();
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

    await db.logilessInventory.createMany({ data: records });

    // ログ完了
    await db.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: SyncStatus.SUCCESS,
        finishedAt: new Date(),
        message: `${records.length} 件を同期`,
      },
    });

    return NextResponse.json({
      success: true,
      synced: records.length,
    });
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
