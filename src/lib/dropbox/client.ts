import { db } from "@/lib/db";

const REAUTH_MESSAGE =
  "Dropbox 再認可が必要です。/api/dropbox/authorize にアクセスしてください。";

/**
 * リフレッシュトークンで新しいアクセストークンを取得し、DBを更新する
 * Dropboxのリフレッシュトークンは無期限・使い回し（レスポンスに新しいrefresh_tokenは含まれない）
 */
async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.DROPBOX_APP_KEY!,
      client_secret: process.env.DROPBOX_APP_SECRET!,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${REAUTH_MESSAGE} (refresh failed: ${res.status} — ${text})`);
  }

  const data = await res.json();

  await db.oAuthToken.update({
    where: { provider: "dropbox" },
    data: {
      accessToken: data.access_token,
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
    where: { provider: "dropbox" },
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

/**
 * Dropbox-API-Arg ヘッダはASCII限定のため、非ASCII文字（日本語パス等）を \uXXXX にエスケープする
 */
function toApiArg(arg: unknown): string {
  return JSON.stringify(arg).replace(
    /[\u007f-\uffff]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")
  );
}

/**
 * Dropboxにファイルをアップロードする（150MB以下の単発アップロード）
 *
 * @param path    Dropbox上の保存先フルパス（例: "/納品プラン/STA20260407-1.csv"）
 * @param content ファイル内容
 * @returns アップロード結果（path_display 等）
 */
export async function uploadFile(
  path: string,
  content: string | Uint8Array<ArrayBuffer>
): Promise<{ path_display: string; id: string }> {
  let accessToken = await getAccessToken();
  let refreshedOnce = false;

  // リトライ付き（429/5xx対策）
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Arg": toApiArg({
          path,
          mode: "overwrite",
          autorename: false,
          mute: false,
        }),
      },
      body: content,
    });

    if (res.status === 429 || res.status === 502 || res.status === 503) {
      const wait = (attempt + 1) * 3000; // 3s, 6s, 9s
      console.warn(`[Dropbox] ${res.status} — retrying in ${wait}ms...`);
      await sleep(wait);
      continue;
    }

    // 401: アクセストークン失効 → refresh があれば1回だけ強制リフレッシュしてリトライ
    if (res.status === 401 && !refreshedOnce) {
      const token = await db.oAuthToken.findUnique({
        where: { provider: "dropbox" },
      });
      if (!token?.refreshToken) {
        throw new Error(REAUTH_MESSAGE);
      }
      console.warn("[Dropbox] 401 — forcing token refresh and retrying once...");
      accessToken = await refreshAccessToken(token.refreshToken);
      refreshedOnce = true;
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Dropbox API error: ${res.status} ${res.statusText} — ${text}`);
    }

    return res.json();
  }

  throw new Error("Dropbox API: max retries exceeded");
}
