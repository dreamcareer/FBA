/**
 * SP-API FBA Inventory 取得テスト
 *
 * 実行: node --env-file=.env scripts/test-fba-inventory.mjs
 *
 * エンドポイント: /fba/inventory/v1/summaries
 * 必須クエリ: granularityType=Marketplace, granularityId=<MARKETPLACE_ID>, marketplaceIds=<MARKETPLACE_ID>
 */

const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";
const SP_API_ENDPOINT = "https://sellingpartnerapi-fe.amazon.com";

const {
  SP_API_CLIENT_ID,
  SP_API_CLIENT_SECRET,
  SP_API_REFRESH_TOKEN,
  SP_API_MARKETPLACE_ID,
} = process.env;

// ── 1) LWA access_token を取得 ──────────────────────────
const lwaRes = await fetch(LWA_TOKEN_URL, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: SP_API_REFRESH_TOKEN,
    client_id: SP_API_CLIENT_ID,
    client_secret: SP_API_CLIENT_SECRET,
  }).toString(),
});

if (!lwaRes.ok) {
  console.error("LWA 失敗:", lwaRes.status, await lwaRes.text());
  process.exit(1);
}

const { access_token } = await lwaRes.json();
console.log("✅ access_token 取得");

// ── 2) FBA Inventory Summaries を取得 ───────────────────
console.log("\n=== /fba/inventory/v1/summaries ===");

async function fetchPage(nextToken = null) {
  const params = new URLSearchParams({
    granularityType: "Marketplace",
    granularityId: SP_API_MARKETPLACE_ID,
    marketplaceIds: SP_API_MARKETPLACE_ID,
    details: "true",
  });
  if (nextToken) params.set("nextToken", nextToken);

  const url = `${SP_API_ENDPOINT}/fba/inventory/v1/summaries?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "x-amz-access-token": access_token,
      Accept: "application/json",
    },
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }

  return { status: res.status, statusText: res.statusText, json, raw: text };
}

const first = await fetchPage();
console.log("  status:", first.status, first.statusText);

if (first.status !== 200) {
  console.error("❌ 失敗");
  console.error("  body:", first.raw);
  process.exit(1);
}

const summaries = first.json?.payload?.inventorySummaries ?? [];
const nextToken = first.json?.pagination?.nextToken ?? null;

console.log(`✅ 取得成功 (${summaries.length} 件 / nextToken=${nextToken ? "あり" : "なし"})`);

// 先頭5件をプレビュー
console.log("\n--- 先頭5件 ---");
for (const s of summaries.slice(0, 5)) {
  console.log({
    asin: s.asin,
    fnsku: s.fnSku,
    sellerSku: s.sellerSku,
    condition: s.condition,
    productName: s.productName,
    totalQty: s.totalQuantity,
    inboundWorking: s.inventoryDetails?.inboundWorkingQuantity,
    inboundShipped: s.inventoryDetails?.inboundShippedQuantity,
    inboundReceiving: s.inventoryDetails?.inboundReceivingQuantity,
    fulfillable: s.inventoryDetails?.fulfillableQuantity,
    unfulfillable: s.inventoryDetails?.unfulfillableQuantity?.totalUnfulfillableQuantity,
    reserved: s.inventoryDetails?.reservedQuantity?.totalReservedQuantity,
    researching: s.inventoryDetails?.researchingQuantity?.totalResearchingQuantity,
  });
}

// 全ページ取得して件数だけカウント
if (nextToken) {
  console.log("\n--- 全ページ取得 ---");
  let token = nextToken;
  let total = summaries.length;
  let page = 1;
  while (token) {
    page++;
    const res = await fetchPage(token);
    if (res.status === 429) {
      console.warn("  429 — 1秒待機");
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    if (res.status !== 200) {
      console.error("  page", page, "失敗:", res.status, res.raw);
      break;
    }
    const items = res.json?.payload?.inventorySummaries ?? [];
    total += items.length;
    token = res.json?.pagination?.nextToken ?? null;
    console.log(`  page ${page}: +${items.length} 件 (累計 ${total})`);
  }
  console.log(`\n✅ 全 ${total} 件取得`);
} else {
  console.log("\n✅ ページネーションなし、全件取得済み");
}
