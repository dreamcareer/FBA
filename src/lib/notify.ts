// ── Discord / Chatwork 通知ユーティリティ ─────────────────

export interface DeliveryNotification {
  workDate: string;           // 作業日 (例: "1/6(月)")
  shipmentDate: string;       // 出荷日 (例: "水曜日分")
  productType: "度あり" | "度なし";
  totalQuantity: number;
  staNumber: string;          // STA番号 (例: "STA20260106-1")
}

export interface WeeklySummaryNotification {
  weekRange: string;          // 例: "12/30(月) - 1/3(金)"
  completed: number;          // 出荷完了
  inProgress: number;         // 作業中
  waiting: number;            // 作業開始待ち
}

// ── Discord ───────────────────────────────────────────────

async function sendDiscord(payload: Record<string, unknown>): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[notify] DISCORD_WEBHOOK_URL が未設定です");
    return;
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error("[notify] Discord送信失敗:", res.status, await res.text());
  }
}

export async function notifyDeliveryPlanCreated(
  data: DeliveryNotification
): Promise<void> {
  await sendDiscord({
    content: null,
    embeds: [
      {
        title: "納品プラン作成完了",
        color: 0x5865f2,
        fields: [
          { name: "作業日", value: data.workDate, inline: true },
          { name: "出荷予定", value: data.shipmentDate, inline: true },
          { name: "STA番号", value: data.staNumber, inline: true },
          { name: "種別", value: data.productType, inline: true },
          { name: "合計", value: `${data.totalQuantity}点`, inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

// ── Chatwork ──────────────────────────────────────────────

async function sendChatwork(roomId: string, message: string): Promise<void> {
  const apiToken = process.env.CHATWORK_API_TOKEN;
  if (!apiToken) {
    console.warn("[notify] CHATWORK_API_TOKEN が未設定です");
    return;
  }

  const res = await fetch(
    `https://api.chatwork.com/v2/rooms/${roomId}/messages`,
    {
      method: "POST",
      headers: {
        "X-ChatWorkToken": apiToken,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ body: message }),
    }
  );

  if (!res.ok) {
    console.error("[notify] Chatwork送信失敗:", res.status, await res.text());
  }
}

export async function notifyDailyReport(params: {
  hasDelivery: boolean;
  shipmentDay?: string;
  planCount?: number;
  totalQuantity?: number;
  switchedSkuCount: number;
  operatorName: string;
}): Promise<void> {
  const roomId = process.env.CHATWORK_ROOM_ID!;

  let message = "本日の作業報告です。\n\n";

  if (params.hasDelivery) {
    message +=
      `・納品プランの作成\n` +
      `${params.shipmentDay}出荷分　${params.planCount}件・${params.totalQuantity}点\n` +
      `ご確認よろしくお願いします。\n\n`;
  }

  message +=
    `・FBA順位記載(${params.operatorName})\n` +
    `・出品者出荷切替＆在庫数記載(切り替え${params.switchedSkuCount}SKU)`;

  await sendChatwork(roomId, message);
}

export async function notifyWeeklySummary(
  data: WeeklySummaryNotification
): Promise<void> {
  const roomId = process.env.CHATWORK_ROOM_ID!;
  const message =
    `今週のFBA業務の進捗です。\n` +
    `${data.weekRange}\n\n` +
    `出荷完了（黒）：${data.completed}点\n` +
    `作業中（オレンジ）：${data.inProgress}点\n` +
    `作業開始待ち（白）：${data.waiting}点`;

  await sendChatwork(roomId, message);
}
