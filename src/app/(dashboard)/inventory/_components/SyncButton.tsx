"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function needsReauth(message: string | undefined): boolean {
  return !!message && message.includes("再認可");
}

type Mode = "diff" | "full";

export default function SyncButton() {
  const [loading, setLoading] = useState<Mode | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [reauthRequired, setReauthRequired] = useState(false);
  const router = useRouter();

  async function handleSync(mode: Mode) {
    setLoading(mode);
    setResult(null);
    setReauthRequired(false);
    try {
      // Step 1: 商品マスタ同期
      // diff: 新規商品のみ（高速）/ full: 全件再取得して attr4 から SKU 反映（数分）
      setResult(
        mode === "full"
          ? "全商品の商品マスタを再取得中（数分かかります）..."
          : "新規商品を確認中..."
      );
      const articlesRes = await fetch(`/api/sync/articles?mode=${mode}`, {
        method: "POST",
      });
      const articlesData = await articlesRes.json();
      if (!articlesRes.ok) {
        if (needsReauth(articlesData.error)) {
          setReauthRequired(true);
          setResult(null);
        } else {
          setResult(`✗ 商品マスタ同期エラー: ${articlesData.error}`);
        }
        return;
      }

      // Step 2: FBA在庫同期（SP-API → 在庫数 + ASIN）
      setResult("FBA在庫を同期中...");
      const fbaRes = await fetch("/api/sync/fba-inventory", { method: "POST" });
      const fbaData = await fbaRes.json();
      if (!fbaRes.ok) {
        setResult(`✗ FBA同期エラー: ${fbaData.error}`);
        return;
      }

      // Step 3: ロジレス在庫同期
      setResult("ロジレス在庫を同期中...");
      const invRes = await fetch("/api/sync/inventory", { method: "POST" });
      const invData = await invRes.json();
      if (!invRes.ok) {
        if (needsReauth(invData.error)) {
          setReauthRequired(true);
          setResult(null);
        } else {
          setResult(`✗ 在庫同期エラー: ${invData.error}`);
        }
        return;
      }

      const articleMsg =
        mode === "full"
          ? `商品マスタ ${articlesData.updated}件更新`
          : articlesData.created > 0
            ? `新規 ${articlesData.created}件`
            : "新規なし";
      setResult(
        `✓ ${articleMsg} / FBA在庫 ${fbaData.updated}件 / ASIN ${fbaData.asinUpdated}件 / ロジレス ${invData.synced}件`
      );
      router.refresh();
    } catch {
      setResult("✗ 通信エラーが発生しました");
    } finally {
      setLoading(null);
    }
  }

  const isLoading = loading !== null;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-3">
        {result && (
          <span
            className={`text-xs max-w-md ${
              result.startsWith("✓")
                ? "text-green-600"
                : result.startsWith("✗")
                  ? "text-red-600"
                  : "text-gray-500"
            }`}
          >
            {result}
          </span>
        )}
        <div className="flex flex-col items-center gap-0.5">
          <button
            onClick={() => handleSync("diff")}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <span className={loading === "diff" ? "animate-spin" : ""}>🔄</span>
            {loading === "diff" ? "同期中..." : "同期"}
          </button>
          <span className="text-[10px] text-gray-400 leading-tight">
            新規商品・FBA在庫数・ロジレス在庫
          </span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <button
            onClick={() => handleSync("full")}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-amber-300 bg-amber-50 text-amber-800 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors"
          >
            <span className={loading === "full" ? "animate-spin" : ""}>♻️</span>
            {loading === "full" ? "再取得中..." : "商品マスタ再取得"}
          </button>
          <span className="text-[10px] text-amber-700/70 leading-tight">
            SKU・カテゴリ・商品名を上書き（3〜4分）
          </span>
        </div>
      </div>
      {reauthRequired && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-300 rounded-lg shadow-sm max-w-md">
          <span className="text-2xl leading-none">⚠️</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">
              Logiless の認可が切れています
            </p>
            <p className="text-xs text-amber-800 mt-1">
              下のボタンから再認可してください。Logiless にログイン → 同意 → 自動的に戻ってきます。
            </p>
            <a
              href="/api/logiless/authorize"
              className="inline-block mt-2 px-3 py-1.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors"
            >
              Logiless を認可する →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
