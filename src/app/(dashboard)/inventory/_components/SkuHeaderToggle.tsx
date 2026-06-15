"use client";

import { useSkuColumn } from "./SkuColumnContext";

/** SKUヘッダー: クリックでASIN/JANを開閉するトグル */
export default function SkuHeaderToggle() {
  const { expanded, toggle } = useSkuColumn();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={expanded}
      className="flex flex-col items-start text-left text-white hover:text-gray-200"
    >
      <span className="inline-flex items-center gap-1 font-medium">
        SKU
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2.5}
          stroke="currentColor"
          className={`h-3 w-3 text-gray-300 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </span>
      {expanded && (
        <>
          <span className="font-normal text-gray-400">ASIN</span>
          <span className="font-normal text-gray-400">JAN</span>
        </>
      )}
    </button>
  );
}
