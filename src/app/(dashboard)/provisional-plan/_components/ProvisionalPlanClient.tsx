"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import type { DeliveryCalculationResult } from "@/lib/delivery/types";
import {
  groupIntoPlans,
  MAX_UNITS_PER_PLAN,
} from "@/lib/delivery/plan-grouping";

type ProductType = "WITH_PRESCRIPTION" | "WITHOUT_PRESCRIPTION";

interface CalculationResponse {
  summary: {
    totalQuantity: number;
    deliverableCount: number;
    skippedCount: number;
    categoriesUsed: string[];
  };
  results: DeliveryCalculationResult[];
  lastSku: string | null;
}

const PRESCRIPTION_CATEGORIES = [
  "1day10P", "1day30P", "高含水等", "Pixie",
  "ハイドロゲル", "UVチャーミング", "UVピュア", "1m2p",
  "色なしコンタクト", "Charm10P", "Charm30P",
];

const SKIP_REASON_LABELS: Record<string, string> = {
  NO_LOGILESS_STOCK: "ロジレス在庫なし",
  DISCONTINUED: "終売",
  EXPIRY_TOO_CLOSE: "期限14ヶ月未満",
  FBA_SUFFICIENT: "FBA在庫十分",
  UPPER_LIMIT_REACHED: "上限到達",
  NO_SALES_DATA: "3ヶ月売上データなし",
  FBA_LIMIT_NOT_SET: "FBA上限未設定",
};

export default function ProvisionalPlanClient() {
  const [productType, setProductType] = useState<ProductType>("WITH_PRESCRIPTION");
  const [targetTotal, setTargetTotal] = useState(500);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    PRESCRIPTION_CATEGORIES.slice(0, 3)
  );
  const [shipmentDate, setShipmentDate] = useState(
    format(new Date(), "yyyy-MM-dd")
  );

  const [loading, setLoading] = useState(false);
  const [calcResult, setCalcResult] = useState<CalculationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 計算後に手動で数量を編集できるようにする
  const [editedQuantities, setEditedQuantities] = useState<
    Record<string, number>
  >({});

  // プランごとのSTA番号（編集可）と作成済みプランのindex
  const [staNumbers, setStaNumbers] = useState<Record<number, string>>({});
  const [createdPlans, setCreatedPlans] = useState<number[]>([]);
  const [creatingPlan, setCreatingPlan] = useState<number | null>(null);

  // 計算結果を 300点 / 3カラー5SKU のルールで複数プランに分割（計算時に確定）
  const plans = useMemo(() => {
    if (!calcResult) return [];
    return groupIntoPlans(calcResult.results, productType);
  }, [calcResult, productType]);

  const skippedResults = calcResult?.results.filter((r) => r.skipReason) ?? [];
  const deliverableResults = calcResult?.results.filter((r) => !r.skipReason) ?? [];

  const qtyOf = (r: DeliveryCalculationResult) =>
    editedQuantities[r.productId] ?? r.suggestedQuantity;

  const currentTotal = deliverableResults.reduce((sum, r) => sum + qtyOf(r), 0);

  // 納品予定日ベースのSTA番号（STAyyyymmdd-n）。手順書: 日付は納品予定日
  function defaultSta(planIndex: number): string {
    let datePart = format(new Date(), "yyyyMMdd");
    try {
      datePart = format(parseISO(shipmentDate), "yyyyMMdd");
    } catch {
      /* shipmentDate未設定時は今日 */
    }
    return `STA${datePart}-${planIndex + 1}`;
  }
  const staFor = (i: number) => staNumbers[i] ?? defaultSta(i);

  async function handleCalculate() {
    setLoading(true);
    setError(null);
    setEditedQuantities({});
    setStaNumbers({});
    setCreatedPlans([]);

    try {
      const res = await fetch("/api/delivery-plan/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productType,
          targetTotal,
          ...(productType === "WITH_PRESCRIPTION" ? { selectedCategories } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "計算に失敗しました");
        return;
      }
      setCalcResult(data);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePlan(planIndex: number) {
    const plan = plans[planIndex];
    if (!plan) return;

    const items = plan.items
      .map((r) => ({
        productId: r.productId,
        quantity: qtyOf(r),
        lotNumber: r.lotNumber ?? undefined,
        expiryDate: r.expiryDate
          ? new Date(r.expiryDate).toISOString()
          : undefined,
      }))
      .filter((i) => i.quantity > 0);

    if (items.length === 0) {
      alert("このプランに納品する商品がありません");
      return;
    }

    const staNumber = staFor(planIndex);
    setCreatingPlan(planIndex);
    try {
      const res = await fetch("/api/delivery-plan/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          shipmentDate: new Date(shipmentDate).toISOString(),
          logilessOrderCode: staNumber,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`エラー: ${data.error}`);
        return;
      }
      setCreatedPlans((prev) => [...prev, planIndex]);
      alert(
        `✓ 納品プランを作成しました\n` +
          `STA: ${staNumber}\n` +
          `合計: ${data.totalQuantity}点`
      );
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setCreatingPlan(null);
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-900">仮プラン作成</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          業務ルールに基づいて納品数を自動算出します
        </p>
      </div>

      {/* 設定パネル */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              種別
            </label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
              {(
                [
                  ["WITH_PRESCRIPTION", "度あり"],
                  ["WITHOUT_PRESCRIPTION", "度なし"],
                ] as [ProductType, string][]
              ).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => {
                    setProductType(val);
                    setTargetTotal(val === "WITH_PRESCRIPTION" ? 500 : 1000);
                    setSelectedCategories(val === "WITH_PRESCRIPTION" ? PRESCRIPTION_CATEGORIES.slice(0, 3) : []);
                    setCalcResult(null);
                  }}
                  className={`flex-1 px-3 py-2 transition-colors ${
                    productType === val
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              目標合計数
            </label>
            <input
              type="number"
              value={targetTotal}
              onChange={(e) => setTargetTotal(Number(e.target.value))}
              min={100}
              max={2000}
              step={100}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {productType === "WITH_PRESCRIPTION" && (
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                対象カテゴリ（優先順に最大3つ選択）
              </label>
              <div className="flex flex-wrap gap-1.5">
                {PRESCRIPTION_CATEGORIES.map((cat) => {
                  const isSelected = selectedCategories.includes(cat);
                  const order = selectedCategories.indexOf(cat);
                  return (
                    <button
                      key={cat}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedCategories((prev) => prev.filter((c) => c !== cat));
                        } else if (selectedCategories.length < 3) {
                          setSelectedCategories((prev) => [...prev, cat]);
                        }
                        setCalcResult(null);
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        isSelected
                          ? "bg-blue-600 text-white"
                          : selectedCategories.length >= 3
                          ? "bg-gray-50 text-gray-300 cursor-not-allowed"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {isSelected && <span className="mr-1">{order + 1}.</span>}
                      {cat}
                    </button>
                  );
                })}
              </div>
              {selectedCategories.length > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  順序: {selectedCategories.join(" → ")}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              出荷予定日
            </label>
            <input
              type="date"
              value={shipmentDate}
              onChange={(e) => setShipmentDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleCalculate}
            disabled={loading || (productType === "WITH_PRESCRIPTION" && selectedCategories.length === 0)}
            className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "計算中..." : "納品数を計算する"}
          </button>
          <span className="text-xs text-gray-400">
            {productType === "WITH_PRESCRIPTION"
              ? `${selectedCategories.length}カテゴリ選択中、目標${targetTotal}点`
              : `度なしのみ、目標${targetTotal}点`}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {/* 計算結果 */}
      {calcResult && (
        <>
          {/* サマリー */}
          <div className="grid grid-cols-4 gap-4 mb-4">
            {[
              { label: "合計納品数", value: `${currentTotal}点`, highlight: true },
              { label: "プラン数", value: `${plans.length}件`, highlight: false },
              { label: "納品SKU数", value: `${deliverableResults.length}SKU`, highlight: false },
              { label: "スキップ数", value: `${skippedResults.length}SKU`, highlight: false },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white rounded-xl border border-gray-200 px-4 py-4"
              >
                <p className="text-xs text-gray-500">{stat.label}</p>
                <p
                  className={`text-lg font-semibold mt-1 ${
                    stat.highlight ? "text-blue-600" : "text-gray-900"
                  }`}
                >
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {/* プランごとに表示（300点 / 度ありは3カラー5SKU で分割） */}
          {plans.map((plan, planIndex) => {
            const planTotal = plan.items.reduce((s, r) => s + qtyOf(r), 0);
            const overUnits = planTotal > MAX_UNITS_PER_PLAN;
            const isCreated = createdPlans.includes(planIndex);
            return (
              <div
                key={planIndex}
                className={`bg-white rounded-xl border overflow-hidden mb-4 ${
                  isCreated ? "border-green-300" : "border-gray-200"
                }`}
              >
                {/* プランヘッダー */}
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-gray-800">
                      プラン{planIndex + 1}
                    </span>
                    <span className="text-xs text-gray-500">
                      {plan.items.length}SKU /{" "}
                      <span className={overUnits ? "text-red-600 font-semibold" : ""}>
                        {planTotal}点{overUnits && " ⚠300超"}
                      </span>
                    </span>
                    {productType === "WITH_PRESCRIPTION" && (
                      <span className="text-xs text-gray-400">
                        カラー: {plan.colorNames.join(", ")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isCreated ? (
                      <span className="text-xs font-medium text-green-600">
                        ✓ 登録済み（{staFor(planIndex)}）
                      </span>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={staFor(planIndex)}
                          onChange={(e) =>
                            setStaNumbers((prev) => ({
                              ...prev,
                              [planIndex]: e.target.value,
                            }))
                          }
                          className="border border-gray-300 rounded-lg px-2.5 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
                        />
                        <button
                          onClick={() => handleCreatePlan(planIndex)}
                          disabled={creatingPlan !== null}
                          className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          {creatingPlan === planIndex
                            ? "登録中..."
                            : "ロジレスに受注登録"}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">SKU</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">商品名</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600 text-xs">FBA在庫</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600 text-xs">FBA上限</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600 text-xs">納品数</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">有効期限</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {plan.items.map((r) => {
                      const qty = qtyOf(r);
                      const overLimit =
                        r.fbaStockUpperLimit !== null &&
                        r.fbaStockQuantity + qty > r.fbaStockUpperLimit;
                      return (
                        <tr
                          key={r.productId}
                          className={
                            overLimit ? "bg-red-50/60" : r.expiryWarning ? "bg-amber-50/50" : ""
                          }
                        >
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                            {r.sku}
                          </td>
                          <td className="px-4 py-2.5 text-gray-900 max-w-xs truncate text-xs">
                            {r.name}
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs text-gray-500 tabular-nums">
                            {r.fbaStockQuantity.toLocaleString()}
                          </td>
                          <td
                            className={`px-4 py-2.5 text-right text-xs tabular-nums ${
                              overLimit ? "text-red-600 font-semibold" : "text-gray-500"
                            }`}
                          >
                            {r.fbaStockUpperLimit?.toLocaleString() ?? "—"}
                            {overLimit && <span className="ml-0.5">⚠</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <input
                              type="number"
                              value={qty}
                              disabled={isCreated}
                              onChange={(e) =>
                                setEditedQuantities((prev) => ({
                                  ...prev,
                                  [r.productId]: Number(e.target.value),
                                }))
                              }
                              min={0}
                              step={10}
                              className={`w-16 border rounded px-2 py-0.5 text-right text-sm focus:outline-none focus:ring-1 disabled:bg-gray-100 disabled:text-gray-400 ${
                                overLimit
                                  ? "border-red-400 text-red-600 focus:ring-red-400"
                                  : "border-gray-200 focus:ring-blue-400"
                              }`}
                            />
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            {r.expiryDate ? (
                              <span className={r.expiryWarning ? "text-amber-600 font-medium" : "text-gray-400"}>
                                {new Date(r.expiryDate).toLocaleDateString("ja-JP")}
                                {r.expiryWarning && " ⚠"}
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}

          {/* スキップ一覧（折りたたみ） */}
          {skippedResults.length > 0 && (
            <details className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <summary className="px-4 py-3 text-sm font-medium text-gray-500 cursor-pointer hover:bg-gray-50 select-none">
                スキップ ({skippedResults.length}件)
              </summary>
              <table className="w-full text-sm border-t border-gray-100">
                <tbody className="divide-y divide-gray-50">
                  {skippedResults.map((r) => (
                    <tr key={r.productId} className="opacity-60">
                      <td className="px-4 py-2 font-mono text-xs text-gray-500 w-40">
                        {r.sku}
                      </td>
                      <td className="px-4 py-2 text-gray-600 text-xs max-w-xs truncate">
                        {r.name}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-400">
                        {SKIP_REASON_LABELS[r.skipReason!] ?? r.skipReason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </>
      )}
    </div>
  );
}
