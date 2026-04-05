import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/logiless/callback
 * Logiless OAuth2 コールバック — 認可コードをアクセストークンに交換してDBに保存
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "認可コードがありません" }, { status: 400 });
  }

  // アクセストークン取得
  const tokenRes = await fetch("https://app2.logiless.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: process.env.LOGILESS_CLIENT_ID!,
      client_secret: process.env.LOGILESS_CLIENT_SECRET!,
      redirect_uri: process.env.LOGILESS_REDIRECT_URI!,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error("[logiless/callback] token error:", text);
    return NextResponse.json(
      { error: "トークン取得に失敗しました", detail: text },
      { status: 500 }
    );
  }

  const data = await tokenRes.json();

  // DBに保存（upsert）
  await db.oAuthToken.upsert({
    where: { provider: "logiless" },
    create: {
      provider: "logiless",
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
    },
    update: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
    },
  });

  // 認可完了 → 在庫一覧に戻す
  return NextResponse.redirect(new URL("/inventory", req.url));
}
