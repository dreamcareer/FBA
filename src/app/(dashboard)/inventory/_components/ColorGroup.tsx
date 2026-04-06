"use client";

import { useState } from "react";
import { getProductColor } from "@/lib/product-colors";
import InventoryRow from "./InventoryRow";

type Lot = {
  id: string;
  location: string | null;
  lotNumber: string | null;
  quantity: number;
  expiryDate: string | null;
};

type Product = {
  id: string;
  fnsku: string | null;
  sku: string;
  name: string;
  productType: string;
  fbaStockQuantity: number;
  fbaStockUpperLimit: number | null;
  business3m: number | null;
};

type ProductWithLots = {
  product: Product;
  lots: Lot[];
};

type Props = {
  colorName: string;
  items: ProductWithLots[];
  minExpiry: string;
};

export default function ColorGroup({ colorName, items, minExpiry }: Props) {
  const [open, setOpen] = useState(true);
  const bgColor = getProductColor(items[0]?.product.name ?? "") ?? "#f9f9f9";
  const totalStock = items.reduce(
    (s, item) => s + item.lots.reduce((ls, l) => ls + l.quantity, 0), 0
  );

  return (
    <>
      <tr
        className="cursor-pointer hover:brightness-95 border-b border-gray-200"
        style={{ backgroundColor: bgColor }}
        onClick={() => setOpen(!open)}
      >
        <td className="px-3 py-1 font-medium text-gray-700" colSpan={5}>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-blue-500 text-white text-[9px]">
              {open ? "−" : "+"}
            </span>
            {colorName}
            <span className="text-gray-400 font-normal">({items.length})</span>
          </span>
        </td>
        <td className="px-3 py-1 text-right tabular-nums font-semibold text-gray-700">
          {totalStock.toLocaleString()}
        </td>
        <td colSpan={3} />
      </tr>
      {open && items.map((item, idx) => (
        <InventoryRow
          key={item.product.id}
          product={item.product}
          lots={item.lots}
          stripe={idx % 2 === 0 ? "bg-white" : "bg-gray-50/70"}
          minExpiry={minExpiry}
        />
      ))}
    </>
  );
}
