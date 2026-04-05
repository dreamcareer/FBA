"use client";

import { useState } from "react";
import { format } from "date-fns";
import type { DeliveryCalculationResult } from "@/lib/delivery/types";

type ProductType = "WITH_PRESCRIPTION" | "WITHOUT_PRESCRIPTION";

interface CalculationResponse {
  summary: {
    totalQuantity: number;
    deliverableCount: number;
    skippedCount: number;
  };
  results: DeliveryCalculationResult[];
  lastSku: string | null;
}

const SKIP_REASON_LABELS: Record<string, string> = {
  NO_LOGILESS_STOCK: "ロジレス在庫なし",
  DISCONTINUED: "終売",
  EXPIRY_TOO_CLOSE: "期限14ヶ月未満",
  FBA_SUFFICIENT: "FBA在庫十分",
  UPPER_LIMIT_REACHED: "上限到達",
};

export default function ProvisionalPlanClient() {
  const [productType, setProductType] = useState<ProductType>("WITH_PRESCRIPTION");
  const [targetTotal, setTargetTotal] = useState(500);
  const [startFromSku, setStartFromSku] = useState("");
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

  async function handleCalculate() {
    setLoading(true);
    setError(null);
    setEditedQuantities({});

    try {
      const res = await fetch("/api/delivery-plan/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productType,
          targetTotal,
          startFromSku: startFromSku || undefined,
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

  async function handleCreatePlan(staNumber: string) {
    if (!calcResult) return;

    const deliverableItems = calcResult.results
      .filter((r) => !r.skipReason)
      .map((r) => ({
        productId: r.productId,
        quantity: editedQuantities[r.productId] ?? r.suggestedQuantity,
        lotNumber: r.lotNumber ?? undefined,
        expiryDate: r.expiryDate
          ? new Date(r.expiryDate).toISOString()
          : undefined,
      }))
      .filter((i) => i.quantity > 0);

    if (deliverableItems.length === 0) {
      alert("納品する商品がありません");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/delivery-plan/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: deliverableItems,
          shipmentDate: new Date(shipmentDate).toISOString(),
          logilessOrderCode: staNumber,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`エラー: ${data.error}`);
        return;
      }
      alert(
        `✓ 納品プランを作成しました\n` +
        `STA: ${staNumber}\n` +
        `合計: ${data.totalQuantity}点`
      );
      setCalcResult(null);
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  const deliverableResults = calcResult?.results.filter((r) => !r.skipReason) ?? [];
  const skippedResults = calcResult?.results.filter((r) => r.skipReason) ?? [];

  // 編集後の合計
  const currentTotal = deliverableResults.reduce((sum, r) => {
    return sum + (editedQuantities[r.productId] ?? r.suggestedQuantity);
  }, 0);

  // STAナンバー生成
  const defaultSta = `STA${format(new Date(), "yyyyMMdd")}-1`;
  const [staNumber, setStaNumber] = useState(defaultSta);

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
                  ["WITH_PRESCRIPTION", "度あり（目標500点）"],
                  ["WITHOUT_PRESCRIPTION", "度なし（目標1000点）"],
                ] as [ProductType, string][]
              ).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => {
                    setProductType(val);
                    setTargetTotal(val === "WITH_PRESCRIPTION" ? 500 : 1000);
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              開始SKU（前回の続きから）
            </label>
            <input
              type="text"
              value={startFromSku}
              onChange={(e) => setStartFromSku(e.target.value)}
              placeholder="例: 1d10hi145mh（空白=先頭から）"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

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

        <button
          onClick={handleCalculate}
          disabled={loading}
          className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "計算中..." : "納品数を計算する"}
        </button>
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
          <div className="grid grid-cols-3 gap-4 mb-4">
            {[
              { label: "合計納品数", value: `${currentTotal}点`, highlight: true },
              { label: "納品SKU数", value: `${deliverableResults.length}SKU`, highlight: false },
              { label: "スキップ数", value: `${skippedResults.length}SKU`, highlight: false },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white rounded-xl border border-gray-200 px-4 py-4"
              >
                <p className="text-xs text-gray-500">{stat.label}</p>
                <p
                  className={`text-2xl font-semibold mt-1 ${
                    stat.highlight ? "text-blue-600" : "text-gray-900"
                  }`}
                >
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {/* プラン作成ボタン */}
          {deliverableResults.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex items-center gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  STA番号
                </label>
                <input
                  type="text"
                  value={staNumber}
                  onChange={(e) => setStaNumber(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
                />
              </div>
              <div className="pt-5">
                <button
                  onClick={() => handleCreatePlan(staNumber)}
                  disabled={loading}
                  className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  ロジレスに受注登録
                </button>
              </div>
            </div>
          )}

          {/* 納品予定一覧 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                納品予定 ({deliverableResults.length}件)
              </span>
              <span className="text-xs text-gray-400">
                数量は手動で変更できます
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">SKU</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">商品名</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600 text-xs">納品数</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600 text-xs">有効期限</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {deliverableResults.map((r) => (
                  <tr
                    key={r.productId}
                    className={r.expiryWarning ? "bg-amber-50/50" : ""}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                      {r.sku}
                    </td>
                    <td className="px-4 py-2.5 text-gray-900 max-w-xs truncate text-xs">
                      {r.name}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <input
                        type="number"
                        value={editedQuantities[r.productId] ?? r.suggestedQuantity}
                        onChange={(e) =>
                          setEditedQuantities((prev) => ({
                            ...prev,
                            [r.productId]: Number(e.target.value),
                          }))
                        }
                        min={0}
                        step={10}
                        className="w-16 border border-gray-200 rounded px-2 py-0.5 text-right text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
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
                ))}
              </tbody>
            </table>
          </div>

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
