import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const p = await db.product.findFirst({
  where: { fnsku: "X000ODH08X" },
  select: { sku: true, fnsku: true, name: true, fbaStockQuantity: true, fbaStockSyncedAt: true },
});
console.log(p);

await db.$disconnect();
