"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  planId: string;
  orderCode: string;
};

export default function CancelButton({ planId, orderCode }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleCancel() {
    if (
      !confirm(
        `納品プラン「${orderCode}」を取り消します。\n` +
          `ロジレスの受注もキャンセルされます。よろしいですか？`
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/delivery-plan/${planId}/cancel`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        alert(`エラー: ${json.error ?? "取り消しに失敗しました"}`);
        return;
      }
      router.refresh();
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleCancel}
      disabled={loading}
      className="shrink-0 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
    >
      {loading ? "取り消し中..." : "取り消し"}
    </button>
  );
}
