import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { db } from "@/lib/db";
import { syncInactiveFbaSnapshot } from "@/lib/seller-switch/snapshot";

/**
 * /api/seller-switch/detect
 *
 * GET  : 現在の切替候補（停止中×FBAのスナップショット）一覧を返す
 * POST : 停止中×FBAを再取得してスナップショットと差分を取り、新規SKUを検出する（cron想定）
 *
 * 認証: CRON_SECRET (Bearer) または Supabase セッション
 */

async function isAuthed(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return true;

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

export async function GET(req: NextRequest) {
  if (!(await isAuthed(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const listings = await db.fbaInactiveListing.findMany({
      orderBy: { firstDetectedAt: "desc" },
    });

    const lastDetectedAt = listings.reduce<Date | null>((latest, l) => {
      return !latest || l.lastSeenAt > latest ? l.lastSeenAt : latest;
    }, null);

    return NextResponse.json({
      data: {
        total: listings.length,
        unprocessed: listings.filter((l) => !l.processedAt).length,
        lastDetectedAt,
        candidates: listings.map((l) => ({
          sku: l.sku,
          asin: l.asin,
          itemName: l.itemName,
          firstDetectedAt: l.firstDetectedAt,
          lastSeenAt: l.lastSeenAt,
          processedAt: l.processedAt,
        })),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[seller-switch/detect GET]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthed(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncInactiveFbaSnapshot();
    return NextResponse.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[seller-switch/detect POST]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
