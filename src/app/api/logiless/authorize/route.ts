import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/logiless/authorize
 * Logiless OAuth2 認可画面にリダイレクト
 */
export async function GET(req: NextRequest) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LOGILESS_CLIENT_ID!,
    redirect_uri: process.env.LOGILESS_REDIRECT_URI!,
  });

  const url = `https://app2.logiless.com/oauth/v2/authorize?${params.toString()}`;
  return NextResponse.redirect(url, { status: 302 });
}
