import { db } from "@/lib/db";
import { getColorName } from "@/lib/product-colors";
import ColorGroup from "./_components/ColorGroup";
import type { ShortageItem } from "./_components/ShortageRow";

/**
 * SKUから枚数（10枚/30枚）を判定
 */
function getQuantityFromSku(sku: string): number | null {
  const s = sku.toLowerCase();
  if (s.includes("1d10") || s.startsWith("1d-") || s.startsWith("u0-") || s.startsWith("u5-") || s.startsWith("h2-") || s.startsWith("h1-") || s.startsWith("h5-") || s.startsWith("ph2-") || s.startsWith("p2-10-") || s.startsWith("s1-10-") || s.startsWith("cl-") || s.startsWith("c1d10")) return 10;
  if (s.startsWith("2d-") || s.startsWith("s1-30-") || s.startsWith("pn-30-") || s.startsWith("pc-30-") || s.startsWith("h-30-") || s.startsWith("c1d30")) return 30;
  if (s.startsWith("1m-") || s.startsWith("m1-2-")) return 10;
  return null;
}

function getThreshold(quantity: number | null, isPrescription: boolean): number | null {
  if (quantity === 10) return isPrescription ? 30 : 300;
  if (quantity === 30) return isPrescription ? 20 : 150;
  return null;
}

const CATEGORY_ORDER = [
  "1day10P", "1day30P", "高含水等", "Pixie",
  "ハイドロゲル", "UVチャーミング", "UVピュア", "1m2p",
  "色なしコンタクト", "Charm10P", "Charm30P",
];

export default async function InventoryCheckPage() {
  const products = await db.product.findMany({
    where: { isActive: true },
    include: {
      logilessInventories: true,
      category: true,
    },
    orderBy: { sku: "asc" },
  });

  const shortagesByCategory = new Map<string, ShortageItem[]>();

  for (const product of products) {
    const logilessTotal = product.logilessInventories.reduce((s, i) => s + i.quantity, 0);
    const isPrescription = product.productType === "WITH_PRESCRIPTION";
    const quantity = getQuantityFromSku(product.sku);
    const threshold = getThreshold(quantity, isPrescription);

    if (threshold === null) continue;
    if (logilessTotal >= threshold) continue;

    const categoryName = product.category.name;
    const item: ShortageItem = {
      id: product.id,
      name: product.name,
      sku: product.sku,
      fnsku: product.fnsku,
      logilessStock: logilessTotal,
      threshold,
      isPrescription,
      categoryName,
      nextArrivalDate: product.nextArrivalDate?.toISOString().slice(0, 10) ?? null,
      nextArrivalQuantity: product.nextArrivalQuantity,
    };

    if (!shortagesByCategory.has(categoryName)) {
      shortagesByCategory.set(categoryName, []);
    }
    shortagesByCategory.get(categoryName)!.push(item);
  }

  const sortedCategories = [...shortagesByCategory.keys()].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const totalCount = [...shortagesByCategory.values()].reduce((s, items) => s + items.length, 0);
  const now = new Date().toLocaleString("ja-JP", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div id="top" className="p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-900">在庫洗い出し</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          ロジレス在庫が閾値を下回っている商品の一覧
        </p>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="bg-red-50 border border-red-200 rounded-lg px-5 py-3">
          <p className="text-xs text-red-600">在庫不足</p>
          <p className="text-2xl font-bold text-red-700">{totalCount}<span className="text-sm font-normal ml-1">件</span></p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-5 py-3">
          <p className="text-xs text-gray-500">更新日時</p>
          <p className="text-sm font-medium text-gray-700 mt-1">{now}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-3">
          <p className="text-xs text-blue-600">閾値</p>
          <div className="text-[11px] text-blue-700 mt-1 space-y-0.5">
            <p>10枚 度なし: 300 / 度あり: 30</p>
            <p>30枚 度なし: 150 / 度あり: 20</p>
          </div>
        </div>
      </div>

      {/* カテゴリジャンプ */}
      {totalCount > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4 border-b border-gray-200 pb-3 sticky top-0 bg-gray-50 z-10 -mx-6 px-6 pt-2">
          <a
            href="#top"
            className="px-3 py-0.5 rounded-lg text-xs font-medium transition-colors bg-blue-600 text-white"
          >
            すべて
          </a>
          {sortedCategories.map((name) => (
            <a
              key={name}
              href={`#cat-${name}`}
              className="px-3 py-0.5 rounded-lg text-xs font-medium transition-colors bg-gray-100 text-gray-600 hover:bg-gray-200"
            >
              {name} ({shortagesByCategory.get(name)!.length})
            </a>
          ))}
        </div>
      )}

      {totalCount === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
          <p className="text-green-700 font-medium">在庫不足の商品はありません</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedCategories.map((categoryName) => {
            const items = shortagesByCategory.get(categoryName)!;
            const nonPresc = items.filter((i) => !i.isPrescription);
            const presc = items.filter((i) => i.isPrescription);

            return (
              <div key={categoryName} id={`cat-${categoryName}`} className="rounded-lg border border-gray-200 overflow-hidden scroll-mt-16">
                <div className="bg-gray-700 text-white px-4 py-2 flex items-center justify-between">
                  <span className="font-medium text-sm">{categoryName}</span>
                  <span className="text-xs text-gray-300">{items.length} 件</span>
                </div>

                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-200">
                      <th className="text-left px-3 py-1.5 font-medium text-gray-600 max-w-[300px]">商品名</th>
                      <th className="text-left px-3 py-1.5 font-medium text-gray-600 w-36">FNSKU<br /><span className="font-normal text-gray-400">ロジレス識別番号</span></th>
                      <th className="text-center px-3 py-1.5 font-medium text-gray-600 w-16">種別</th>
                      <th className="text-right px-3 py-1.5 font-medium text-gray-600 w-24">ロジレス在庫</th>
                      <th className="text-right px-3 py-1.5 font-medium text-gray-600 w-14">閾値</th>
                      <th className="text-right px-3 py-1.5 font-medium text-gray-600 w-14">不足数</th>
                      <th className="text-left px-2 py-1.5 font-medium text-gray-600 w-32">次回入荷予定日</th>
                      <th className="text-left px-2 py-1.5 font-medium text-gray-600 w-28">次回入荷数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nonPresc.length > 0 && (() => {
                      const groups = new Map<string, ShortageItem[]>();
                      nonPresc.forEach((item) => {
                        const color = getColorName(item.name);
                        if (!groups.has(color)) groups.set(color, []);
                        groups.get(color)!.push(item);
                      });
                      return (
                        <>
                          <tr className="bg-teal-50/50">
                            <td colSpan={8} className="px-3 py-1 text-teal-700 font-medium">度なし ({nonPresc.length})</td>
                          </tr>
                          {[...groups.entries()].map(([colorName, colorItems]) => (
                            <ColorGroup key={colorName} colorName={colorName} items={colorItems} />
                          ))}
                        </>
                      );
                    })()}
                    {presc.length > 0 && (() => {
                      const groups = new Map<string, ShortageItem[]>();
                      presc.forEach((item) => {
                        const color = getColorName(item.name);
                        if (!groups.has(color)) groups.set(color, []);
                        groups.get(color)!.push(item);
                      });
                      return (
                        <>
                          <tr className="bg-purple-50/50">
                            <td colSpan={8} className="px-3 py-1 text-purple-700 font-medium">度あり ({presc.length})</td>
                          </tr>
                          {[...groups.entries()].map(([colorName, colorItems]) => (
                            <ColorGroup key={colorName} colorName={colorName} items={colorItems} />
                          ))}
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
