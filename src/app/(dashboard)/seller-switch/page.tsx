"use client";

import { useEffect, useState } from "react";

interface Candidate {
  sku: string;
  asin: string | null;
  itemName: string | null;
  firstDetectedAt: string;
  lastSeenAt: string;
  processedAt: string | null;
}

interface DetectData {
  total: number;
  unprocessed: number;
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

export default function SellerSwitchPage() {
  const [data, setData] = useState<DetectData | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/seller-switch/detect")
      .then((r) => r.json())
      .then((d) => setData(d.data ?? null))
      .finally(() => setInitialLoading(false));
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
      // 一覧を再取得
      const listRes = await fetch("/api/seller-switch/detect");
      const listJson = await listRes.json();
      setData(listJson.data ?? null);
    } catch (e) {
      setMessage(`エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
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
  const unprocessed = candidates.filter((c) => !c.processedAt);

  return (
    <div className="p-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">出品者出荷切替</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            FBA在庫が切れて「停止中」になった出品を検出し、出品者出荷への切替候補を表示します
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
        <div className="bg-red-50 border border-red-200 rounded-lg px-5 py-3">
          <p className="text-xs text-red-600">未処理の切替候補</p>
          <p className="text-2xl font-bold text-red-700">
            {unprocessed.length}
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

      {/* 補充数は未実装のためプレースホルダ。ルール確定後に列を追加する */}
      <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
        補充数の自動計算は未実装です（ロジレス期限在庫からの算出ルール確定待ち）。現状は検出結果のみ表示しています。
      </div>

      {candidates.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-500">
            「検出実行」を押すと、停止中×FBAの出品を取得します
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200">
                <th className="text-left px-3 py-1.5 font-medium text-gray-600">商品名</th>
                <th className="text-left px-3 py-1.5 font-medium text-gray-600 w-36">SKU</th>
                <th className="text-left px-3 py-1.5 font-medium text-gray-600 w-28">ASIN</th>
                <th className="text-left px-3 py-1.5 font-medium text-gray-600 w-36">検出日時</th>
                <th className="text-right px-3 py-1.5 font-medium text-gray-600 w-20">補充数</th>
                <th className="text-center px-3 py-1.5 font-medium text-gray-600 w-20">状態</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.sku} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-1.5 text-gray-800 max-w-[320px] truncate">
                    {c.itemName ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-gray-600">{c.sku}</td>
                  <td className="px-3 py-1.5 font-mono text-gray-500">{c.asin ?? "—"}</td>
                  <td className="px-3 py-1.5 text-gray-500">{fmt(c.firstDetectedAt)}</td>
                  <td className="px-3 py-1.5 text-right text-gray-400">—</td>
                  <td className="px-3 py-1.5 text-center">
                    {c.processedAt ? (
                      <span className="text-green-700 bg-green-50 px-2 py-0.5 rounded">処理済</span>
                    ) : (
                      <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded">未処理</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
