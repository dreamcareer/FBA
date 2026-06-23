import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { db } from "@/lib/db";

/**
 * /api/seller-switch/process
 *
 * POST : 切替候補を「処理済み（出品者出荷へ切替済み）」にする。
 *        補充数を併せて記録する（日報の「切替〇SKU & 在庫数」用）。
 *        undo=true で未処理に戻す。
 *
 * 認証: Supabase セッション（画面操作専用）
 */

async function isAuthed(req: NextRequest): Promise<boolean> {
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
  return !!user;
}

const schema = z.object({
  sku: z.string().min(1),
  replenishedQty: z.number().int().min(0).nullable().optional(),
  undo: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  if (!(await isAuthed(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "リクエストパラメータが不正です", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { sku, replenishedQty, undo } = parsed.data;

  try {
    const updated = await db.fbaInactiveListing.update({
      where: { sku },
      data: undo
        ? { processedAt: null, replenishedQty: null }
        : { processedAt: new Date(), replenishedQty: replenishedQty ?? null },
      select: { sku: true, processedAt: true, replenishedQty: true },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    // 対象SKUが存在しない場合（在庫復活で削除済み等）は404
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Record to update not found")) {
      return NextResponse.json(
        { error: `対象が見つかりません: ${sku}` },
        { status: 404 }
      );
    }
    console.error("[seller-switch/process POST]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
