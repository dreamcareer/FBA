# コンポーネントルール

適用対象: `src/app/**/*.tsx`, `src/app/**/_components/**/*.tsx`

## Server / Client の使い分け

- デフォルトは Server Component（`"use client"` を書かない）
- インタラクション（onClick, useState, useEffect 等）が必要な場合のみ `"use client"` を付ける
- Client Component は最小限のスコープに分離する

## スタイリング

- Tailwind CSS のユーティリティクラスを使用
- カスタム CSS ファイルは作らない
- レスポンシブ対応は必要に応じて

## UIテキスト

- ユーザー向けテキストは日本語
- コンソールログやエラーメッセージは英語OK

## データフェッチ

- Server Component では直接 Prisma クエリまたは fetch を使う
- Client Component では `fetch('/api/...')` で API ルートを呼ぶ
- ローディング状態とエラー状態を適切に表示する
