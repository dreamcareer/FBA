"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export default function SearchInput() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const [isPending, startTransition] = useTransition();
  const isInitial = useRef(true);

  useEffect(() => {
    // 初回マウント時はスキップ（ページ遷移で再マウントされたとき対策）
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }

    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set("q", value);
      } else {
        params.delete("q");
      }
      params.set("page", "1");
      startTransition(() => {
        router.push(`?${params.toString()}`);
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="FNSKU、ロジレス識別番号、商品名で検索"
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-80 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {isPending && (
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
          <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
