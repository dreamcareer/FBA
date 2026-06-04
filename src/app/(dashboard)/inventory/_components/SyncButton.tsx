"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

function needsReauth(message: string | undefined): boolean {
  return !!message && message.includes("再認可");
}

function formatSyncDate(iso: string | null): string {
  if (!iso) return "未同期";
  try {
    return format(new Date(iso), "MM/dd HH:mm");
  } catch {
    return "未同期";
  }
}

type SyncMode = "both" | "fba" | "logiless";
type ButtonMode = SyncMode | "full";

type StepKey = "articles" | "articlesFull" | "fba" | "logiless";
type StepStatus = "pending" | "running" | "done" | "error";

type Step = {
  key: StepKey;
  label: string;
  status: StepStatus;
  phase?: string;
  current?: number;
  total?: number;
  startedAt?: number;
};

type ProgressEvent =
  | { type: "phase"; label: string }
  | { type: "progress"; current: number; total?: number; label?: string }
  | { type: "done"; data: Record<string, unknown> }
  | { type: "error"; error: string };

const STEP_LABEL: Record<StepKey, string> = {
  articles: "新規商品を確認",
  articlesFull: "商品マスタを再取得",
  fba: "FBA在庫を同期",
  logiless: "ロジレス在庫を同期",
};

type Props = {
  lastFbaSyncAt: string | null;
  lastLogilessSyncAt: string | null;
};

export default function SyncButton({ lastFbaSyncAt, lastLogilessSyncAt }: Props) {
  const [loading, setLoading] = useState<ButtonMode | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [reauthRequired, setReauthRequired] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [elapsedTick, setElapsedTick] = useState(0); // 経過秒の再描画用
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  function startElapsedTick() {
    if (tickRef.current) return;
    tickRef.current = setInterval(() => {
      setElapsedTick((v) => v + 1);
    }, 500);
  }

  function stopElapsedTick() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  function buildSteps(keys: StepKey[]): Step[] {
    return keys.map((key) => ({
      key,
      label: STEP_LABEL[key],
      status: "pending" as StepStatus,
    }));
  }

  function updateStep(key: StepKey, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  /**
   * NDJSON ストリームを読みながら進捗イベントを処理する
   * 戻り値: 最終的な data (done イベントから)
   */
  async function streamRequest(
    url: string,
    stepKey: StepKey
  ): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
    updateStep(stepKey, { status: "running", startedAt: Date.now() });

    const res = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/x-ndjson" },
    });

    if (!res.ok || !res.body) {
      let errMessage = `HTTP ${res.status}`;
      try {
        const t = await res.text();
        if (t) errMessage = t;
      } catch {
        /* ignore */
      }
      updateStep(stepKey, { status: "error" });
      return { ok: false, error: errMessage };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalData: Record<string, unknown> | null = null;
    let errorMessage: string | null = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;

        let event: ProgressEvent;
        try {
          event = JSON.parse(line) as ProgressEvent;
        } catch {
          continue;
        }

        if (event.type === "phase") {
          updateStep(stepKey, {
            phase: event.label,
            current: undefined,
            total: undefined,
          });
        } else if (event.type === "progress") {
          updateStep(stepKey, {
            current: event.current,
            total: event.total,
            phase: event.label,
          });
        } else if (event.type === "done") {
          finalData = event.data;
        } else if (event.type === "error") {
          errorMessage = event.error;
        }
      }
    }

    if (errorMessage) {
      updateStep(stepKey, { status: "error" });
      return { ok: false, error: errorMessage };
    }
    updateStep(stepKey, {
      status: "done",
      phase: undefined,
      current: finalData?.total as number | undefined,
      total: finalData?.total as number | undefined,
    });
    return { ok: true, data: finalData ?? {} };
  }

  async function handleSync(mode: SyncMode) {
    setMenuOpen(false);
    setLoading(mode);
    setResult(null);
    setReauthRequired(false);

    const stepKeys: StepKey[] =
      mode === "both"
        ? ["articles", "fba", "logiless"]
        : mode === "fba"
          ? ["fba"]
          : ["logiless"];
    setSteps(buildSteps(stepKeys));
    startElapsedTick();

    try {
      const parts: string[] = [];

      if (mode === "both") {
        const r = await streamRequest("/api/sync/articles?mode=diff", "articles");
        if (!r.ok) {
          if (needsReauth(r.error)) {
            setReauthRequired(true);
          } else {
            setResult(`✗ 商品マスタ同期エラー: ${r.error}`);
          }
          return;
        }
        const created = (r.data.created as number) ?? 0;
        parts.push(created > 0 ? `新規 ${created}件` : "新規なし");
      }

      if (mode === "both" || mode === "fba") {
        // 通常同期では ASIN を更新しない（withAsin を付けない）
        const r = await streamRequest("/api/sync/fba-inventory", "fba");
        if (!r.ok) {
          setResult(`✗ FBA同期エラー: ${r.error}`);
          return;
        }
        parts.push(`FBA在庫 ${(r.data.updated as number) ?? 0}件`);
      }

      if (mode === "both" || mode === "logiless") {
        const r = await streamRequest("/api/sync/inventory", "logiless");
        if (!r.ok) {
          if (needsReauth(r.error)) {
            setReauthRequired(true);
          } else {
            setResult(`✗ 在庫同期エラー: ${r.error}`);
          }
          return;
        }
        parts.push(`ロジレス ${(r.data.synced as number) ?? 0}件`);
      }

      setResult(`✓ ${parts.join(" / ")}`);
      router.refresh();
    } catch {
      setResult("✗ 通信エラーが発生しました");
    } finally {
      setLoading(null);
      stopElapsedTick();
      // 完了後はパネルをしばらく残してから消す
      setTimeout(() => setSteps([]), 2500);
    }
  }

  async function handleFullRefresh() {
    setLoading("full");
    setResult(null);
    setReauthRequired(false);
    setSteps(buildSteps(["articlesFull", "fba", "logiless"]));
    startElapsedTick();

    try {
      const r1 = await streamRequest("/api/sync/articles?mode=full", "articlesFull");
      if (!r1.ok) {
        if (needsReauth(r1.error)) {
          setReauthRequired(true);
        } else {
          setResult(`✗ 商品マスタ同期エラー: ${r1.error}`);
        }
        return;
      }

      // 商品マスタ再取得のときだけ ASIN も SP-API 値に更新する
      const r2 = await streamRequest("/api/sync/fba-inventory?withAsin=true", "fba");
      if (!r2.ok) {
        setResult(`✗ FBA同期エラー: ${r2.error}`);
        return;
      }

      const r3 = await streamRequest("/api/sync/inventory", "logiless");
      if (!r3.ok) {
        if (needsReauth(r3.error)) {
          setReauthRequired(true);
        } else {
          setResult(`✗ 在庫同期エラー: ${r3.error}`);
        }
        return;
      }

      setResult(
        `✓ 商品マスタ ${(r1.data.updated as number) ?? 0}件更新 / FBA在庫 ${(r2.data.updated as number) ?? 0}件 / ASIN ${(r2.data.asinUpdated as number) ?? 0}件 / ロジレス ${(r3.data.synced as number) ?? 0}件`
      );
      router.refresh();
    } catch {
      setResult("✗ 通信エラーが発生しました");
    } finally {
      setLoading(null);
      stopElapsedTick();
      setTimeout(() => setSteps([]), 2500);
    }
  }

  const isLoading = loading !== null;
  const syncing = loading === "both" || loading === "fba" || loading === "logiless";

  const menuItems: { mode: SyncMode; label: string; sublabel: string; lastSync: string | null }[] = [
    {
      mode: "both",
      label: "両方同期",
      sublabel: "新規商品・FBA在庫・ロジレス在庫",
      lastSync: null,
    },
    {
      mode: "fba",
      label: "FBA在庫のみ",
      sublabel: "SP-API から FBA 在庫数を更新",
      lastSync: lastFbaSyncAt,
    },
    {
      mode: "logiless",
      label: "ロジレス在庫のみ",
      sublabel: "ロジレスからロット別在庫を取得",
      lastSync: lastLogilessSyncAt,
    },
  ];

  const showProgress = steps.length > 0;
  const totalSteps = steps.length;
  const doneSteps = steps.filter((s) => s.status === "done").length;
  const runningStep = steps.find((s) => s.status === "running");

  function elapsedSec(start: number | undefined): string {
    if (!start) return "";
    // elapsedTick を参照することで再描画を発火させる
    void elapsedTick;
    const sec = Math.floor((Date.now() - start) / 1000);
    return `${sec}s`;
  }

  return (
    <div className="relative flex flex-col items-end gap-2">
      <div className="flex items-center gap-3">
        {result && !showProgress && (
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

        {/* 同期ドロップダウン */}
        <div className="flex flex-col items-center gap-0.5">
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              disabled={isLoading}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors min-w-[12rem] whitespace-nowrap"
            >
              <svg
                className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              {syncing
                ? loading === "fba"
                  ? "FBA同期中..."
                  : loading === "logiless"
                    ? "ロジレス同期中..."
                    : "同期中..."
                : "同期"}
              <svg
                className={`w-3 h-3 transition-transform ${menuOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1">
                {menuItems.map((item) => (
                  <button
                    key={item.mode}
                    onClick={() => handleSync(item.mode)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-gray-900">{item.label}</span>
                      {item.lastSync !== null && (
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">
                          最終: {formatSyncDate(item.lastSync)}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{item.sublabel}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="text-[10px] text-gray-400 leading-tight">
            新規商品・FBA在庫数・ロジレス在庫
          </span>
        </div>

        {/* 商品マスタ再取得 */}
        <div className="flex flex-col items-center gap-0.5">
          <button
            onClick={handleFullRefresh}
            disabled={isLoading}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm border border-amber-300 bg-amber-50 text-amber-800 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors min-w-[10.5rem] whitespace-nowrap"
          >
            <svg
              className={`w-4 h-4 ${loading === "full" ? "animate-spin" : ""}`}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
            </svg>
            {loading === "full" ? "再取得中..." : "商品マスタ再取得"}
          </button>
          <span className="text-[10px] text-amber-700/70 leading-tight">
            SKU・カテゴリ・商品名を上書き（3〜4分）
          </span>
        </div>
      </div>

      {/* 進捗パネル */}
      {showProgress && (
        <div className="absolute top-full right-0 mt-2 w-96 px-3.5 py-3 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-700">
              {doneSteps === totalSteps
                ? "✓ 完了"
                : `同期中... (${Math.min(doneSteps + 1, totalSteps)}/${totalSteps})`}
            </span>
            {runningStep && (
              <span className="text-[10px] text-gray-500 tabular-nums">
                経過 {elapsedSec(runningStep.startedAt)}
              </span>
            )}
          </div>

          <ul className="space-y-1.5">
            {steps.map((s) => {
              const isRunning = s.status === "running";
              const hasTotal =
                isRunning && s.total !== undefined && s.total > 0;
              const pct =
                hasTotal && s.current !== undefined
                  ? Math.min(100, (s.current / (s.total as number)) * 100)
                  : 0;

              return (
                <li key={s.key} className="text-[11px]">
                  <div
                    className={`flex items-center gap-1.5 ${
                      isRunning
                        ? "text-gray-900 font-medium"
                        : s.status === "done"
                          ? "text-gray-500"
                          : s.status === "error"
                            ? "text-red-600"
                            : "text-gray-400"
                    }`}
                  >
                    <span className="w-3 inline-flex justify-center">
                      {s.status === "done"
                        ? "✓"
                        : s.status === "error"
                          ? "✗"
                          : s.status === "running"
                            ? "●"
                            : "○"}
                    </span>
                    <span>{s.label}</span>
                    {isRunning && hasTotal && (
                      <span className="ml-auto tabular-nums text-gray-500">
                        {s.current}/{s.total}
                      </span>
                    )}
                    {isRunning && !hasTotal && s.current !== undefined && (
                      <span className="ml-auto tabular-nums text-gray-500">
                        {s.current}件
                      </span>
                    )}
                  </div>

                  {isRunning && (
                    <div className="mt-1 ml-[18px]">
                      <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                        {hasTotal ? (
                          <div
                            className="h-full bg-blue-500 transition-all duration-200 ease-out"
                            style={{ width: `${pct}%` }}
                          />
                        ) : (
                          <div className="h-full sync-indeterminate" />
                        )}
                      </div>
                      {s.phase && (
                        <p className="mt-1 text-[10px] text-gray-500 leading-snug">
                          {s.phase}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {result && (
            <p
              className={`mt-2.5 pt-2 border-t border-gray-100 text-[10px] leading-snug ${
                result.startsWith("✓")
                  ? "text-green-600"
                  : result.startsWith("✗")
                    ? "text-red-600"
                    : "text-gray-500"
              }`}
            >
              {result}
            </p>
          )}

          <style jsx>{`
            .sync-indeterminate {
              background: linear-gradient(
                90deg,
                transparent 0%,
                #3b82f6 50%,
                transparent 100%
              );
              background-size: 40% 100%;
              background-repeat: no-repeat;
              animation: sync-slide 1.2s linear infinite;
            }
            @keyframes sync-slide {
              0% {
                background-position: -40% 0;
              }
              100% {
                background-position: 140% 0;
              }
            }
          `}</style>
        </div>
      )}

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
