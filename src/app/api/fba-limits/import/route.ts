import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { db } from "@/lib/db";
import { parseCsv } from "@/lib/fba-limits/csv-parser";

const REQUIRED_HEADERS = ["Child_ASIN", "Upper_Limit", "Open_PO_Quantity"] as const;

/**
 * POST /api/fba-limits/import
 * Amazonセラーセントラル容量モニターのCSVを受け取り、
 * Child_ASIN で products.asin と突合して以下を更新:
 *   - fba_stock_upper_limit (= Upper_Limit)
 *   - fba_open_po_quantity  (= Open_PO_Quantity)
 *   - fba_limit_updated_at  (= 取り込み日時)
 *
 * On_Hand_Quantity は SP-API 同期で管理されるため CSV からは更新しない。
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

  const childAsinIdx = headerIndex.get("Child_ASIN")!;
  const upperLimitIdx = headerIndex.get("Upper_Limit")!;
  const openPoIdx = headerIndex.get("Open_PO_Quantity")!;

  // ASIN → productId のマップ作成
  const products = await db.product.findMany({
    where: { asin: { not: null } },
    select: { id: true, asin: true },
  });
  const asinToId = new Map<string, string>();
  for (const p of products) {
    if (p.asin) asinToId.set(p.asin, p.id);
  }

  // 更新対象を組み立て
  const now = new Date();
  const updates: ReturnType<typeof db.product.update>[] = [];
  const unmatchedAsins: string[] = [];
  const invalidRows: number[] = [];
  let updatedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const asin = row[childAsinIdx]?.trim();
    if (!asin) continue;

    const upperLimitStr = row[upperLimitIdx]?.trim();
    const openPoStr = row[openPoIdx]?.trim();
    const upperLimit = parseInt(upperLimitStr, 10);
    const openPo = parseInt(openPoStr, 10);

    if (Number.isNaN(upperLimit) || Number.isNaN(openPo)) {
      invalidRows.push(i + 2); // ヘッダー行を考慮した実際の行番号
      continue;
    }

    const productId = asinToId.get(asin);
    if (!productId) {
      unmatchedAsins.push(asin);
      continue;
    }

    updates.push(
      db.product.update({
        where: { id: productId },
        data: {
          fbaStockUpperLimit: upperLimit,
          fbaOpenPoQuantity: openPo,
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
      unmatched: unmatchedAsins.length,
      unmatchedSamples: unmatchedAsins.slice(0, 20),
      invalidRows: invalidRows.length,
      invalidRowSamples: invalidRows.slice(0, 20),
      importedAt: now.toISOString(),
    },
  });
}
