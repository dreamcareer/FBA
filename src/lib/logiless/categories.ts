/**
 * Logiless identification_code のプレフィックスから商品カテゴリを判定する
 */

type CategoryRule = {
  prefix: string;
  category: string;
};

const CATEGORY_RULES: CategoryRule[] = [
  // 1day 10枚入
  { prefix: "1D-", category: "1day10P" },
  // 1day 30枚入
  { prefix: "2D-", category: "1day30P" },
  // UVモイスチャー 14.0mm
  { prefix: "U0-", category: "UVチャーミング" },
  // UVモイスチャー 14.5mm
  { prefix: "U5-", category: "UVピュア" },
  // Pixie
  { prefix: "P2-10-", category: "Pixie" },
  // シリコーンハイドロゲル 10枚入
  { prefix: "S1-10-", category: "ハイドロゲル" },
  // シリコーンハイドロゲル 30枚入
  { prefix: "S1-30-", category: "ハイドロゲル" },
  // UV高含水55%
  { prefix: "H2-", category: "高含水等" },
  { prefix: "H1-", category: "高含水等" },
  { prefix: "H5-", category: "高含水等" },
  // UV高含水58%
  { prefix: "PH2-", category: "高含水等" },
  // 1month 1枚入
  { prefix: "1M-", category: "1m2p" },
  // 1month 2枚入
  { prefix: "M1-2-", category: "1m2p" },
  // クリアレンズ
  { prefix: "CL-", category: "色なしコンタクト" },
  { prefix: "PN-30-CL", category: "色なしコンタクト" },
  { prefix: "PC-30-CL", category: "色なしコンタクト" },
  { prefix: "S1-30-CL", category: "色なしコンタクト" },
  { prefix: "H-30-CL", category: "色なしコンタクト" },
  // Charm 10枚入
  { prefix: "C1d10", category: "Charm10P" },
  // Charm 30枚入
  { prefix: "C1d30", category: "Charm30P" },
];

/**
 * identification_codeからカテゴリ名を判定
 * マッチしない場合は null を返す
 */
export function getCategoryFromCode(identificationCode: string): string | null {
  for (const rule of CATEGORY_RULES) {
    if (identificationCode.startsWith(rule.prefix)) {
      return rule.category;
    }
  }
  return null;
}

/**
 * 度数情報から度あり/度なしを判定
 * 名前に「±0.00度」を含む場合は度なし
 */
export function getProductType(name: string): "WITH_PRESCRIPTION" | "WITHOUT_PRESCRIPTION" {
  if (name.includes("±0.00") || name.includes("±０") || name.includes("度なし")) {
    return "WITHOUT_PRESCRIPTION";
  }
  return "WITH_PRESCRIPTION";
}
