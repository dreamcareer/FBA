import { db } from "@/lib/db";
import { searchListings } from "@/lib/sp-api/client";

export interface SnapshotSyncResult {
  /** 今回検出した「停止中×FBA」の総数 */
  total: number;
  /** 初回（テーブルが空）の基準作成だったか。trueのとき newlyDetected は空 */
  isInitialSeed: boolean;
  /** 新規に停止中になったSKU（前回スナップショットに無かったもの）= 切替候補 */
  newlyDetected: { sku: string; asin: string | null; itemName: string | null }[];
  /** 在庫復活でスナップショットから削除したSKU数 */
  removed: number;
}

/**
 * 「停止中×FBA」の現在集合を取得し、状態テーブル(fba_inactive_listings)と差分を取る。
 *
 * - 新規（テーブルに無かったSKU）= 新たに在庫切れになったSKU → newlyDetected で返す
 * - 既存は last_seen_at を更新（first_detected_at は据え置き）
 * - 集合から消えたSKU（在庫復活）は削除（次に切れたら再び新規扱い）
 * - 初回（テーブルが空）は全件を基準として登録するだけで、新規扱いにはしない
 *
 * 注意: APIが0件を返した場合は異常の可能性があるため、テーブルを変更しない。
 */
export async function syncInactiveFbaSnapshot(
  now: Date = new Date()
): Promise<SnapshotSyncResult> {
  // 1. 現在の「停止中×FBA」を全件取得
  const listings = await searchListings({ onlyInactive: true, onlyFba: true });

  // 0件は同期失敗・一時障害の可能性。テーブルを巻き込まないよう何もしない
  if (listings.length === 0) {
    return { total: 0, isInitialSeed: false, newlyDetected: [], removed: 0 };
  }

  const currentSkus = listings.map((l) => l.sku);

  // 2. 既存スナップショットのSKU集合
  const existing = await db.fbaInactiveListing.findMany({ select: { sku: true } });
  const existingSkus = new Set(existing.map((e) => e.sku));

  // 3. 初回（空）なら基準作成のみ。以降は「既存に無いSKU」が新規
  const isInitialSeed = existingSkus.size === 0;
  const newly = isInitialSeed
    ? []
    : listings.filter((l) => !existingSkus.has(l.sku));

  // 4a. 新規をまとめて登録（first_detected_at = now）
  const toCreate = isInitialSeed ? listings : newly;
  if (toCreate.length > 0) {
    await db.fbaInactiveListing.createMany({
      data: toCreate.map((l) => ({
        sku: l.sku,
        asin: l.asin,
        itemName: l.itemName,
        firstDetectedAt: now,
        lastSeenAt: now,
      })),
      skipDuplicates: true,
    });
  }

  // 4b. 既存分の last_seen_at を更新（在庫切れ継続中の確認時刻）
  await db.fbaInactiveListing.updateMany({
    where: { sku: { in: currentSkus } },
    data: { lastSeenAt: now },
  });

  // 5. 現在集合から消えたSKU（在庫復活）を削除
  const removed = await db.fbaInactiveListing.deleteMany({
    where: { sku: { notIn: currentSkus } },
  });

  return {
    total: listings.length,
    isInitialSeed,
    newlyDetected: newly.map((l) => ({
      sku: l.sku,
      asin: l.asin,
      itemName: l.itemName,
    })),
    removed: removed.count,
  };
}
