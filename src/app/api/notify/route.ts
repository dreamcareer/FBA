import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { notifyDailyReport, notifyWeeklySummary } from "@/lib/notify";

const dailySchema = z.object({
  type: z.literal("daily"),
  hasDelivery: z.boolean(),
  shipmentDay: z.string().optional(),
  planCount: z.number().optional(),
  totalQuantity: z.number().optional(),
  switchedSkuCount: z.number(),
  operatorName: z.string(),
});

const weeklySchema = z.object({
  type: z.literal("weekly"),
  weekRange: z.string(),
  completed: z.number(),
  inProgress: z.number(),
  waiting: z.number(),
});

const schema = z.discriminatedUnion("type", [dailySchema, weeklySchema]);

/**
 * POST /api/notify
 * Chatwork / Discord への通知送信
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "パラメータ不正", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    if (parsed.data.type === "daily") {
      await notifyDailyReport(parsed.data);
    } else {
      await notifyWeeklySummary(parsed.data);
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
