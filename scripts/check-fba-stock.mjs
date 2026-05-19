/**
 * FBA在庫の同期結果を DB から確認
 * 実行: node scripts/check-fba-stock.mjs
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const totalProducts = await db.product.count();
const synced = await db.product.count({ where: { fbaStockSyncedAt: { not: null } } });
const withStock = await db.product.count({ where: { fbaStockQuantity: { gt: 0 } } });

console.log("=== products テーブルの FBA 在庫状況 ===");
console.log("  全商品:           ", totalProducts);
console.log("  FBA同期済み:      ", synced);
console.log("  FBA在庫>0:        ", withStock);

const top10 = await db.product.findMany({
  where: { fbaStockQuantity: { gt: 0 } },
  orderBy: { fbaStockQuantity: "desc" },
  take: 10,
  select: { sku: true, name: true, fbaStockQuantity: true, fbaStockSyncedAt: true },
});

console.log("\n=== 在庫上位10件 ===");
for (const p of top10) {
  console.log(`  ${p.sku.padEnd(20)}  qty=${String(p.fbaStockQuantity).padStart(4)}  ${p.name?.slice(0, 50) ?? ""}`);
}

const recentSync = await db.product.findFirst({
  where: { fbaStockSyncedAt: { not: null } },
  orderBy: { fbaStockSyncedAt: "desc" },
  select: { fbaStockSyncedAt: true },
});

console.log("\n  最終同期:         ", recentSync?.fbaStockSyncedAt?.toISOString());

await db.$disconnect();
