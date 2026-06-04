import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSalesOrder, cancelSalesOrder } from "@/lib/logiless/client";

/**
 * POST /api/delivery-plan/[id]/cancel
 * 納品プランを取り消す。
 *   1. ロジレス側の受注をキャンセル（STA番号で検索してID特定）
 *   2. DBの DeliveryPlan.status を CANCELLED に更新
 *
 * 取り消し可能なステータスは DRAFT / SUBMITTED のみ。
 * 出荷済み(SHIPPED)・完了(COMPLETED)・取消済み(CANCELLED) は不可。
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const plan = await db.deliveryPlan.findUnique({ where: { id } });
  if (!plan) {
    return NextResponse.json(
      { success: false, error: "納品プランが見つかりません" },
      { status: 404 }
    );
  }

  if (plan.status !== "DRAFT" && plan.status !== "SUBMITTED") {
    return NextResponse.json(
      {
        success: false,
        error: `このプランは取り消せません（現在のステータス: ${plan.status}）`,
      },
      { status: 409 }
    );
  }

  try {
    // ── 1. ロジレス側の受注をキャンセル ──────────────────
    // STA番号でロジレスの受注を検索し、見つかればキャンセルする。
    // 既に存在しない / 未登録の場合はDB側のみ取り消す。
    if (plan.logilessOrderCode) {
      const order = await getSalesOrder(plan.logilessOrderCode);
      if (order) {
        // reuse_order_no=true で同じSTA番号を再利用可能にする
        await cancelSalesOrder(order.id, true);
      }
    }

    // ── 2. DBのステータスを CANCELLED に更新 ──────────────
    await db.deliveryPlan.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[delivery-plan/cancel]", message);

    // 423 Locked: ロジレス側で出荷作業中などのためキャンセル不可
    if (message.includes("423")) {
      return NextResponse.json(
        {
          success: false,
          error:
            "ロジレス側で出荷作業中などのため取り消せません。倉庫担当者に受注を「出荷待ち」へ戻してもらってから、再度お試しください。",
        },
        { status: 423 }
      );
    }

    return NextResponse.json(
      { success: false, error: `取り消しに失敗しました: ${message}` },
      { status: 500 }
    );
  }
}
