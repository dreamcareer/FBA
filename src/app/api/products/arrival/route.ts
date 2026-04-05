import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { db } from "@/lib/db";

/**
 * PUT /api/products/arrival
 * 次回入荷予定日・次回入荷数を更新
 */
export async function PUT(req: NextRequest) {
  // 認証
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

  const body = await req.json();
  const { productId, nextArrivalDate, nextArrivalQuantity } = body;

  if (!productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }

  await db.product.update({
    where: { id: productId },
    data: {
      nextArrivalDate: nextArrivalDate ? new Date(nextArrivalDate) : null,
      nextArrivalQuantity: nextArrivalQuantity != null ? Number(nextArrivalQuantity) : null,
    },
  });

  return NextResponse.json({ success: true });
}
