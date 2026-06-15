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
  sku: string;
  asin: string | null;
  jan: string | null;
  name: string;
  productType: string;
  fbaStockQuantity: number;
  fbaStockUpperLimit: number | null;
  fbaLimitNote: string | null;
  fbaOpenPoQuantity: number | null;
  business3m: number | null;
  business1y: number | null;
  stockUpperLimit: number | null;
};

type ProductWithLots = {
  product: Product;
  lots: Lot[];
};

type Props = {
  colorName: string;
  parentAsin: string | null;
  items: ProductWithLots[];
  minExpiry: string;
};

export default function ColorGroup({ colorName, parentAsin, items, minExpiry }: Props) {
  const [open, setOpen] = useState(true);
  const bgColor = getProductColor(items[0]?.product.name ?? "") ?? "#f9f9f9";
  const totalStock = items.reduce(
    (s, item) => s + item.lots.reduce((ls, l) => ls + l.quantity, 0), 0
  );
  // 同グループのSKUプレフィックス（末尾の度数を除いた共通部分）で
  // セラーセントラルの在庫管理を絞り込み表示する
  const skuPrefix = (items[0]?.product.sku ?? "").replace(/\d+$/, "");
  const sellerCentralUrl =
    "https://sellercentral.amazon.co.jp/myinventory/inventory" +
    "?fulfilledBy=all&page=1&pageSize=250&sort=date_created_desc&status=all" +
    `&searchString=${encodeURIComponent(skuPrefix)}`;

  return (
    <>
      <tr
        className="cursor-pointer hover:brightness-95 border-b border-gray-200"
        style={{ backgroundColor: bgColor }}
        onClick={() => setOpen(!open)}
      >
        <td className="px-3 py-1 font-medium text-gray-700" colSpan={6}>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-blue-500 text-white text-[9px]">
              {open ? "−" : "+"}
            </span>
            {colorName}
            <span className="text-gray-400 font-normal">({items.length})</span>
            {parentAsin && (
              <a
                href={sellerCentralUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={`セラーセントラルの在庫管理を開く（SKU: ${skuPrefix} で検索）`}
                className="ml-1 inline-flex items-center gap-0.5 text-[10px] font-normal text-blue-600 hover:underline"
              >
                (親)ASIN: {parentAsin}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-2.5 w-2.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                  />
                </svg>
              </a>
            )}
          </span>
        </td>
        <td className="px-3 py-1 text-right tabular-nums font-semibold text-gray-700">
          {totalStock.toLocaleString()}
        </td>
        <td colSpan={5} />
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
