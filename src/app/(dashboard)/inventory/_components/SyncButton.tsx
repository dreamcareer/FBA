"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  async function handleSync(fullSync: boolean) {
    setLoading(true);
    setResult(null);
    try {
      // Step 1: 商品マスタ同期（diff=新規のみ / full=全件）
      const mode = fullSync ? "full" : "diff";
      setResult(fullSync ? "商品マスタを全件同期中..." : "新規商品を確認中...");
      const articlesRes = await fetch(`/api/sync/articles?mode=${mode}`, { method: "POST" });
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

      const articleMsg = articlesData.created > 0
        ? `新規${articlesData.created}件登録、`
        : "";
      setResult(`✓ ${articleMsg}在庫 ${invData.synced}件同期`);
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
          className={`text-xs max-w-xs ${
            result.startsWith("✓") ? "text-green-600" : result.startsWith("✗") ? "text-red-600" : "text-gray-500"
          }`}
        >
          {result}
        </span>
      )}
      <button
        onClick={() => handleSync(false)}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
      >
        <span className={loading ? "animate-spin" : ""}>🔄</span>
        {loading ? "同期中..." : "在庫同期"}
      </button>
      <button
        onClick={() => handleSync(true)}
        disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50 transition-colors"
        title="全商品マスタを再取得（初回や商品追加時に使用、数分かかります）"
      >
        フル同期
      </button>
    </div>
  );
}
