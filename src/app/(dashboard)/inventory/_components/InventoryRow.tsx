"use client";

import { useState } from "react";
import { getProductColor } from "@/lib/product-colors";
import { useSkuColumn } from "./SkuColumnContext";

type Lot = {
  id: string;
  location: string | null;
  lotNumber: string | null;
  quantity: number;
  expiryDate: string | null; // ISO string
};

type Props = {
  product: {
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
  lots: Lot[];
  stripe: string;
  minExpiry: string; // ISO string
};

export default function InventoryRow({ product, lots, stripe, minExpiry }: Props) {
  const [open, setOpen] = useState(false);
  const { expanded: skuExpanded } = useSkuColumn();
  const hasLots = lots.length > 1;
  const productColor = getProductColor(product.name);

  const logilessTotal = lots.reduce((s, i) => s + i.quantity, 0);
  const locations = [...new Set(lots.map((i) => i.location).filter(Boolean))];
  const sortedLots = [...lots]
    .filter((i) => i.expiryDate)
    .sort((a, b) => new Date(a.expiryDate!).getTime() - new Date(b.expiryDate!).getTime());
  const nearestExpiry = sortedLots[0]?.expiryDate ? new Date(sortedLots[0].expiryDate) : null;
  const expiryWarning = nearestExpiry && nearestExpiry < new Date(minExpiry);
  const isLowFba = product.fbaStockQuantity < (product.business3m ?? 0) * 0.5;

  // FBA在庫が上限に達しているかの判定（入荷予定は新CSVで管理しなくなったため在庫数のみで判定）
  const openPo = product.fbaOpenPoQuantity ?? 0;
  const isAtCapacity =
    product.fbaStockUpperLimit !== null &&
    product.fbaStockQuantity >= product.fbaStockUpperLimit;

  const formatDate = (d: Date) =>
    d.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });

  return (
    <>
      <tr
        className={`hover:bg-gray-50/50 border-b border-gray-100 ${hasLots ? "cursor-pointer" : ""}`}
        onClick={() => hasLots && setOpen(!open)}
      >
        <td className="px-3 py-0.5 font-mono text-gray-500 whitespace-nowrap align-top">
          {product.sku}
          {skuExpanded && (
            <>
              <br />
              <span className="text-gray-400">{product.asin ?? "—"}</span>
              <br />
              <span className="text-gray-400">{product.jan ?? "—"}</span>
            </>
          )}
        </td>
        <td className="px-3 py-0.5 text-gray-800 whitespace-nowrap">
          {product.name}
        </td>
        <td className="px-3 py-0.5 text-center whitespace-nowrap">
          {product.productType === "WITH_PRESCRIPTION"
            ? <span className="text-purple-600">度あり</span>
            : <span className="text-teal-600">度なし</span>}
        </td>
        <td className={`px-3 py-0.5 text-right tabular-nums ${isAtCapacity ? "text-red-600 font-semibold" : "text-gray-400"}`}>
          {product.fbaLimitNote ? (
            <span className="text-gray-600">{product.fbaLimitNote}</span>
          ) : (
            <>
              {product.fbaStockUpperLimit?.toLocaleString() ?? "—"}
              {isAtCapacity && <span className="ml-0.5">⚠</span>}
            </>
          )}
        </td>
        <td className={`px-3 py-0.5 text-right tabular-nums ${isLowFba ? "text-red-600 font-semibold" : "text-gray-700"}`}>
          {product.fbaStockQuantity.toLocaleString()}
        </td>
        <td className="px-3 py-0.5 text-right tabular-nums text-gray-500">
          {openPo > 0 ? openPo.toLocaleString() : "—"}
        </td>
        <td className={`px-3 py-0.5 text-right tabular-nums font-semibold ${logilessTotal === 0 ? "text-red-500" : "text-gray-800"}`}>
          {logilessTotal.toLocaleString()}
          {hasLots && (
            <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded bg-blue-500 text-white text-[9px]">{open ? "−" : "+"}</span>
          )}
        </td>
        <td className="px-3 py-0.5 text-right tabular-nums text-gray-400">
          {product.business3m?.toFixed(1) ?? "—"}
        </td>
        <td className="px-3 py-0.5 text-right tabular-nums text-gray-400">
          {product.business1y?.toFixed(1) ?? "—"}
        </td>
        <td className="px-3 py-0.5 font-mono text-gray-500 max-w-[120px] truncate" title={locations.join(", ")}>
          {locations.length > 0 ? locations.join(", ") : "—"}
        </td>
        <td className={`px-3 py-0.5 whitespace-nowrap ${expiryWarning ? "text-amber-600 font-semibold" : "text-gray-400"}`}>
          {nearestExpiry ? formatDate(nearestExpiry) : "—"}
          {expiryWarning && " ⚠"}
        </td>
        <td className="px-3 py-0.5 text-right tabular-nums text-gray-400">
          {product.stockUpperLimit?.toLocaleString() ?? "—"}
        </td>
      </tr>

      {/* ロット別明細 */}
      {open && lots.map((lot) => {
        const lotExpiry = lot.expiryDate ? new Date(lot.expiryDate) : null;
        const lotWarn = lotExpiry && lotExpiry < new Date(minExpiry);
        return (
          <tr key={lot.id} className="bg-blue-50/30 border-b border-gray-100">
            <td className="px-3 py-0.5" />
            <td className="px-3 py-0.5 text-gray-400 pl-6" colSpan={2}>
              ロット: {lot.lotNumber ?? "—"}
            </td>
            <td className="px-3 py-0.5" />
            <td className="px-3 py-0.5" />
            <td className="px-3 py-0.5" />
            <td className="px-3 py-0.5 text-right tabular-nums text-gray-600">
              {lot.quantity.toLocaleString()}
            </td>
            <td className="px-3 py-0.5" />
            <td className="px-3 py-0.5" />
            <td className="px-3 py-0.5 font-mono text-gray-500">
              {lot.location ?? "—"}
            </td>
            <td className={`px-3 py-0.5 whitespace-nowrap ${lotWarn ? "text-amber-600 font-semibold" : "text-gray-400"}`}>
              {lotExpiry ? formatDate(lotExpiry) : "—"}
              {lotWarn && " ⚠"}
            </td>
            <td className="px-3 py-0.5" />
          </tr>
        );
      })}
    </>
  );
}
