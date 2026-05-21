/**
 * NDJSON ストリーミング共通ヘルパー
 *
 * sync 系 API が進捗イベントをリアルタイムで流すために使う。
 * クライアント側は `Accept: application/x-ndjson` を付けて呼ぶことで
 * ストリーミングモードを有効化できる（未指定なら通常の JSON レスポンス）。
 */

export type ProgressEvent =
  | { type: "phase"; label: string }
  | { type: "progress"; current: number; total?: number; label?: string }
  | { type: "done"; data: Record<string, unknown> }
  | { type: "error"; error: string; status?: number };

export type EmitFn = (event: ProgressEvent) => void;

export function wantsStream(req: Request): boolean {
  return req.headers.get("accept")?.includes("application/x-ndjson") ?? false;
}

export function ndjsonStream(
  run: (emit: EmitFn) => Promise<Record<string, unknown>>
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: ProgressEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        const data = await run(send);
        send({ type: "done", data });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send({ type: "error", error: message });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
