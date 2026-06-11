import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { createSalesOrder, fetchMappedCode } from "@/lib/logiless/client";
import { notifyDeliveryPlanCreated } from "@/lib/notify";
import { uploadFile } from "@/lib/dropbox/client";
import { buildDeliveryPlanCsv } from "@/lib/delivery/csv";

const itemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1),
  lotNumber: z.string().optional(),
  expiryDate: z.string().optional(),
});

// FBA納品の宛先・受注設定
// 倉庫チームがロジレスに手動登録していた受注伝票と同じ値（全受注で共通）
const FBA_ORDER_DEFAULTS = {
  name1: "江東区新砂FC（VJMF）",
  postCode: "1360075",
  prefecture: "東京都",
  address1: "江東区",
  address2: "新砂",
  address3: "1-3-7　西濃運輸深川支店　Amazon.co.jp FBA入庫係",
  phone: "0362714880",
  paymentMethod: "no_payment",
  deliveryMethod: "yamato",
  pickingNotes: "FBA【EXP：7ヵ月以上】",
} as const;

const schema = z.object({
  items: z.array(itemSchema).min(1).max(300),
  shipmentDate: z.string(),              // ISO string
  logilessOrderCode: z.string().regex(/^STA\d{8}-\d+$/), // STAyyyymmdd-n
  // 計算の終了位置（翌日の「前回の続き」判定に使う）。プラン登録時に上書き保存する
  endPosition: z
    .object({
      categoryName: z.string().nullable(),
      colorName: z.string().nullable(),
      lastSku: z.string().nullable(),
      deferredColor: z.string().nullable(),
    })
    .optional(),
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

  const { items, shipmentDate, logilessOrderCode, endPosition } = parsed.data;

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
    select: {
      id: true,
      sku: true,
      name: true,
      productType: true,
      logilessProductCode: true,
    },
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

  const storeId = Number(process.env.LOGILESS_STORE_ID);
  if (!storeId) {
    return NextResponse.json(
      { error: "LOGILESS_STORE_ID が設定されていません" },
      { status: 500 }
    );
  }

  const shipDate = new Date(shipmentDate);

  // ── 0. 出品コードの解決 ─────────────────────────────
  // 受注明細の article_code は「商品コード（店舗）」のため、
  // 商品マスタのJANを商品対応表(article_maps)で出品コードに変換する。
  // DB登録前に解決し、変換できない商品があればプランを作らず400で返す
  const mappedCodes = new Map<string, string>(); // productId -> mapped_code
  const unmappedSkus: string[] = [];
  try {
    for (const product of products) {
      if (!product.logilessProductCode) {
        unmappedSkus.push(product.sku);
        continue;
      }
      const mapped = await fetchMappedCode(product.logilessProductCode, storeId);
      if (!mapped) {
        unmappedSkus.push(product.sku);
        continue;
      }
      mappedCodes.set(product.id, mapped);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[delivery-plan/create] 出品コード解決失敗:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
  if (unmappedSkus.length > 0) {
    return NextResponse.json(
      {
        error: `ロジレスの商品対応表に出品コードが見つかりません: ${unmappedSkus.join(", ")}`,
      },
      { status: 400 }
    );
  }

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
    // 失敗した場合はDBのプランを削除して同じSTA番号で再試行できるようにする
    let logilessRes;
    try {
      logilessRes = await createSalesOrder({
        code: logilessOrderCode,
        buyer_name1: FBA_ORDER_DEFAULTS.name1,
        buyer_post_code: FBA_ORDER_DEFAULTS.postCode,
        buyer_prefecture: FBA_ORDER_DEFAULTS.prefecture,
        buyer_address1: FBA_ORDER_DEFAULTS.address1,
        buyer_address2: FBA_ORDER_DEFAULTS.address2,
        buyer_address3: FBA_ORDER_DEFAULTS.address3,
        buyer_phone: FBA_ORDER_DEFAULTS.phone,
        recipient_name1: FBA_ORDER_DEFAULTS.name1,
        recipient_post_code: FBA_ORDER_DEFAULTS.postCode,
        recipient_prefecture: FBA_ORDER_DEFAULTS.prefecture,
        recipient_address1: FBA_ORDER_DEFAULTS.address1,
        recipient_address2: FBA_ORDER_DEFAULTS.address2,
        recipient_address3: FBA_ORDER_DEFAULTS.address3,
        recipient_phone: FBA_ORDER_DEFAULTS.phone,
        payment_method: FBA_ORDER_DEFAULTS.paymentMethod,
        delivery_method: FBA_ORDER_DEFAULTS.deliveryMethod,
        ordered_at: format(new Date(), "yyyy-MM-dd HH:mm:ss"),
        scheduled_shipping_date: format(shipDate, "yyyy-MM-dd"),
        picking_notes: FBA_ORDER_DEFAULTS.pickingNotes,
        store: storeId,
        lines: items.map((item) => {
          const product = productMap.get(item.productId)!;
          return {
            article_code: mappedCodes.get(item.productId)!,
            article_name: product.name,
            quantity: item.quantity,
            deadline: item.expiryDate
              ? format(new Date(item.expiryDate), "yyyy-MM-dd")
              : undefined,
            lot_number: item.lotNumber,
          };
        }),
      });
    } catch (err) {
      await db.deliveryPlan
        .delete({ where: { id: plan.id } })
        .catch((e) =>
          console.warn("[delivery-plan/create] 失敗プランの削除に失敗:", e)
        );
      throw err;
    }

    // ステータスを SUBMITTED に更新
    await db.deliveryPlan.update({
      where: { id: plan.id },
      data: { status: "SUBMITTED" },
    });

    // 計算の終了位置を保存（種別ごとに最新1件を上書き）。失敗してもプラン作成は成功扱い
    if (endPosition) {
      const planProductType = productMap.values().next().value!.productType;
      await db.calculationEndPosition
        .upsert({
          where: { productType: planProductType },
          update: endPosition,
          create: { productType: planProductType, ...endPosition },
        })
        .catch((e) => console.warn("[delivery-plan/create] 終了位置の保存失敗:", e));
    }

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
