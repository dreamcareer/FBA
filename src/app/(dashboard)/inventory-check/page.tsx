"use client";

import { useEffect, useState } from "react";
import { getColorName } from "@/lib/product-colors";
import { sortCategories, type CheckResult, type ShortageItem } from "@/lib/inventory-check";
import ColorGroup from "./_components/ColorGroup";

export default function InventoryCheckPage() {
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // 初回: キャッシュされた結果を読み込み
  useEffect(() => {
    fetch("/api/inventory-check")
      .then((r) => r.json())
      .then((data) => setResult(data.result))
      .finally(() => setInitialLoading(false));
  }, []);

  async function handleRun() {
    setLoading(true);
    const res = await fetch("/api/inventory-check", { method: "POST" });
    const data = await res.json();
    setResult(data);
    setLoading(false);
  }

  if (initialLoading) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">読み込み中...</p>
      </div>
    );
  }

  const shortagesByCategory = result?.shortagesByCategory ?? {};
  const sortedCategories = sortCategories(Object.keys(shortagesByCategory));
  const totalCount = result?.totalCount ?? 0;
  const executedAt = result?.executedAt
    ? new Date(result.executedAt).toLocaleString("ja-JP", {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <div id="top" className="p-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">在庫洗い出し</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            ロジレス在庫が閾値を下回っている商品の一覧
          </p>
        </div>
        <button
          onClick={handleRun}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <span className={loading ? "animate-spin" : ""}>🔍</span>
          {loading ? "実行中..." : "洗い出し実行"}
        </button>
      </div>

      {/* サマリー */}
      <div className="flex gap-4 mb-6">
        <div className="bg-red-50 border border-red-200 rounded-lg px-5 py-3">
          <p className="text-xs text-red-600">在庫不足</p>
          <p className="text-2xl font-bold text-red-700">{totalCount}<span className="text-sm font-normal ml-1">件</span></p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-5 py-3">
          <p className="text-xs text-gray-500">最終実行日時</p>
          <p className="text-sm font-medium text-gray-700 mt-1">{executedAt ?? "未実行"}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-3">
          <p className="text-xs text-blue-600">閾値</p>
          <div className="text-[11px] text-blue-700 mt-1 space-y-0.5">
            <p>10枚 度なし: 300 / 度あり: 50</p>
            <p>30枚 度なし: 150 / 度あり: 50</p>
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
              {name} ({shortagesByCategory[name].length})
            </a>
          ))}
        </div>
      )}

      {!result ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-500">「洗い出し実行」ボタンを押してください</p>
        </div>
      ) : totalCount === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
          <p className="text-green-700 font-medium">在庫不足の商品はありません</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedCategories.map((categoryName) => {
            const items = shortagesByCategory[categoryName];
            const nonPresc = items.filter((i: ShortageItem) => !i.isPrescription);
            const presc = items.filter((i: ShortageItem) => i.isPrescription);

            // カラー別グループ化
            const groupByColor = (list: ShortageItem[]) => {
              const groups = new Map<string, ShortageItem[]>();
              list.forEach((item) => {
                const color = getColorName(item.name);
                if (!groups.has(color)) groups.set(color, []);
                groups.get(color)!.push(item);
              });
              return groups;
            };

            const nonPrescGroups = groupByColor(nonPresc);
            const prescGroups = groupByColor(presc);

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
                      <th className="text-left px-3 py-1.5 font-medium text-gray-600 w-36">SKU</th>
                      <th className="text-center px-3 py-1.5 font-medium text-gray-600 w-16">種別</th>
                      <th className="text-right px-3 py-1.5 font-medium text-gray-600 w-24">ロジレス在庫</th>
                      <th className="text-right px-3 py-1.5 font-medium text-gray-600 w-14">閾値</th>
                      <th className="text-right px-3 py-1.5 font-medium text-gray-600 w-14">不足数</th>
                      <th className="text-left px-2 py-1.5 font-medium text-gray-600 w-32">次回入荷予定日</th>
                      <th className="text-left px-2 py-1.5 font-medium text-gray-600 w-28">次回入荷数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nonPresc.length > 0 && (
                      <>
                        <tr className="bg-teal-50/50">
                          <td colSpan={8} className="px-3 py-1 text-teal-700 font-medium">度なし ({nonPresc.length})</td>
                        </tr>
                        {[...nonPrescGroups.entries()].map(([colorName, colorItems]) => (
                          <ColorGroup key={colorName} colorName={colorName} items={colorItems} />
                        ))}
                      </>
                    )}
                    {presc.length > 0 && (
                      <>
                        <tr className="bg-purple-50/50">
                          <td colSpan={8} className="px-3 py-1 text-purple-700 font-medium">度あり ({presc.length})</td>
                        </tr>
                        {[...prescGroups.entries()].map(([colorName, colorItems]) => (
                          <ColorGroup key={colorName} colorName={colorName} items={colorItems} />
                        ))}
                      </>
                    )}
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
