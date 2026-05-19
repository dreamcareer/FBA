/**
 * Amazon SP-API クライアント
 *
 * 認証は LWA (Login with Amazon) refresh_token → access_token のフロー。
 * - refresh_token は env に保持（セルフ認可で発行された長期トークン）
 * - access_token は OAuthToken テーブルに provider="sp-api" でキャッシュ
 * - 期限5分前を切ったら自動リフレッシュ、401 を踏んだら1回だけ強制リフレッシュ
 */

import { db } from "@/lib/db";

const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";
// JP マーケットプレイス (A1VC38T7YXB528) は Far East エンドポイント
const SP_API_ENDPOINT = "https://sellingpartnerapi-fe.amazon.com";

const PROVIDER = "sp-api";
const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 期限切れ判定のバッファ（5分）

const REAUTH_MESSAGE =
  "SP-API: refresh_token が無効です。Seller Central でアプリを再認可し、SP_API_REFRESH_TOKEN を更新してください。";

class NotImplementedError extends Error {
  constructor(method: string) {
    super(`SP-API: ${method} は Phase 2 で実装予定です。`);
    this.name = "NotImplementedError";
  }
}

// ── 認証 ─────────────────────────────────────────────────

/**
 * env の refresh_token を使って LWA で access_token を取得し、DB にキャッシュする
 */
async function refreshAccessToken(): Promise<{ accessToken: string; expiresAt: Date }> {
  const refreshToken = process.env.SP_API_REFRESH_TOKEN;
  const clientId = process.env.SP_API_CLIENT_ID;
  const clientSecret = process.env.SP_API_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error(
      "SP-API: 環境変数 SP_API_REFRESH_TOKEN / SP_API_CLIENT_ID / SP_API_CLIENT_SECRET が設定されていません"
    );
  }

  const res = await fetch(LWA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 400 && text.includes("invalid_grant")) {
      throw new Error(`${REAUTH_MESSAGE} (LWA: ${res.status} — ${text})`);
    }
    throw new Error(`SP-API LWA refresh failed: ${res.status} — ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
  };

  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  await db.oAuthToken.upsert({
    where: { provider: PROVIDER },
    update: {
      accessToken: data.access_token,
      expiresAt,
    },
    create: {
      provider: PROVIDER,
      accessToken: data.access_token,
      expiresAt,
    },
  });

  return { accessToken: data.access_token, expiresAt };
}

/**
 * DB キャッシュからアクセストークンを取得。期限切れ間近ならリフレッシュする。
 */
export async function getAccessToken(): Promise<string> {
  const token = await db.oAuthToken.findUnique({
    where: { provider: PROVIDER },
  });

  if (
    token?.accessToken &&
    token.expiresAt &&
    token.expiresAt.getTime() > Date.now() + EXPIRY_BUFFER_MS
  ) {
    return token.accessToken;
  }

  const fresh = await refreshAccessToken();
  return fresh.accessToken;
}

/**
 * 現在キャッシュされているトークンの状態を返す（デバッグ用）
 */
export async function getTokenStatus(): Promise<{
  hasCache: boolean;
  expiresAt: Date | null;
  isExpiringSoon: boolean;
  secondsUntilExpiry: number | null;
}> {
  const token = await db.oAuthToken.findUnique({
    where: { provider: PROVIDER },
  });

  if (!token?.expiresAt) {
    return { hasCache: false, expiresAt: null, isExpiringSoon: true, secondsUntilExpiry: null };
  }

  const msUntilExpiry = token.expiresAt.getTime() - Date.now();
  return {
    hasCache: true,
    expiresAt: token.expiresAt,
    isExpiringSoon: msUntilExpiry <= EXPIRY_BUFFER_MS,
    secondsUntilExpiry: Math.floor(msUntilExpiry / 1000),
  };
}

// ── リクエストヘルパー ───────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let accessToken = await getAccessToken();
  let refreshedOnce = false;

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${SP_API_ENDPOINT}${path}`, {
      ...options,
      headers: {
        "x-amz-access-token": accessToken,
        Accept: "application/json",
        ...options?.headers,
      },
    });

    // レート制限 / サーバー一時不全 → リトライ
    if (res.status === 429 || res.status === 503) {
      const wait = (attempt + 1) * 3000;
      console.warn(`[SP-API] ${res.status} — retrying in ${wait}ms...`);
      await sleep(wait);
      continue;
    }

    // 401: アクセストークン失効 → 1回だけ強制リフレッシュしてリトライ
    if (res.status === 401 && !refreshedOnce) {
      console.warn("[SP-API] 401 — forcing token refresh and retrying once...");
      const fresh = await refreshAccessToken();
      accessToken = fresh.accessToken;
      refreshedOnce = true;
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`SP-API error: ${res.status} ${res.statusText} — ${text}`);
    }

    return (await res.json()) as T;
  }

  throw new Error("SP-API: max retries exceeded");
}

// ── 動作確認用 ────────────────────────────────────────────

export interface MarketplaceParticipation {
  marketplace: {
    id: string;
    countryCode: string;
    name: string;
    defaultCurrencyCode: string;
    defaultLanguageCode: string;
    domainName: string;
  };
  storeName: string;
  participation: {
    isParticipating: boolean;
    hasSuspendedListings: boolean;
  };
}

/**
 * 参加マーケットプレイス一覧を取得（疎通確認用、課金なし）
 */
export async function fetchMarketplaceParticipations(): Promise<MarketplaceParticipation[]> {
  const res = await request<{ payload: MarketplaceParticipation[] }>(
    "/sellers/v1/marketplaceParticipations"
  );
  return res.payload;
}

// ── FBA在庫 ──────────────────────────────────────────────

export interface FbaInventoryItem {
  sellerSku: string;
  asin: string | null;
  fnsku: string | null;
  productName: string | null;
  condition: string | null;
  totalQuantity: number;       // 全在庫合計（fulfillable + inbound + reserved + unfulfillable + researching）
  fulfillableQuantity: number; // 出荷可能
  inboundWorkingQuantity: number;   // 納品準備中
  inboundShippedQuantity: number;   // 納品輸送中
  inboundReceivingQuantity: number; // 倉庫で受領処理中
  reservedQuantity: number;
  unfulfillableQuantity: number;
  researchingQuantity: number;
}

interface RawInventorySummary {
  asin?: string;
  fnSku?: string;
  sellerSku?: string;
  condition?: string;
  productName?: string;
  totalQuantity?: number;
  inventoryDetails?: {
    fulfillableQuantity?: number;
    inboundWorkingQuantity?: number;
    inboundShippedQuantity?: number;
    inboundReceivingQuantity?: number;
    reservedQuantity?: { totalReservedQuantity?: number };
    unfulfillableQuantity?: { totalUnfulfillableQuantity?: number };
    researchingQuantity?: { totalResearchingQuantity?: number };
  };
}

interface InventorySummariesResponse {
  payload?: { inventorySummaries?: RawInventorySummary[] };
  pagination?: { nextToken?: string };
}

/**
 * FBA在庫一覧を全件取得する（ページネーション込み）
 */
export async function fetchFbaInventory(
  onProgress?: (current: number) => void
): Promise<FbaInventoryItem[]> {
  const marketplaceId = process.env.SP_API_MARKETPLACE_ID;
  if (!marketplaceId) {
    throw new Error("SP-API: SP_API_MARKETPLACE_ID が設定されていません");
  }

  const all: FbaInventoryItem[] = [];
  let nextToken: string | undefined;

  do {
    const params = new URLSearchParams({
      granularityType: "Marketplace",
      granularityId: marketplaceId,
      marketplaceIds: marketplaceId,
      details: "true",
    });
    if (nextToken) params.set("nextToken", nextToken);

    const res: InventorySummariesResponse = await request(
      `/fba/inventory/v1/summaries?${params.toString()}`
    );

    const summaries = res.payload?.inventorySummaries ?? [];
    for (const s of summaries) {
      if (!s.sellerSku) continue;
      all.push({
        sellerSku: s.sellerSku,
        asin: s.asin ?? null,
        fnsku: s.fnSku ?? null,
        productName: s.productName ?? null,
        condition: s.condition ?? null,
        totalQuantity: s.totalQuantity ?? 0,
        fulfillableQuantity: s.inventoryDetails?.fulfillableQuantity ?? 0,
        inboundWorkingQuantity: s.inventoryDetails?.inboundWorkingQuantity ?? 0,
        inboundShippedQuantity: s.inventoryDetails?.inboundShippedQuantity ?? 0,
        inboundReceivingQuantity: s.inventoryDetails?.inboundReceivingQuantity ?? 0,
        reservedQuantity:
          s.inventoryDetails?.reservedQuantity?.totalReservedQuantity ?? 0,
        unfulfillableQuantity:
          s.inventoryDetails?.unfulfillableQuantity?.totalUnfulfillableQuantity ?? 0,
        researchingQuantity:
          s.inventoryDetails?.researchingQuantity?.totalResearchingQuantity ?? 0,
      });
    }

    nextToken = res.pagination?.nextToken;
    if (onProgress) onProgress(all.length);
  } while (nextToken);

  return all;
}

export async function fetchFbaUpperLimits(): Promise<
  { sku: string; upperLimit: number }[]
> {
  throw new NotImplementedError("fetchFbaUpperLimits");
}

export interface FbaShipmentPlan {
  shipmentId: string;
  shipmentName: string;
  items: { sku: string; quantity: number }[];
}

export async function createInboundShipmentPlan(_items: {
  sku: string;
  quantity: number;
  expiryDate?: string;
}[]): Promise<FbaShipmentPlan> {
  throw new NotImplementedError("createInboundShipmentPlan");
}

export async function getFnskuLabels(
  _shipmentId: string
): Promise<{ sku: string; pdfUrl: string }[]> {
  throw new NotImplementedError("getFnskuLabels");
}

export async function fetchSalesData(
  _startDate: string,
  _endDate: string
): Promise<{ sku: string; units: number }[]> {
  throw new NotImplementedError("fetchSalesData");
}
