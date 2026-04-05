"use client";

import { useState } from "react";

export type ShortageItem = {
  id: string;
  name: string;
  sku: string;
  fnsku: string | null;
  logilessStock: number;
  threshold: number;
  isPrescription: boolean;
  categoryName: string;
  nextArrivalDate: string | null;
  nextArrivalQuantity: number | null;
};

export default function ShortageRow({ item, idx }: { item: ShortageItem; idx: number }) {
  const [arrivalDate, setArrivalDate] = useState(item.nextArrivalDate ?? "");
  const [arrivalQty, setArrivalQty] = useState(item.nextArrivalQuantity?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const shortage = item.threshold - item.logilessStock;
  const stripe = idx % 2 === 0 ? "bg-white" : "bg-gray-50/70";
  const critical = item.logilessStock === 0;

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await fetch("/api/products/arrival", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: item.id,
        nextArrivalDate: arrivalDate || null,
        nextArrivalQuantity: arrivalQty ? Number(arrivalQty) : null,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // 入力値が変わったか
  const isDirty =
    (arrivalDate || "") !== (item.nextArrivalDate ?? "") ||
    (arrivalQty || "") !== (item.nextArrivalQuantity?.toString() ?? "");

  return (
    <tr className={`${stripe} border-b border-gray-100`}>
      <td className="px-3 py-0.5 text-gray-800 max-w-[300px] truncate" title={item.name}>{item.name}</td>
      <td className="px-3 py-0.5 font-mono text-gray-500 whitespace-nowrap">
        {item.fnsku ?? "—"}<br /><span className="text-gray-400">{item.sku}</span>
      </td>
      <td className="px-3 py-0.5 text-center">
        {item.isPrescription
          ? <span className="text-purple-600">度あり</span>
          : <span className="text-teal-600">度なし</span>}
      </td>
      <td className={`px-3 py-0.5 text-right tabular-nums font-semibold ${critical ? "text-red-600" : "text-amber-600"}`}>
        {item.logilessStock.toLocaleString()}
      </td>
      <td className="px-3 py-0.5 text-right tabular-nums text-gray-400">
        {item.threshold.toLocaleString()}
      </td>
      <td className="px-3 py-0.5 text-right tabular-nums text-red-600 font-semibold">
        {shortage.toLocaleString()}
      </td>
      <td className="px-2 py-0.5">
        <input
          type="date"
          value={arrivalDate}
          onChange={(e) => setArrivalDate(e.target.value)}
          className="border border-gray-200 rounded px-1.5 py-0.5 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </td>
      <td className="px-2 py-0.5">
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={arrivalQty}
            onChange={(e) => setArrivalQty(e.target.value)}
            placeholder="—"
            className="border border-gray-200 rounded px-1.5 py-0.5 text-xs w-16 text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          {isDirty && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-1.5 py-0.5 text-[10px] bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 whitespace-nowrap"
            >
              {saving ? "..." : "保存"}
            </button>
          )}
          {saved && <span className="text-green-500 text-[10px]">OK</span>}
        </div>
      </td>
    </tr>
  );
}
