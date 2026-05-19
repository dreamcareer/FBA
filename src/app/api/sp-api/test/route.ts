import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  fetchMarketplaceParticipations,
  getAccessToken,
  getTokenStatus,
} from "@/lib/sp-api/client";

/**
 * GET /api/sp-api/test
 * SP-API のトークンキャッシュ動作と疎通を確認するデバッグエンドポイント
 *
 * - 呼び出し前後でキャッシュ状態を比較（2回目は新規 LWA リクエストが走らないこと）
 * - 実際に sellers/v1/marketplaceParticipations を呼んで疎通確認
 *
 * 認証: CRON_SECRET (Bearer) または Supabase セッション
 */
export async function GET(req: NextRequest) {
  // 認証チェック
  const authHeader = req.headers.get("authorization");
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isCron) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll() {},
        },
      }
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const statusBefore = await getTokenStatus();

    const t1 = Date.now();
    const token1 = await getAccessToken();
    const elapsed1 = Date.now() - t1;

    const t2 = Date.now();
    const token2 = await getAccessToken();
    const elapsed2 = Date.now() - t2;

    const statusAfter = await getTokenStatus();

    const participations = await fetchMarketplaceParticipations();

    return NextResponse.json({
      tokenCache: {
        before: statusBefore,
        after: statusAfter,
        firstCall: {
          elapsedMs: elapsed1,
          tokenPrefix: token1.slice(0, 12),
          tokenLength: token1.length,
        },
        secondCall: {
          elapsedMs: elapsed2,
          tokenPrefix: token2.slice(0, 12),
          sameAsFirst: token1 === token2,
        },
      },
      marketplaceParticipations: participations.map((p) => ({
        id: p.marketplace.id,
        name: p.marketplace.name,
        countryCode: p.marketplace.countryCode,
        storeName: p.storeName,
        isParticipating: p.participation.isParticipating,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[SP-API test]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
