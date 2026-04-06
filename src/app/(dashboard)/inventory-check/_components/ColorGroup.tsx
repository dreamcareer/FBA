"use client";

import { useState } from "react";
import { getProductColor } from "@/lib/product-colors";
import ShortageRow from "./ShortageRow";
import type { ShortageItem } from "./ShortageRow";

type Props = {
  colorName: string;
  items: ShortageItem[];
};

export default function ColorGroup({ colorName, items }: Props) {
  const [open, setOpen] = useState(false);
  const bgColor = getProductColor(items[0]?.name ?? "") ?? "#f9f9f9";
  const totalShortage = items.reduce((s, i) => s + (i.threshold - i.logilessStock), 0);

  return (
    <>
      <tr
        className="cursor-pointer hover:brightness-95 border-b border-gray-200"
        style={{ backgroundColor: bgColor }}
        onClick={() => setOpen(!open)}
      >
        <td className="px-3 py-1 font-medium text-gray-700" colSpan={4}>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-blue-500 text-white text-[9px]">
              {open ? "−" : "+"}
            </span>
            {colorName}
            <span className="text-gray-400 font-normal">({items.length})</span>
          </span>
        </td>
        <td className="px-3 py-1 text-right tabular-nums text-gray-400" />
        <td className="px-3 py-1 text-right tabular-nums text-red-500 font-semibold">
          {totalShortage.toLocaleString()}
        </td>
        <td colSpan={2} />
      </tr>
      {open && items.map((item, idx) => (
        <ShortageRow key={item.id} item={item} idx={idx} />
      ))}
    </>
  );
}
