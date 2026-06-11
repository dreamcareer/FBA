import { db } from "@/lib/db";
import type {
  LogilessArticle,
  LogilessArticleDetail,
  LogilessArticleMap,
  LogilessActualInventory,
  LogilessLogicalInventory,
  LogilessPagedResponse,
  LogilessSalesOrderRequest,
  LogilessSalesOrderResponse,
} from "./types";

const BASE_URL = process.env.LOGILESS_BASE_URL!;
const MERCHANT_ID = process.env.LOGILESS_MERCHANT_ID!;

function getBaseUrl(): string {
  return `${BASE_URL}/merchant/${MERCHANT_ID}`;
}

const REAUTH_MESSAGE =
  "Logiless 再認可が必要です。/api/logiless/authorize にアクセスしてください。";

/**
 * リフレッシュトークンで新しいアクセストークンを取得し、DBを更新する
 */
async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://app2.logiless.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.LOGILESS_CLIENT_ID!,
      client_secret: process.env.LOGILESS_CLIENT_SECRET!,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${REAUTH_MESSAGE} (refresh failed: ${res.status} — ${text})`);
  }

  const data = await res.json();

  await db.oAuthToken.update({
    where: { provider: "logiless" },
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
    },
  });

  return data.access_token;
}

/**
 * DBからアクセストークンを取得し、期限切れならリフレッシュする
 */
async function getAccessToken(): Promise<string> {
  const token = await db.oAuthToken.findUnique({
    where: { provider: "logiless" },
  });

  if (!token) {
    throw new Error(REAUTH_MESSAGE);
  }

  // 期限切れチェック（5分前にリフレッシュ）
  if (token.expiresAt && token.expiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
    if (!token.refreshToken) {
      throw new Error(REAUTH_MESSAGE);
    }
    return refreshAccessToken(token.refreshToken);
  }

  return token.accessToken;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  let accessToken = await getAccessToken();
  const url = `${getBaseUrl()}${path}`;
  let refreshedOnce = false;

  // リトライ付き（502/429対策）
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (res.status === 429 || res.status === 502 || res.status === 503) {
      const wait = (attempt + 1) * 3000; // 3s, 6s, 9s
      console.warn(`[Logiless] ${res.status} — retrying in ${wait}ms...`);
      await sleep(wait);
      continue;
    }

    // 401: アクセストークン失効 → refresh があれば1回だけ強制リフレッシュしてリトライ
    if (res.status === 401 && !refreshedOnce) {
      const token = await db.oAuthToken.findUnique({
        where: { provider: "logiless" },
      });
      if (!token?.refreshToken) {
        throw new Error(REAUTH_MESSAGE);
      }
      console.warn("[Logiless] 401 — forcing token refresh and retrying once...");
      accessToken = await refreshAccessToken(token.refreshToken);
      refreshedOnce = true;
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Logiless API error: ${res.status} ${res.statusText} — ${text}`
      );
    }

    return res.json() as Promise<T>;
  }

  throw new Error("Logiless API: max retries exceeded");
}

// ── 商品マスタ取得 ─────────────────────────────────────────

/**
 * 全商品マスタを取得（Single商品のみ、什器・備品除外）
 * 簡易版 — FNSKU・フリー項目なし
 *
 * onProgress: 各ページ取得後に (取得済み件数, ページ番号) で呼ばれる
 */
export async function fetchArticles(
  onProgress?: (current: number, page: number) => void
): Promise<LogilessArticle[]> {
  const all: LogilessArticle[] = [];
  let page = 1;

  while (true) {
    const res = await request<LogilessPagedResponse<LogilessArticle>>(
      `/articles?page=${page}&limit=100`
    );
    // Single商品のみ、2000...（什器・備品）除外
    const filtered = res.data.filter(
      (a) => a.article_type === "Single" && !a.code.startsWith("2000")
    );
    all.push(...filtered);
    onProgress?.(all.length, page);
    if (res.data.length < 100) break;
    page++;
  }

  return all;
}

/**
 * 商品詳細を1件取得（FNSKU、フリー項目、原価等を含む）
 * identification_code で検索すると全フィールドが返る
 */
export async function fetchArticleDetail(
  identificationCode: string
): Promise<LogilessArticleDetail | null> {
  const res = await request<LogilessPagedResponse<LogilessArticleDetail>>(
    `/articles?identification_code=${encodeURIComponent(identificationCode)}&limit=1`
  );
  return res.data[0] ?? null;
}

/**
 * 全商品の詳細を取得（FNSKU、フリー項目付き）
 * まず一覧で全codeを取得し、1件ずつ詳細を取得する
 * コールバックで進捗を通知可能
 */
export async function fetchAllArticleDetails(
  onProgress?: (current: number, total: number) => void
): Promise<LogilessArticleDetail[]> {
  // Step 1: 一覧APIで全商品のidentification_codeを取得
  const summaries = await fetchArticles();

  // Step 2: 1件ずつ詳細取得
  const details: LogilessArticleDetail[] = [];
  for (let i = 0; i < summaries.length; i++) {
    const code = summaries[i].identification_code;
    if (!code) continue;

    const detail = await fetchArticleDetail(code);
    if (detail) details.push(detail);

    if (onProgress && (i + 1) % 50 === 0) {
      onProgress(i + 1, summaries.length);
    }
  }

  return details;
}

// ── 在庫取得 ────────────────────────────────────────────

/**
 * 論理在庫サマリー（SKU別合計）を全件取得
 */
export async function fetchLogicalInventories(): Promise<LogilessLogicalInventory[]> {
  const all: LogilessLogicalInventory[] = [];
  let page = 1;

  while (true) {
    const res = await request<LogilessPagedResponse<LogilessLogicalInventory>>(
      `/logical_inventory_summaries?page=${page}&limit=100`
    );
    all.push(...res.data);
    if (res.data.length < 100) break;
    page++;
  }

  return all;
}

/**
 * 実在庫サマリー（ロット・期限別）を全件取得
 * layer=LotNumber でフィルタし、取得件数を大幅に削減
 */
export async function fetchActualInventories(
  skus?: string[],
  onProgress?: (current: number, page: number) => void
): Promise<LogilessActualInventory[]> {
  const all: LogilessActualInventory[] = [];
  let page = 1;

  const skuQuery = skus?.length
    ? `&article_codes=${encodeURIComponent(skus.join(","))}`
    : "";

  while (true) {
    const res = await request<LogilessPagedResponse<LogilessActualInventory>>(
      `/actual_inventory_summaries?aggregate_type=expiration_date&layer=LotNumber&page=${page}&limit=100${skuQuery}`
    );
    all.push(...res.data);
    onProgress?.(all.length, page);
    if (res.data.length < 100) break;
    page++;
  }

  return all;
}

// ── 受注登録 ────────────────────────────────────────────

/**
 * FBA出荷指示をロジレスに受注登録する
 * エンドポイントは POST /sales_orders/new（/sales_orders へのPOSTは405になる）
 * ボディは { sales_order: {...} } でラップする仕様
 */
export async function createSalesOrder(
  orderData: LogilessSalesOrderRequest
): Promise<LogilessSalesOrderResponse> {
  return request<LogilessSalesOrderResponse>("/sales_orders/new", {
    method: "POST",
    body: JSON.stringify({ sales_order: orderData }),
  });
}

/**
 * 商品対応表から店舗の出品コード（mapped_code）を取得する
 * 受注明細の article_code は「商品コード（店舗）」のため、
 * 商品マスタのcode（JAN）をそのまま使えず、商品対応表で変換が必要
 *
 * @param articleCode 商品マスタのcode（JAN）
 * @param storeId 店舗ID
 * @returns mapped_code（対応表に存在しない場合は null）
 */
export async function fetchMappedCode(
  articleCode: string,
  storeId: number
): Promise<string | null> {
  const res = await request<LogilessPagedResponse<LogilessArticleMap>>(
    `/article_maps?article_code=${encodeURIComponent(articleCode)}&store=${storeId}&limit=1`
  );
  return res.data[0]?.mapped_code ?? null;
}

/**
 * 受注のキャンセル（ロジレスの仕様では "reversal"）
 * clearsCode=true で同じ受注コード(STA番号)を再利用可能にする
 */
export async function cancelSalesOrder(
  orderId: number,
  clearsCode = true
): Promise<void> {
  await request(`/sales_orders/${orderId}/reversal`, {
    method: "POST",
    body: JSON.stringify({ clears_code: clearsCode }),
  });
}

/**
 * 受注詳細の取得
 */
export async function getSalesOrder(
  orderNo: string
): Promise<LogilessSalesOrderResponse | null> {
  try {
    const res = await request<LogilessPagedResponse<LogilessSalesOrderResponse>>(
      `/sales_orders?code=${encodeURIComponent(orderNo)}`
    );
    return res.data[0] ?? null;
  } catch {
    return null;
  }
}
