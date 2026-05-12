import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const token = await db.oAuthToken.findUnique({
  where: { provider: "logiless" },
});

if (!token) {
  console.log("No Logiless token found in DB.");
} else {
  const now = new Date();
  const expiresAt = token.expiresAt;
  const isExpired = expiresAt ? expiresAt < now : null;
  const minutesUntilExpiry = expiresAt
    ? Math.round((expiresAt.getTime() - now.getTime()) / 60000)
    : null;

  console.log("Logiless OAuth token state:");
  console.log("  provider:        ", token.provider);
  console.log("  accessToken:     ", token.accessToken ? `${token.accessToken.slice(0, 10)}... (len=${token.accessToken.length})` : "(none)");
  console.log("  refreshToken:    ", token.refreshToken ? `${token.refreshToken.slice(0, 10)}... (len=${token.refreshToken.length})` : "(none)");
  console.log("  expiresAt:       ", expiresAt ? expiresAt.toISOString() : "(null)");
  console.log("  now:             ", now.toISOString());
  console.log("  isExpired:       ", isExpired);
  console.log("  minutesUntilExp: ", minutesUntilExpiry);
  console.log("  createdAt:       ", token.createdAt.toISOString());
  console.log("  updatedAt:       ", token.updatedAt.toISOString());
}

await db.$disconnect();
