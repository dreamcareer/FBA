/**
 * 在庫洗い出しロジック
 */

export type ShortageItem = {
  id: string;
  name: string;
  sku: string;
  logilessStock: number;
  threshold: number;
  isPrescription: boolean;
  categoryName: string;
  nextArrivalDate: string | null;
  nextArrivalQuantity: number | null;
};

export type CheckResult = {
  totalCount: number;
  executedAt: string;
  shortagesByCategory: Record<string, ShortageItem[]>;
};

export const CATEGORY_ORDER = [
  "1day10P", "1day30P", "高含水等", "Pixie",
  "ハイドロゲル", "UVチャーミング", "UVピュア", "1m2p",
  "色なしコンタクト", "Charm10P", "Charm30P",
];

export function getQuantityFromSku(sku: string): number | null {
  const s = sku.toLowerCase();
  if (s.includes("1d10") || s.startsWith("1d-") || s.startsWith("u0-") || s.startsWith("u5-") || s.startsWith("h2-") || s.startsWith("h1-") || s.startsWith("h5-") || s.startsWith("ph2-") || s.startsWith("p2-10-") || s.startsWith("s1-10-") || s.startsWith("cl-") || s.startsWith("c1d10")) return 10;
  if (s.startsWith("2d-") || s.startsWith("s1-30-") || s.startsWith("pn-30-") || s.startsWith("pc-30-") || s.startsWith("h-30-") || s.startsWith("c1d30")) return 30;
  if (s.startsWith("1m-") || s.startsWith("m1-2-")) return 10;
  return null;
}

export function getThreshold(quantity: number | null, isPrescription: boolean): number | null {
  if (quantity === 10) return isPrescription ? 30 : 300;
  if (quantity === 30) return isPrescription ? 20 : 150;
  return null;
}

export function sortCategories(names: string[]): string[] {
  return [...names].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}
