/**
 * SP-API 接続テストスクリプト
 *
 * 実行: node --env-file=.env scripts/test-sp-api.mjs
 *
 * 内容:
 *   1. LWA で refresh_token から access_token を取得
 *   2. SP-API の sellers/v1/marketplaceParticipations を呼んで疎通確認
 */

const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";
// 日本マーケットプレイス（A1VC38T7YXB528）は Far East エンドポイント
const SP_API_ENDPOINT = "https://sellingpartnerapi-fe.amazon.com";

const {
  SP_API_CLIENT_ID,
  SP_API_CLIENT_SECRET,
  SP_API_REFRESH_TOKEN,
  SP_API_MARKETPLACE_ID,
} = process.env;

function mask(value) {
  if (!value) return "(none)";
  if (value.length <= 12) return `${value.slice(0, 4)}...`;
  return `${value.slice(0, 8)}...${value.slice(-4)} (len=${value.length})`;
}

console.log("=== Env check ===");
console.log("  SP_API_CLIENT_ID:     ", mask(SP_API_CLIENT_ID));
console.log("  SP_API_CLIENT_SECRET: ", mask(SP_API_CLIENT_SECRET));
console.log("  SP_API_REFRESH_TOKEN: ", mask(SP_API_REFRESH_TOKEN));
console.log("  SP_API_MARKETPLACE_ID:", SP_API_MARKETPLACE_ID ?? "(none)");

if (!SP_API_CLIENT_ID || !SP_API_CLIENT_SECRET || !SP_API_REFRESH_TOKEN) {
  console.error("\n❌ 必要な環境変数が不足しています");
  process.exit(1);
}

// ── Step 1: LWA で access_token を取得 ──────────────────────────────
console.log("\n=== Step 1: LWA access token を取得 ===");

const lwaBody = new URLSearchParams({
  grant_type: "refresh_token",
  refresh_token: SP_API_REFRESH_TOKEN,
  client_id: SP_API_CLIENT_ID,
  client_secret: SP_API_CLIENT_SECRET,
});

const lwaRes = await fetch(LWA_TOKEN_URL, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: lwaBody.toString(),
});

const lwaText = await lwaRes.text();
let lwaJson;
try {
  lwaJson = JSON.parse(lwaText);
} catch {
  lwaJson = null;
}

console.log("  status:", lwaRes.status, lwaRes.statusText);

if (!lwaRes.ok) {
  console.error("❌ LWA トークン取得失敗");
  console.error("  response:", lwaText);
  process.exit(1);
}

const accessToken = lwaJson.access_token;
console.log("✅ LWA トークン取得成功");
console.log("  access_token:", mask(accessToken));
console.log("  token_type:  ", lwaJson.token_type);
console.log("  expires_in:  ", lwaJson.expires_in, "秒");

// ── Step 2: SP-API で sellers/v1/marketplaceParticipations を呼ぶ ──
console.log("\n=== Step 2: SP-API 呼び出し (sellers/v1/marketplaceParticipations) ===");

const spRes = await fetch(`${SP_API_ENDPOINT}/sellers/v1/marketplaceParticipations`, {
  method: "GET",
  headers: {
    "x-amz-access-token": accessToken,
    "Accept": "application/json",
  },
});

const spText = await spRes.text();
let spJson;
try {
  spJson = JSON.parse(spText);
} catch {
  spJson = null;
}

console.log("  status:", spRes.status, spRes.statusText);

if (!spRes.ok) {
  console.error("❌ SP-API 呼び出し失敗");
  console.error("  response:", spText);
  process.exit(1);
}

console.log("✅ SP-API 呼び出し成功");
console.log("\n--- レスポンス ---");
console.log(JSON.stringify(spJson, null, 2));

// マーケットプレイス確認
const participations = spJson?.payload ?? [];
console.log(`\n参加マーケットプレイス: ${participations.length} 件`);
for (const p of participations) {
  const m = p.marketplace;
  console.log(`  - ${m?.name} (${m?.id}) / countryCode=${m?.countryCode} / currency=${m?.defaultCurrencyCode}`);
}

const jpFound = participations.some((p) => p.marketplace?.id === SP_API_MARKETPLACE_ID);
if (jpFound) {
  console.log(`\n✅ 設定の MARKETPLACE_ID (${SP_API_MARKETPLACE_ID}) が参加マーケットプレイスに含まれています`);
} else {
  console.warn(`\n⚠️  設定の MARKETPLACE_ID (${SP_API_MARKETPLACE_ID}) が参加マーケットプレイスに見当たりません`);
}
