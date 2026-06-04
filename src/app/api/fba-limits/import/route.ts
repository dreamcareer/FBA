import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { db } from "@/lib/db";
import { parseCsv } from "@/lib/fba-limits/csv-parser";

const REQUIRED_HEADERS = ["SKU", "上限指定"] as const;

/**
 * POST /api/fba-limits/import
 * FBA上限指定CSV（SKU,上限指定）を受け取り、
 * SKU で products.sku と突合して以下を更新:
 *   - fba_stock_upper_limit (= 上限指定が数値の場合のみ。テキスト時は null)
 *   - fba_limit_note         (= 上限指定が数値以外のテキスト。例「終売」「できるだけ納品」)
 *   - fba_limit_updated_at   (= 取り込み日時)
 *
 * 上限指定が空欄の行はスキップし、何も更新しない。
 */
export async function POST(req: NextRequest) {
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
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let buffer: Buffer;
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "ファイルが選択されていません" },
        { status: 400 }
      );
    }
    buffer = Buffer.from(await file.arrayBuffer());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `ファイル読み込みに失敗しました: ${message}` },
      { status: 400 }
    );
  }

  const { headers, rows } = parseCsv(buffer);

  // 必須カラム検証
  const headerIndex = new Map(headers.map((h, i) => [h, i]));
  const missing = REQUIRED_HEADERS.filter((h) => !headerIndex.has(h));
  if (missing.length > 0) {
    return NextResponse.json(
      { success: false, error: `必須カラムが見つかりません: ${missing.join(", ")}` },
      { status: 400 }
    );
  }

  const skuIdx = headerIndex.get("SKU")!;
  const limitIdx = headerIndex.get("上限指定")!;

  // SKU → productId のマップ作成
  const products = await db.product.findMany({
    select: { id: true, sku: true },
  });
  const skuToId = new Map<string, string>();
  for (const p of products) {
    skuToId.set(p.sku, p.id);
  }

  // 更新対象を組み立て
  const now = new Date();
  const updates: ReturnType<typeof db.product.update>[] = [];
  const unmatchedSkus: string[] = [];
  let skippedEmpty = 0;
  let updatedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sku = row[skuIdx]?.trim();
    if (!sku) continue;

    // 上限指定が空欄の行はスキップ（変更なし）
    const limitStr = row[limitIdx]?.trim() ?? "";
    if (limitStr === "") {
      skippedEmpty++;
      continue;
    }

    const productId = skuToId.get(sku);
    if (!productId) {
      unmatchedSkus.push(sku);
      continue;
    }

    // 数値なら上限値として保存、それ以外のテキストはノートとしてそのまま保持
    const upperLimit = parseInt(limitStr, 10);
    const isNumeric = /^\d+$/.test(limitStr);

    updates.push(
      db.product.update({
        where: { id: productId },
        data: isNumeric
          ? {
              fbaStockUpperLimit: upperLimit,
              fbaLimitNote: null,
              fbaLimitUpdatedAt: now,
            }
          : {
              fbaStockUpperLimit: null,
              fbaLimitNote: limitStr,
              fbaLimitUpdatedAt: now,
            },
      })
    );
    updatedCount++;
  }

  // バッチ書き込み（大量更新になるため100件ずつトランザクション分割）
  const CHUNK = 100;
  for (let i = 0; i < updates.length; i += CHUNK) {
    await db.$transaction(updates.slice(i, i + CHUNK));
  }

  return NextResponse.json({
    success: true,
    data: {
      totalRows: rows.length,
      updated: updatedCount,
      unmatched: unmatchedSkus.length,
      unmatchedSamples: unmatchedSkus.slice(0, 20),
      skippedEmpty,
      importedAt: now.toISOString(),
    },
  });
}
