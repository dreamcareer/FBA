import { format } from "date-fns";

export interface DeliveryPlanCsvItem {
  plannedQuantity: number;
  lotNumber: string | null;
  expiryDate: Date | null;
  product: { sku: string; name: string };
}

/** カンマ・引用符・改行を含むフィールドをダブルクォートで囲む */
function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * 納品プランのCSVを生成する（Excel対応のためUTF-8 BOM付き）
 */
export function buildDeliveryPlanCsv(
  logilessOrderCode: string,
  shipmentDate: Date,
  items: DeliveryPlanCsvItem[]
): string {
  const header = ["受注コード", "出荷日", "SKU", "商品名", "数量", "ロット番号", "使用期限"];

  const rows = items.map((item) => [
    logilessOrderCode,
    format(shipmentDate, "yyyy-MM-dd"),
    item.product.sku,
    item.product.name,
    String(item.plannedQuantity),
    item.lotNumber ?? "",
    item.expiryDate ? format(item.expiryDate, "yyyy-MM-dd") : "",
  ]);

  const lines = [header, ...rows].map((row) =>
    row.map(escapeCsvField).join(",")
  );

  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
