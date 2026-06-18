import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { searchListings } from "@/lib/sp-api/client";

/**
 * GET /api/sp-api/listings-test
 *
 * Seller Central の「出品ステータス=停止中 / 出荷元=Amazon / 並べ替え=最終更新日 /
 * 更新日が前日12時以降」を SP-API(searchListingsItems) で再現できるかの検証用。
 *
 * クエリ:
 *   ?since=ISO8601   最終更新日の下限（既定: 前日12:00 JST）
 *   ?inactive=false  status フィルタを外して全件見る（既定: 停止中のみ）
 *
 * 認証: CRON_SECRET (Bearer) または Supabase セッション（sp-api/test と同じ）
 */
export async function GET(req: NextRequest) {
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
    // 前日12:00 JST = 前日03:00 UTC を既定の下限にする
    const sinceParam = req.nextUrl.searchParams.get("since");
    const lastUpdatedAfter = sinceParam ?? defaultSinceYesterdayNoonJst();

    const onlyInactive = req.nextUrl.searchParams.get("inactive") !== "false";
    const onlyFba = req.nextUrl.searchParams.get("fba") === "true";

    const listings = await searchListings({ lastUpdatedAfter, onlyInactive, onlyFba });

    // 出荷元(fulfillmentChannelCode)別の内訳。AMAZON_*=FBA / DEFAULT=出品者出荷
    const byChannel: Record<string, number> = {};
    for (const l of listings) {
      const ch = l.fulfillmentAvailability[0]?.fulfillmentChannelCode || "(none)";
      byChannel[ch] = (byChannel[ch] ?? 0) + 1;
    }

    return NextResponse.json({
      query: { lastUpdatedAfter, onlyInactive, onlyFba },
      count: listings.length,
      byChannel,
      // 出荷元の判定材料を見たいので fulfillmentAvailability も含めて返す
      items: listings.map((l) => ({
        sku: l.sku,
        asin: l.asin,
        itemName: l.itemName,
        status: l.status,
        lastUpdatedDate: l.lastUpdatedDate,
        fulfillmentAvailability: l.fulfillmentAvailability,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[SP-API listings-test]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** 前日12:00 JST を ISO 8601(UTC) で返す（12:00 JST = 03:00 UTC） */
function defaultSinceYesterdayNoonJst(): string {
  const now = new Date();
  // JSTの暦日を得るため +9h してUTCフィールドを読む
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth();
  const d = jst.getUTCDate();
  // 前日12:00 JST → UTCでは前日03:00
  return new Date(Date.UTC(y, m, d - 1, 3, 0, 0)).toISOString();
}
