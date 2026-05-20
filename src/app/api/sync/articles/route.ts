import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { db } from "@/lib/db";
import { fetchArticles, fetchArticleDetail } from "@/lib/logiless/client";
import { getCategoryFromCode, getProductType } from "@/lib/logiless/categories";

// 長時間実行を許可（Vercel Hobbyプランは最大300秒）
export const maxDuration = 300;

/**
 * POST /api/sync/articles
 * Logiless 商品マスタを同期
 *
 * ?mode=full  → 全件詳細取得（初回や強制リフレッシュ）
 * ?mode=diff  → 新規商品のみ詳細取得（デフォルト・高速）
 */
export async function POST(req: NextRequest) {
  // 認証
  const authHeader = req.headers.get("authorization");
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isCron) {
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
  }

  const mode = req.nextUrl.searchParams.get("mode") ?? "diff";

  try {
    // Step 1: 一覧APIで全商品を取得
    console.log("[sync/articles] Fetching article list...");
    const summaries = await fetchArticles();
    console.log(`[sync/articles] Found ${summaries.length} articles (mode=${mode})`);

    // カテゴリを事前作成
    const categoryNames = new Set<string>(["その他"]);
    for (const a of summaries) {
      const cat = getCategoryFromCode(a.identification_code ?? "");
      if (cat) categoryNames.add(cat);
    }

    const existingCategories = await db.productCategory.findMany();
    const categoryMap = new Map(existingCategories.map((c) => [c.name, c.id]));
    for (const name of categoryNames) {
      if (!categoryMap.has(name)) {
        const cat = await db.productCategory.create({ data: { name } });
        categoryMap.set(name, cat.id);
      }
    }

    // 既存商品（logilessArticleId をキーに保持）
    const existingProducts = await db.product.findMany({
      select: { id: true, sku: true, logilessArticleId: true },
    });
    const articleIdToProduct = new Map(
      existingProducts
        .filter((p) => p.logilessArticleId !== null)
        .map((p) => [p.logilessArticleId as number, p])
    );

    // diffモード: 新規商品（logilessArticleId 未登録）のみ詳細取得
    const toFetch = mode === "full"
      ? summaries
      : summaries.filter((s) => s.identification_code && !articleIdToProduct.has(s.id));

    console.log(`[sync/articles] Fetching details for ${toFetch.length} articles...`);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (let i = 0; i < toFetch.length; i++) {
      const summary = toFetch[i];
      const identCode = summary.identification_code;
      if (!identCode) {
        skipped++;
        continue;
      }

      // レート制限対策: 200msディレイ
      if (i > 0) await new Promise((r) => setTimeout(r, 200));
      const detail = await fetchArticleDetail(identCode);
      if (!detail) {
        skipped++;
        continue;
      }

      const categoryName = getCategoryFromCode(identCode) ?? "その他";
      const categoryId = categoryMap.get(categoryName)!;
      const productType = getProductType(detail.name);

      // ロジレスのフリー項目4 = Amazon SKU（運用上の取り決め）
      // 空の場合は identification_code を暫定値として使う
      const skuFromLogiless = detail.attr4?.trim() || identCode;

      const data = {
        name: detail.name,
        sku: skuFromLogiless,
        logilessProductCode: detail.code,
        logilessArticleId: detail.id,
        productType,
        categoryId,
      };

      // 既存商品は logilessArticleId で特定する
      const existing = await db.product.findUnique({
        where: { logilessArticleId: detail.id },
      });

      if (existing) {
        await db.product.update({
          where: { id: existing.id },
          data,
        });
        updated++;
      } else {
        await db.product.create({
          data,
        });
        created++;
      }

      if ((i + 1) % 100 === 0) {
        console.log(`[sync/articles] Progress: ${i + 1}/${toFetch.length}`);
      }
    }

    console.log(`[sync/articles] Done! Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);

    return NextResponse.json({
      success: true,
      total: summaries.length,
      fetched: toFetch.length,
      created,
      updated,
      skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync/articles]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
