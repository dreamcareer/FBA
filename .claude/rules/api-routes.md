# API Routes ルール

適用対象: `src/app/api/**/*.ts`

## 必須パターン

- レスポンスは `ApiResponse<T>` 型（`src/types/index.ts`）で統一する
- エラーは try-catch で捕捉し、適切な HTTP ステータスコードを返す
- Prisma は `src/lib/db.ts` の `prisma` シングルトンを使う（直接 new しない）
- 認証が必要なエンドポイントは Supabase セッションを検証する

## レスポンス形式

```typescript
// 成功
return NextResponse.json({ success: true, data: result });

// エラー
return NextResponse.json({ success: false, error: "メッセージ" }, { status: 400 });
```

## ロジレスAPI呼び出し

- `src/lib/logiless/client.ts` の関数を使う
- 直接 fetch でロジレスAPIを叩かない
- レート制限（429）は自動リトライされる

## バリデーション

- リクエストボディは Zod でバリデーションする
- クエリパラメータも型安全に処理する
