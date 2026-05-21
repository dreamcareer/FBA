import { db } from "@/lib/db";
import { addMonths } from "date-fns";
import { SyncStatus, SyncType } from "@prisma/client";
import { getColorName } from "@/lib/product-colors";
import SyncButton from "./_components/SyncButton";
import SearchInput from "./_components/SearchInput";
import ColorGroup from "./_components/ColorGroup";

const EXPIRY_WARN_MONTHS = 18;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const categoryFilter = params.cat ?? "";
  const search = params.q ?? "";
  const page = Number(params.page ?? 1);
  const perPage = 50;

  // カテゴリ一覧を取得（タブ表示用・表示順固定）
  const CATEGORY_ORDER = [
    "1day10P", "1day30P", "高含水等", "Pixie",
    "ハイドロゲル", "UVチャーミング", "UVピュア", "1m2p",
    "色なしコンタクト", "Charm10P", "Charm30P",
  ];
  const HIDDEN_CATEGORIES = ["その他"];
  const allCategories = await db.productCategory.findMany({
    select: { id: true, name: true },
  });
  const categories = allCategories
    .filter((c) => !HIDDEN_CATEGORIES.includes(c.name))
    .sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a.name);
      const bi = CATEGORY_ORDER.indexOf(b.name);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

  // 「度なし」は商品種別でフィルター、それ以外はカテゴリでフィルター
  const isDoNashi = categoryFilter === "度なし";
  const selectedCategory = !isDoNashi && categoryFilter
    ? categories.find((c) => c.name === categoryFilter)
    : undefined;

  const where = {
    isActive: true,
    ...(isDoNashi ? { productType: "WITHOUT_PRESCRIPTION" as const } : {}),
    ...(selectedCategory ? { categoryId: selectedCategory.id } : {}),
    ...(search
      ? {
          OR: [
            { sku: { contains: search, mode: "insensitive" as const } },
            { name: { contains: search, mode: "insensitive" as const } },
            { asin: { contains: search, mode: "insensitive" as const } },
            { logilessProductCode: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [products, total, lastFbaSyncLog, lastLogilessSyncLog] = await Promise.all([
    db.product.findMany({
      where,
      include: {
        logilessInventories: true,
      },
      orderBy: { sku: "asc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.product.count({ where }),
    db.syncLog.findFirst({
      where: { type: SyncType.FBA_INVENTORY, status: SyncStatus.SUCCESS },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    }),
    db.syncLog.findFirst({
      where: { type: SyncType.LOGILESS_INVENTORY, status: SyncStatus.SUCCESS },
      orderBy: { finishedAt: "desc" },
      select: { finishedAt: true },
    }),
  ]);

  const minExpiry = addMonths(new Date(), EXPIRY_WARN_MONTHS);

  return (
    <div className="p-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">在庫一覧</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            全 {total} SKU
          </p>
        </div>
        <SyncButton
          lastFbaSyncAt={lastFbaSyncLog?.finishedAt?.toISOString() ?? null}
          lastLogilessSyncAt={lastLogilessSyncLog?.finishedAt?.toISOString() ?? null}
        />
      </div>

      {/* カテゴリタブ */}
      <div className="flex flex-wrap gap-1.5 mb-4 border-b border-gray-200 pb-3">
        <a
          href={`?cat=${encodeURIComponent("度なし")}&q=${search}`}
          className={`px-3 py-0.5 rounded-lg text-xs font-medium transition-colors ${
            isDoNashi
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          度なし
        </a>
        {categories.map((cat) => (
          <a
            key={cat.id}
            href={`?cat=${encodeURIComponent(cat.name)}&q=${search}`}
            className={`px-3 py-0.5 rounded-lg text-xs font-medium transition-colors ${
              categoryFilter === cat.name
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {cat.name}
          </a>
        ))}
      </div>

      {/* 検索 */}
      <div className="flex items-center gap-3 mb-4">
        <SearchInput />
      </div>

      {/* ページネーション */}
      {total > perPage && (
        <div className="flex justify-end gap-2 mb-4">
          {page > 1 && (
            <a
              href={`?cat=${categoryFilter}&q=${search}&page=${page - 1}`}
              className="px-3 py-0.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              前へ
            </a>
          )}
          <span className="px-3 py-0.5 text-sm text-gray-500">
            {page} / {Math.ceil(total / perPage)}
          </span>
          {page < Math.ceil(total / perPage) && (
            <a
              href={`?cat=${categoryFilter}&q=${search}&page=${page + 1}`}
              className="px-3 py-0.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              次へ
            </a>
          )}
        </div>
      )}

      {/* テーブル */}
      <div className="rounded-lg border border-gray-200 overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-700 text-white">
              <th className="text-left px-3 py-2 font-medium whitespace-nowrap">SKU<br /><span className="font-normal text-gray-400">ASIN</span></th>
              <th className="text-left px-3 py-2 font-medium whitespace-nowrap">商品名</th>
              <th className="text-center px-3 py-2 font-medium whitespace-nowrap">種別</th>
              <th className="text-right px-3 py-2 font-medium whitespace-nowrap">FBA上限</th>
              <th className="text-right px-3 py-2 font-medium whitespace-nowrap">FBA在庫</th>
              <th className="text-right px-3 py-2 font-medium whitespace-nowrap">入荷予定</th>
              <th className="text-right px-3 py-2 font-medium whitespace-nowrap">ロジレス在庫</th>
              <th className="text-right px-3 py-2 font-medium whitespace-nowrap">3ヶ月売上</th>
              <th className="text-left px-3 py-2 font-medium whitespace-nowrap">ロケーション</th>
              <th className="text-left px-3 py-2 font-medium whitespace-nowrap">出荷期限 <span className="font-normal text-gray-400">(18ヶ月以内⚠)</span></th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const groups = new Map<string, { product: typeof products[0]; lots: { id: string; location: string | null; lotNumber: string | null; quantity: number; expiryDate: string | null }[] }[]>();
              products.forEach((product) => {
                const color = getColorName(product.name);
                if (!groups.has(color)) groups.set(color, []);
                groups.get(color)!.push({
                  product,
                  lots: product.logilessInventories.map((i) => ({
                    id: i.id,
                    location: i.location,
                    lotNumber: i.lotNumber,
                    quantity: i.quantity,
                    expiryDate: i.expiryDate?.toISOString() ?? null,
                  })),
                });
              });
              return [...groups.entries()].map(([colorName, items]) => (
                <ColorGroup
                  key={colorName}
                  colorName={colorName}
                  items={items.map((item) => ({
                    product: {
                      id: item.product.id,
                      sku: item.product.sku,
                      asin: item.product.asin,
                      name: item.product.name,
                      productType: item.product.productType,
                      fbaStockQuantity: item.product.fbaStockQuantity,
                      fbaStockUpperLimit: item.product.fbaStockUpperLimit,
                      fbaOpenPoQuantity: item.product.fbaOpenPoQuantity,
                      business3m: item.product.business3m,
                    },
                    lots: item.lots,
                  }))}
                  minExpiry={minExpiry.toISOString()}
                />
              ));
            })()}
          </tbody>
        </table>

        {products.length === 0 && (
          <div className="py-12 text-center text-xs text-gray-400">
            該当する商品がありません
          </div>
        )}
      </div>

    </div>
  );
}
