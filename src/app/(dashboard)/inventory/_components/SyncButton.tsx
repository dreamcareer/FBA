"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  async function handleSync() {
    setLoading(true);
    setResult(null);
    try {
      // Step 1: 商品マスタ同期
      setResult("商品マスタを同期中...");
      const articlesRes = await fetch("/api/sync/articles", { method: "POST" });
      const articlesData = await articlesRes.json();
      if (!articlesRes.ok) {
        setResult(`✗ 商品マスタ同期エラー: ${articlesData.error}`);
        return;
      }

      // Step 2: 在庫同期
      setResult("在庫データを同期中...");
      const invRes = await fetch("/api/sync/inventory", { method: "POST" });
      const invData = await invRes.json();
      if (!invRes.ok) {
        setResult(`✗ 在庫同期エラー: ${invData.error}`);
        return;
      }

      setResult(
        `✓ 商品 ${articlesData.created}件登録/${articlesData.updated}件更新、在庫 ${invData.synced}件同期`
      );
      router.refresh();
    } catch {
      setResult("✗ 通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {result && (
        <span
          className={`text-xs ${
            result.startsWith("✓") ? "text-green-600" : result.startsWith("✗") ? "text-red-600" : "text-gray-500"
          }`}
        >
          {result}
        </span>
      )}
      <button
        onClick={handleSync}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
      >
        <span className={loading ? "animate-spin" : ""}>🔄</span>
        {loading ? "同期中..." : "在庫同期"}
      </button>
    </div>
  );
}
