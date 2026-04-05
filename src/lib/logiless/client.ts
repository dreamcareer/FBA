import { db } from "@/lib/db";
import type {
  LogilessArticle,
  LogilessArticleDetail,
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

/**
 * DBからアクセストークンを取得し、期限切れならリフレッシュする
 */
async function getAccessToken(): Promise<string> {
  const token = await db.oAuthToken.findUnique({
    where: { provider: "logiless" },
  });

  if (!token) {
    throw new Error(
      "Logiless未認可です。/api/logiless/authorize にアクセスしてOAuth認証してください。"
    );
  }

  // 期限切れチェック（5分前にリフレッシュ）
  if (token.expiresAt && token.expiresAt < new Date(Date.now() + 5 * 60 * 1000)) {
    if (!token.refreshToken) {
      throw new Error("リフレッシュトークンがありません。再認証してください。");
    }

    const res = await fetch("https://app2.logiless.com/oauth/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
        client_id: process.env.LOGILESS_CLIENT_ID!,
        client_secret: process.env.LOGILESS_CLIENT_SECRET!,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`トークンリフレッシュ失敗: ${res.status} — ${text}`);
    }

    const data = await res.json();

    await db.oAuthToken.update({
      where: { provider: "logiless" },
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? token.refreshToken,
        expiresAt: data.expires_in
          ? new Date(Date.now() + data.expires_in * 1000)
          : null,
      },
    });

    return data.access_token;
  }

  return token.accessToken;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const accessToken = await getAccessToken();
  const url = `${getBaseUrl()}${path}`;

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
 */
export async function fetchArticles(): Promise<LogilessArticle[]> {
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
 */
export async function fetchActualInventories(
  skus?: string[]
): Promise<LogilessActualInventory[]> {
  const all: LogilessActualInventory[] = [];
  let page = 1;

  const skuQuery = skus?.length
    ? `&article_codes=${encodeURIComponent(skus.join(","))}`
    : "";

  while (true) {
    const res = await request<LogilessPagedResponse<LogilessActualInventory>>(
      `/actual_inventory_summaries?aggregate_type=expiration_date&page=${page}&limit=100${skuQuery}`
    );
    all.push(...res.data);
    if (res.data.length < 100) break;
    page++;
  }

  return all;
}

// ── 受注登録 ────────────────────────────────────────────

/**
 * FBA出荷指示をロジレスに受注登録する
 */
export async function createSalesOrder(
  orderData: LogilessSalesOrderRequest
): Promise<LogilessSalesOrderResponse> {
  return request<LogilessSalesOrderResponse>("/sales_orders", {
    method: "POST",
    body: JSON.stringify(orderData),
  });
}

/**
 * 受注のキャンセル
 */
export async function cancelSalesOrder(
  orderId: number,
  reuseOrderNo = true
): Promise<void> {
  await request(`/sales_orders/${orderId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reuse_order_no: reuseOrderNo }),
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
      `/sales_orders?order_no=${encodeURIComponent(orderNo)}`
    );
    return res.data[0] ?? null;
  } catch {
    return null;
  }
}
