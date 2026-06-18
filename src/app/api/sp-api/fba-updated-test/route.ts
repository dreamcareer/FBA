import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { fetchFbaInventory } from "@/lib/sp-api/client";

/**
 * GET /api/sp-api/fba-updated-test
 *
 * FBA在庫APIの lastUpdatedTime が Seller Central の「最終更新日」と一致するかの検証用。
 *
 * クエリ:
 *   ?skus=a,b,c   指定SKUのみ返す（省略時は全件）
 *
 * 認証: CRON_SECRET (Bearer) または Supabase セッション
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
    const skusParam = req.nextUrl.searchParams.get("skus");
    const skuFilter = skusParam
      ? new Set(skusParam.split(",").map((s) => s.trim()).filter(Boolean))
      : null;

    const inventory = await fetchFbaInventory();
    const filtered = skuFilter
      ? inventory.filter((i) => skuFilter.has(i.sellerSku))
      : inventory;

    return NextResponse.json({
      total: inventory.length,
      returned: filtered.length,
      items: filtered.map((i) => ({
        sku: i.sellerSku,
        lastUpdatedTime: i.lastUpdatedTime,
        fulfillable: i.fulfillableQuantity,
        totalQuantity: i.totalQuantity,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[SP-API fba-updated-test]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
