"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ImportResult = {
  success: boolean;
  data?: {
    totalRows: number;
    updated: number;
    unmatched: number;
    unmatchedSamples: string[];
    skippedEmpty: number;
    importedAt: string;
  };
  error?: string;
};

export default function ImportForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/fba-limits/import", {
        method: "POST",
        body: formData,
      });
      const json: ImportResult = await res.json();
      setResult(json);
      if (json.success) {
        router.refresh();
      }
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="block text-sm text-gray-700 mb-1.5">
            CSVファイル
          </label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
            }}
            disabled={loading}
            className="block w-full text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 disabled:opacity-50"
          />
          <p className="text-xs text-gray-400 mt-1">
            SKU, 上限指定 の2列を含むCSV（例: 1d10eb750,20）
          </p>
        </div>

        <button
          type="submit"
          disabled={!file || loading}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "取り込み中..." : "取り込む"}
        </button>
      </form>

      {result && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            result.success
              ? "bg-green-50 border-green-200 text-green-900"
              : "bg-red-50 border-red-200 text-red-900"
          }`}
        >
          {result.success && result.data ? (
            <div className="space-y-2">
              <p className="font-semibold">取り込みが完了しました</p>
              <ul className="space-y-1 text-xs">
                <li>CSV総行数: {result.data.totalRows.toLocaleString()} 件</li>
                <li>更新: {result.data.updated.toLocaleString()} 件</li>
                <li>SKU未登録（スキップ）: {result.data.unmatched.toLocaleString()} 件</li>
                {result.data.skippedEmpty > 0 && (
                  <li>上限指定が空欄（スキップ）: {result.data.skippedEmpty.toLocaleString()} 件</li>
                )}
              </ul>
              {result.data.unmatchedSamples.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-gray-600">
                    未登録SKUサンプル（最大20件）
                  </summary>
                  <ul className="mt-1.5 pl-4 text-xs font-mono text-gray-500 space-y-0.5">
                    {result.data.unmatchedSamples.map((sku, i) => (
                      <li key={`${sku}-${i}`}>{sku}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ) : (
            <p>エラー: {result.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
