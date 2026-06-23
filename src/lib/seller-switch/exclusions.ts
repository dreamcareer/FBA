import type { ProductType } from "@prisma/client";

// ── 出品者出荷切替の対象外判定 ────────────────────────────
//
// 手動手順①の「対象外: 度なし(000,10000,10000s)・セット商品(〇箱)・
// ミスティピーチブラウン(mpb)」をコード化したもの。
// 商品マスタ未登録（SKUに対応する Product 無し）は enrich 側で別途扱う。

export interface ProductForExclusion {
  sku: string;
  name: string;
  productType: ProductType;
}

/**
 * 出品者切替の対象外理由を返す。null = 対象（切替候補になりうる）。
 */
export function getExclusionReason(
  product: ProductForExclusion
): string | null {
  // 度なし（カラコン）は対象外
  if (product.productType === "WITHOUT_PRESCRIPTION") return "度なし";
  // セット商品（〇箱）は対象外
  if (product.name.includes("箱") || product.sku.includes("箱")) {
    return "セット商品";
  }
  // ミスティピーチブラウン（mpb）は対象外（例: 1d10sh141mpb600）
  if (/mpb/i.test(product.sku)) return "ミスティピーチブラウン";
  return null;
}
