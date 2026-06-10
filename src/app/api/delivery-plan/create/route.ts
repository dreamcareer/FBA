import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { createSalesOrder } from "@/lib/logiless/client";
import { notifyDeliveryPlanCreated } from "@/lib/notify";
import { uploadFile } from "@/lib/dropbox/client";
import { buildDeliveryPlanCsv } from "@/lib/delivery/csv";

const itemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1),
  lotNumber: z.string().optional(),
  expiryDate: z.string().optional(),
});

const schema = z.object({
  items: z.array(itemSchema).min(1).max(300),
  shipmentDate: z.string(),              // ISO string
  logilessOrderCode: z.string().regex(/^STA\d{8}-\d+$/), // STAyyyymmdd-n
});

/**
 * POST /api/delivery-plan/create
 * 1. DBに納品プランを保存
 * 2. ロジレスに受注登録
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "リクエストパラメータが不正です", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { items, shipmentDate, logilessOrderCode } = parsed.data;

  // 重複チェック
  const existing = await db.deliveryPlan.findUnique({
    where: { logilessOrderCode },
  });
  if (existing) {
    return NextResponse.json(
      { error: `${logilessOrderCode} はすでに登録済みです` },
      { status: 409 }
    );
  }

  // 商品IDからSKU等を取得
  const productIds = items.map((i) => i.productId);
  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, sku: true, productType: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  // 未知の商品チェック
  const unknownIds = productIds.filter((id) => !productMap.has(id));
  if (unknownIds.length > 0) {
    return NextResponse.json(
      { error: `不明な商品ID: ${unknownIds.join(", ")}` },
      { status: 400 }
    );
  }

  const shipDate = new Date(shipmentDate);

  try {
    // ── 1. DBに納品プランを保存 ─────────────────────────
    const plan = await db.deliveryPlan.create({
      data: {
        name: logilessOrderCode,
        logilessOrderCode,
        shipmentDate: shipDate,
        status: "DRAFT",
        items: {
          create: items.map((item) => ({
            productId: item.productId,
            plannedQuantity: item.quantity,
            lotNumber: item.lotNumber ?? null,
            expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
          })),
        },
      },
      include: { items: { include: { product: true } } },
    });

    // ── 2. ロジレスに受注登録 ───────────────────────────
    const logilessRes = await createSalesOrder({
      order_no: logilessOrderCode,
      order_date: format(new Date(), "yyyy-MM-dd"),
      shipping_date: format(shipDate, "yyyy-MM-dd"),
      store_name: "ナチュラリAmazon店(手動)",
      items: items.map((item) => {
        const product = productMap.get(item.productId)!;
        return {
          article_code: product.sku,
          quantity: item.quantity,
          expiration_date: item.expiryDate
            ? format(new Date(item.expiryDate), "yyyy-MM-dd")
            : undefined,
          lot_number: item.lotNumber,
        };
      }),
    });

    // ステータスを SUBMITTED に更新
    await db.deliveryPlan.update({
      where: { id: plan.id },
      data: { status: "SUBMITTED" },
    });

    // ── 3. Dropboxに納品プランCSVをアップロード ─────────
    // 失敗してもプラン作成は成功扱い（通知と同様にwarnのみ）
    if (process.env.DROPBOX_APP_KEY) {
      const csv = buildDeliveryPlanCsv(logilessOrderCode, shipDate, plan.items);
      const folder = process.env.DROPBOX_FOLDER_PATH ?? "/納品プラン";
      await uploadFile(`${folder}/${logilessOrderCode}.csv`, csv).catch((e) =>
        console.warn("[dropbox] CSVアップロード失敗:", e)
      );
    }

    // ── 4. Discord通知 ──────────────────────────────────
    const totalQuantity = items.reduce((s, i) => s + i.quantity, 0);
    const firstProduct = productMap.values().next().value;
    const productType =
      firstProduct?.productType === "WITH_PRESCRIPTION" ? "度あり" : "度なし";

    await notifyDeliveryPlanCreated({
      workDate: format(new Date(), "M/d(E)"),
      shipmentDate: format(shipDate, "M/d(E)分"),
      productType,
      totalQuantity,
      staNumber: logilessOrderCode,
    }).catch((e) => console.warn("[notify] Discord通知失敗:", e));

    return NextResponse.json({
      success: true,
      planId: plan.id,
      logilessOrderId: logilessRes.id,
      totalQuantity,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[delivery-plan/create]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/delivery-plan/create
 * 納品プラン一覧を返す
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") ?? 1);
  const perPage = Number(searchParams.get("perPage") ?? 20);

  const [plans, total] = await Promise.all([
    db.deliveryPlan.findMany({
      include: {
        items: { include: { product: { select: { sku: true, name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.deliveryPlan.count(),
  ]);

  return NextResponse.json({ data: plans, total, page, perPage });
}
