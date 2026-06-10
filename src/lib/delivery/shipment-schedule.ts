/**
 * 手順書の週次スケジュール: 作業曜日ごとの納品プラン作成ルール
 *
 * | 作業日 | 出荷分                                       | 種別   | 目標点数 |
 * |--------|----------------------------------------------|--------|----------|
 * | 月曜   | 水曜日出荷分                                 | 度あり | 500      |
 * | 火曜   | 木曜日出荷分                                 | 度あり | 500      |
 * | 水曜   | 金曜日出荷分                                 | 度あり | 500      |
 * | 木曜   | 翌週火曜日出荷分（翌週月曜が祝日なら水曜）   | 度なし | 1000     |
 * | 金土日 | プラン作成なし                               | —      | —        |
 */

import { addDays } from "date-fns";

export interface WorkDaySchedule {
  workDayLabel: string; // 例: "水曜日"
  shipmentDayLabel: string; // 例: "金曜日" / "翌週火曜日"
  shipmentDate: Date; // 作業日から計算した出荷予定日
  productType: "WITH_PRESCRIPTION" | "WITHOUT_PRESCRIPTION";
  productTypeLabel: "度あり" | "度なし";
  targetTotal: number;
  note?: string; // 祝日等の注意書き
}

const JP_DAY_LABELS = [
  "日曜日",
  "月曜日",
  "火曜日",
  "水曜日",
  "木曜日",
  "金曜日",
  "土曜日",
] as const;

/**
 * 作業日（プラン作成日）から出荷スケジュールを返す。
 * 金・土・日はプラン作成日ではないため null。
 */
export function getShipmentSchedule(workDate: Date): WorkDaySchedule | null {
  const day = workDate.getDay();
  const workDayLabel = JP_DAY_LABELS[day];

  switch (day) {
    case 1: // 月 → 水曜出荷
    case 2: // 火 → 木曜出荷
    case 3: // 水 → 金曜出荷
      return {
        workDayLabel,
        shipmentDayLabel: JP_DAY_LABELS[day + 2],
        shipmentDate: addDays(workDate, 2),
        productType: "WITH_PRESCRIPTION",
        productTypeLabel: "度あり",
        targetTotal: 500,
      };
    case 4: // 木 → 翌週火曜出荷（度なし）
      return {
        workDayLabel,
        shipmentDayLabel: "翌週火曜日",
        shipmentDate: addDays(workDate, 5),
        productType: "WITHOUT_PRESCRIPTION",
        productTypeLabel: "度なし",
        targetTotal: 1000,
        note: "翌週月曜日が祝日の場合は翌週水曜日出荷分",
      };
    default: // 金土日はプラン作成日ではない
      return null;
  }
}
