"use client";

import { useEffect, useState } from "react";

type Judgement = "TARGET" | "WAITING" | "EXCLUDED" | "NO_STOCK";

interface Candidate {
  sku: string;
  asin: string | null;
  itemName: string | null;
  firstDetectedAt: string;
  lastSeenAt: string;
  processedAt: string | null;
  replenishedQty: number | null;
  judgement: Judgement;
  exclusionReason: string | null;
  inFlight: boolean;
  inFlightOrderCode: string | null;
  replenishment: { quantity: number; ge14: number; mid: number; total: number } | null;
}

interface DetectData {
  total: number;
  unprocessed: number;
  switchTarget: number;
  lastDetectedAt: string | null;
  candidates: Candidate[];
}

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const JUDGEMENT_BADGE: Record<Judgement, { label: string; cls: string }> = {
  TARGET: { label: "切替対象", cls: "text-emerald-700 bg-emerald-50 border border-emerald-200" },
  WAITING: { label: "待ち（FBA納品中）", cls: "text-blue-700 bg-blue-50 border border-blue-200" },
  EXCLUDED: { label: "対象外", cls: "text-gray-500 bg-gray-100 border border-gray-200" },
  NO_STOCK: { label: "在庫不足", cls: "text-amber-700 bg-amber-50 border border-amber-200" },
};

export default function SellerSwitchPage() {
  const [data, setData] = useState<DetectData | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // 補充数の手動上書き（sku -> 数量）。未設定なら計算値を使う
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  const [processingSku, setProcessingSku] = useState<string | null>(null);

  async function loadList() {
    const res = await fetch("/api/seller-switch/detect");
    const json = await res.json();
    setData(json.data ?? null);
  }

  useEffect(() => {
    loadList().finally(() => setInitialLoading(false));
  }, []);

  async function handleRun() {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/seller-switch/detect", { method: "POST" });
      const json = await res.json();
      if (json.error) {
        setMessage(`エラー: ${json.error}`);
      } else {
        const r = json.data;
        setMessage(
          r.isInitialSeed
            ? `初回基準を登録しました（${r.total}件）。次回以降、新規に停止中になったSKUが検出されます。`
            : `検出完了：停止中FBA ${r.total}件 / 新規 ${r.newlyDetected.length}件 / 在庫復活で削除 ${r.removed}件`
        );
      }
      await loadList();
    } catch (e) {
      setMessage(`エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  }

  async function handleProcess(c: Candidate, undo: boolean) {
    setProcessingSku(c.sku);
    try {
      const replenishedQty = undo
        ? null
        : qtyOverrides[c.sku] ?? c.replenishment?.quantity ?? null;
      const res = await fetch("/api/seller-switch/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: c.sku, replenishedQty, undo }),
      });
      const json = await res.json();
      if (json.error) {
        setMessage(`エラー: ${json.error}`);
      } else {
        await loadList();
      }
    } catch (e) {
      setMessage(`エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setProcessingSku(null);
    }
  }

  if (initialLoading) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">読み込み中...</p>
      </div>
    );
  }

  const candidates = data?.candidates ?? [];

  return (
    <div className="p-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">出品者出荷切替</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            FBA在庫が切れて「停止中」になった出品を検出し、出品者出荷への切替と補充数を判定します
          </p>
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <span className={running ? "animate-spin" : ""}>🔄</span>
          {running ? "検出中..." : "検出実行"}
        </button>
      </div>

      {/* サマリー */}
      <div className="flex gap-4 mb-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-5 py-3">
          <p className="text-xs text-emerald-600">切替対象（未処理）</p>
          <p className="text-2xl font-bold text-emerald-700">
            {data?.switchTarget ?? 0}
            <span className="text-sm font-normal ml-1">件</span>
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg px-5 py-3">
          <p className="text-xs text-red-600">未処理（全体）</p>
          <p className="text-2xl font-bold text-red-700">
            {data?.unprocessed ?? 0}
            <span className="text-sm font-normal ml-1">件</span>
          </p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-5 py-3">
          <p className="text-xs text-gray-500">停止中FBA（全体）</p>
          <p className="text-2xl font-bold text-gray-700">
            {data?.total ?? 0}
            <span className="text-sm font-normal ml-1">件</span>
          </p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-5 py-3">
          <p className="text-xs text-gray-500">最終検出日時</p>
          <p className="text-sm font-medium text-gray-700 mt-1">
            {fmt(data?.lastDetectedAt ?? null)}
          </p>
        </div>
      </div>

      {message && (
        <div className="mb-4 text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          {message}
        </div>
      )}

      {candidates.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-500">
            「検出実行」を押すと、停止中×FBAの出品を取得します
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200">
                <th className="text-left px-3 py-1.5 font-medium text-gray-600 w-32">判定</th>
                <th className="text-left px-3 py-1.5 font-medium text-gray-600">商品名</th>
                <th className="text-left px-3 py-1.5 font-medium text-gray-600 w-36">SKU</th>
                <th className="text-left px-3 py-1.5 font-medium text-gray-600 w-40">期限内訳（14M+/6-14M/計）</th>
                <th className="text-right px-3 py-1.5 font-medium text-gray-600 w-24">補充数</th>
                <th className="text-left px-3 py-1.5 font-medium text-gray-600 w-32">検出日時</th>
                <th className="text-center px-3 py-1.5 font-medium text-gray-600 w-28">操作</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const badge = JUDGEMENT_BADGE[c.judgement];
                const isTarget = c.judgement === "TARGET";
                const muted = !isTarget && !c.processedAt;
                const rep = c.replenishment;
                const qtyValue = qtyOverrides[c.sku] ?? rep?.quantity ?? 0;
                return (
                  <tr
                    key={c.sku}
                    className={`border-b border-gray-100 hover:bg-gray-50 ${
                      c.processedAt ? "bg-green-50/40" : muted ? "opacity-60" : ""
                    }`}
                  >
                    {/* 判定 */}
                    <td className="px-3 py-1.5">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] ${badge.cls}`}>
                        {badge.label}
                      </span>
                      {c.exclusionReason && (
                        <div className="text-[10px] text-gray-400 mt-0.5">{c.exclusionReason}</div>
                      )}
                      {c.inFlight && c.inFlightOrderCode && (
                        <div className="text-[10px] text-gray-400 mt-0.5">{c.inFlightOrderCode}</div>
                      )}
                    </td>
                    {/* 商品名 */}
                    <td className="px-3 py-1.5 text-gray-800 max-w-[280px] truncate">
                      {c.itemName ?? "—"}
                    </td>
                    {/* SKU */}
                    <td className="px-3 py-1.5 font-mono text-gray-600">{c.sku}</td>
                    {/* 期限内訳 */}
                    <td className="px-3 py-1.5 text-gray-500 font-mono">
                      {rep
                        ? `${rep.ge14} / ${rep.mid} / ${rep.total}`
                        : "—"}
                    </td>
                    {/* 補充数 */}
                    <td className="px-3 py-1.5 text-right">
                      {c.processedAt ? (
                        <span className="text-gray-700 font-medium">
                          {c.replenishedQty ?? "—"}
                        </span>
                      ) : isTarget ? (
                        <input
                          type="number"
                          min={0}
                          step={2}
                          value={qtyValue}
                          onChange={(e) =>
                            setQtyOverrides((prev) => ({
                              ...prev,
                              [c.sku]: Math.max(0, Number(e.target.value) || 0),
                            }))
                          }
                          className="w-16 text-right border border-gray-300 rounded px-1.5 py-0.5 text-xs"
                        />
                      ) : (
                        <span className="text-gray-400">{rep ? rep.quantity : "—"}</span>
                      )}
                    </td>
                    {/* 検出日時 */}
                    <td className="px-3 py-1.5 text-gray-500">{fmt(c.firstDetectedAt)}</td>
                    {/* 操作 */}
                    <td className="px-3 py-1.5 text-center">
                      {c.processedAt ? (
                        <button
                          onClick={() => handleProcess(c, true)}
                          disabled={processingSku === c.sku}
                          className="text-[11px] text-gray-500 hover:text-gray-700 underline disabled:opacity-50"
                        >
                          取消
                        </button>
                      ) : isTarget ? (
                        <button
                          onClick={() => handleProcess(c, false)}
                          disabled={processingSku === c.sku}
                          className="text-[11px] px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {processingSku === c.sku ? "..." : "切替済みにする"}
                        </button>
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
      )}
    </div>
  );
}
