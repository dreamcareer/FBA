import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/dropbox/authorize
 * Dropbox OAuth2 認可画面にリダイレクト
 * token_access_type=offline でリフレッシュトークンを取得する
 */
export async function GET(req: NextRequest) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.DROPBOX_APP_KEY!,
    redirect_uri: process.env.DROPBOX_REDIRECT_URI!,
    token_access_type: "offline",
  });

  const url = `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
  return NextResponse.redirect(url, { status: 302 });
}
