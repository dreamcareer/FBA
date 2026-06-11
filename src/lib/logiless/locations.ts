// ── ロジレス在庫ロケーションの除外判定 ────────────────────

/**
 * 販売不可在庫のロケーション接頭辞
 * 「不具合品」「返送品」「出荷期限切れ品」（返送品1〜11等の連番あり）は
 * 在庫一覧・在庫洗い出し・納品数量計算のすべてで在庫として扱わない
 */
export const UNSELLABLE_LOCATION_PREFIXES = [
  "不具合品",
  "返送品",
  "出荷期限切れ",
] as const;

/** 画面表記用ラベル（除外しているロケーションの説明） */
export const UNSELLABLE_LOCATION_LABEL = "不具合品・返送品・出荷期限切れ品";

/** 不具合品・返送品・出荷期限切れ品ロケーションかどうか */
export function isUnsellableLocation(location: string | null): boolean {
  if (!location) return false;
  return UNSELLABLE_LOCATION_PREFIXES.some((p) => location.startsWith(p));
}

/** Prismaの logilessInventories リレーション用where条件（不具合品・返送品を除外） */
export const excludeUnsellableLocations = {
  NOT: UNSELLABLE_LOCATION_PREFIXES.map((p) => ({
    location: { startsWith: p },
  })),
};
