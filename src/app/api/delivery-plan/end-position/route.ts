import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/delivery-plan/end-position?productType=WITH_PRESCRIPTION
 * 保存済みの仮プラン計算の終了位置を返す（種別ごとに最新1件）
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const productType = searchParams.get("productType");

  if (
    productType !== "WITH_PRESCRIPTION" &&
    productType !== "WITHOUT_PRESCRIPTION"
  ) {
    return NextResponse.json(
      { success: false, error: "productType が不正です" },
      { status: 400 }
    );
  }

  try {
    const endPosition = await db.calculationEndPosition.findUnique({
      where: { productType },
    });
    return NextResponse.json({ success: true, data: endPosition });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[delivery-plan/end-position]", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
