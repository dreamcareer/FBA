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

  const [
    products,
    total,
    lastFbaSyncLog,
    lastLogilessSyncLog,
    allActiveCount,
    doNashiCount,
    categoryCountsRaw,
  ] = await Promise.all([
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
    db.product.count({ where: { isActive: true } }),
    db.product.count({
      where: { isActive: true, productType: "WITHOUT_PRESCRIPTION" },
    }),
    db.product.groupBy({
      by: ["categoryId"],
      where: { isActive: true },
      _count: { _all: true },
    }),
  ]);

  const categoryCountMap = new Map<string, number>(
    categoryCountsRaw
      .filter((c): c is { categoryId: string; _count: { _all: number } } => c.categoryId !== null)
      .map((c) => [c.categoryId, c._count._all])
  );

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const rangeStart = total === 0 ? 0 : (page - 1) * perPage + 1;
  const rangeEnd = Math.min(page * perPage, total);

  const buildHref = (next: { cat?: string; page?: number }) => {
    const params = new URLSearchParams();
    const cat = next.cat ?? categoryFilter;
    if (cat) params.set("cat", cat);
    if (search) params.set("q", search);
    if (next.page && next.page > 1) params.set("page", String(next.page));
    const qs = params.toString();
    return qs ? `?${qs}` : "?";
  };

  const minExpiry = addMonths(new Date(), EXPIRY_WARN_MONTHS);

  return (
    <div className="p-6">
      {/* ヘッダー */}
      <div className="flex items-start justify-between mb-6">
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

      {/* 検索＆カテゴリフィルタ カード */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 mb-4">
        {/* 検索バー＋件数表示 */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <SearchInput />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
              className="h-4 w-4 text-gray-500"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 16.5v-9a2.25 2.25 0 0 0-1.125-1.95l-7.5-4.33a2.25 2.25 0 0 0-2.25 0l-7.5 4.33A2.25 2.25 0 0 0 1.5 7.5v9a2.25 2.25 0 0 0 1.125 1.95l7.5 4.33a2.25 2.25 0 0 0 2.25 0l7.5-4.33A2.25 2.25 0 0 0 21 16.5Z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="m3 7 9 5.25M21 7l-9 5.25m0 0V21" />
            </svg>
            <span>
              <strong className="text-gray-900 font-semibold">{total.toLocaleString()}</strong>
              <span className="ml-1 text-gray-500">件表示中</span>
            </span>
          </div>
        </div>

        {/* カテゴリチップ */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <span className="flex items-center gap-1 text-xs text-gray-500 mr-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-3.5 w-3.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3c-7.2 0-9 1.8-9 1.8L10.5 13v6.75a.75.75 0 0 0 .53.72l1.5.45A.75.75 0 0 0 13.5 20.25V13L21 4.8S19.2 3 12 3Z"
              />
            </svg>
            カテゴリ
          </span>

          {(() => {
            const baseChip =
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors";
            const activeChip = "bg-blue-600 text-white";
            const inactiveChip = "bg-gray-100 text-gray-700 hover:bg-gray-200";
            const activeCount = "text-blue-100";
            const inactiveCount = "text-gray-400";

            const isAll = !categoryFilter;
            return (
              <>
                <a
                  href={buildHref({ cat: "", page: 1 })}
                  className={`${baseChip} ${isAll ? activeChip : inactiveChip}`}
                >
                  <span>すべて</span>
                  <span className={`text-[10px] ${isAll ? activeCount : inactiveCount}`}>
                    {allActiveCount.toLocaleString()}
                  </span>
                </a>
                <a
                  href={buildHref({ cat: isDoNashi ? "" : "度なし", page: 1 })}
                  className={`${baseChip} ${isDoNashi ? activeChip : inactiveChip}`}
                >
                  <span>度なし</span>
                  <span
                    className={`text-[10px] ${
                      isDoNashi ? activeCount : "text-emerald-500"
                    }`}
                  >
                    {doNashiCount.toLocaleString()}
                  </span>
                </a>
                {categories.map((cat) => {
                  const isActive = categoryFilter === cat.name;
                  const count = categoryCountMap.get(cat.id) ?? 0;
                  return (
                    <a
                      key={cat.id}
                      href={buildHref({ cat: isActive ? "" : cat.name, page: 1 })}
                      className={`${baseChip} ${isActive ? activeChip : inactiveChip}`}
                    >
                      <span>{cat.name}</span>
                      <span className={`text-[10px] ${isActive ? activeCount : inactiveCount}`}>
                        {count.toLocaleString()}
                      </span>
                    </a>
                  );
                })}
              </>
            );
          })()}
        </div>
      </div>

      {/* ページネーション */}
      <div className="flex items-center justify-between mb-3 text-xs text-gray-500">
        <div>
          {rangeStart.toLocaleString()} - {rangeEnd.toLocaleString()} / {total.toLocaleString()}件
        </div>
        <div className="flex items-center gap-1">
          {page > 1 ? (
            <a
              href={buildHref({ page: page - 1 })}
              className="inline-flex items-center gap-1 px-2.5 py-1 border border-gray-200 rounded-md hover:bg-gray-50 text-gray-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3 w-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              前
            </a>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 border border-gray-200 rounded-md text-gray-300 cursor-not-allowed">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3 w-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              前
            </span>
          )}
          <span className="px-2 text-gray-600">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <a
              href={buildHref({ page: page + 1 })}
              className="inline-flex items-center gap-1 px-2.5 py-1 border border-gray-200 rounded-md hover:bg-gray-50 text-gray-700"
            >
              次
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3 w-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </a>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 border border-gray-200 rounded-md text-gray-300 cursor-not-allowed">
              次
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-3 w-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </span>
          )}
        </div>
      </div>

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
