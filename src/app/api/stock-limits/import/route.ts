import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { db } from "@/lib/db";
import { parseCsv } from "@/lib/fba-limits/csv-parser";

// 在庫上限の値カラム候補（在庫上限CSV / Amazon在庫計画レポートの両方に対応）
const VALUE_HEADER_CANDIDATES = ["在庫上限", "上限指定", "上限", "Upper_Limit"] as const;
// SKU 突合用のカラム候補
const SKU_HEADER_CANDIDATES = ["SKU", "sku"] as const;
// ASIN 突合用のカラム候補（Amazonレポートは Child_ASIN を使う）
const ASIN_HEADER_CANDIDATES = ["Child_ASIN", "child_asin", "ASIN", "asin", "Parent_ASIN"] as const;

/**
 * POST /api/stock-limits/import
 * 在庫上限を更新する。次の2形式のCSVに対応:
 *  1) 在庫上限CSV: SKU, 在庫上限（上限指定 / 上限 でも可）→ SKU で突合
 *  2) Amazon在庫計画レポート: Parent_ASIN, Child_ASIN, Item_Name, Upper_Limit, ... → Child_ASIN で突合
 *
 * - 在庫上限が数値の行のみ products.stock_upper_limit を更新する
 * - 空欄の行はスキップ（変更なし）
 * - 数値以外（テキスト）の行は不正値としてスキップ
 * - 突合キー（SKU / ASIN）がマスタに無い行はスキップ
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
  const headerIndex = new Map(headers.map((h, i) => [h.trim(), i]));

  // 在庫上限の値カラムを特定
  const valueHeader = VALUE_HEADER_CANDIDATES.find((h) => headerIndex.has(h));
  if (!valueHeader) {
    return NextResponse.json(
      {
        success: false,
        error: `在庫上限のカラムが見つかりません（${VALUE_HEADER_CANDIDATES.join(" / ")} のいずれか）`,
      },
      { status: 400 }
    );
  }
  const valueIdx = headerIndex.get(valueHeader)!;

  // 突合キー（SKU 優先、無ければ ASIN）を特定
  const skuHeader = SKU_HEADER_CANDIDATES.find((h) => headerIndex.has(h));
  const asinHeader = ASIN_HEADER_CANDIDATES.find((h) => headerIndex.has(h));
  const matchBy: "sku" | "asin" | null = skuHeader ? "sku" : asinHeader ? "asin" : null;
  if (!matchBy) {
    return NextResponse.json(
      {
        success: false,
        error: "突合キーのカラムが見つかりません（SKU または Child_ASIN）",
      },
      { status: 400 }
    );
  }
  const keyIdx = headerIndex.get((skuHeader ?? asinHeader)!)!;

  // 突合キー → productId（複数あり得るため配列）のマップ作成
  const products = await db.product.findMany({
    select: { id: true, sku: true, asin: true },
  });
  const keyToIds = new Map<string, string[]>();
  for (const p of products) {
    const key = matchBy === "sku" ? p.sku : p.asin;
    if (!key) continue;
    const list = keyToIds.get(key);
    if (list) list.push(p.id);
    else keyToIds.set(key, [p.id]);
  }

  // 更新対象を組み立て
  const updates: ReturnType<typeof db.product.update>[] = [];
  const unmatchedKeys: string[] = [];
  let skippedEmpty = 0;
  let skippedInvalid = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const key = row[keyIdx]?.trim();
    if (!key) continue;

    // 在庫上限が空欄の行はスキップ（変更なし）
    const limitStr = row[valueIdx]?.trim() ?? "";
    if (limitStr === "") {
      skippedEmpty++;
      continue;
    }

    // 在庫上限は数値のみ。数値以外は不正値としてスキップ
    if (!/^\d+$/.test(limitStr)) {
      skippedInvalid++;
      continue;
    }

    const ids = keyToIds.get(key);
    if (!ids || ids.length === 0) {
      unmatchedKeys.push(key);
      continue;
    }

    const upperLimit = parseInt(limitStr, 10);
    for (const id of ids) {
      updates.push(
        db.product.update({
          where: { id },
          data: { stockUpperLimit: upperLimit },
        })
      );
    }
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
      updated: updates.length,
      unmatched: unmatchedKeys.length,
      unmatchedSamples: unmatchedKeys.slice(0, 20),
      skippedEmpty,
      skippedInvalid,
      matchedBy: matchBy,
      importedAt: new Date().toISOString(),
    },
  });
}
