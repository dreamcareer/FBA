/**
 * FBA上限指定CSVをパースする。
 *
 * フォーマット（2列）:
 *   SKU,上限指定
 *   例: 1d10eb750,20
 *
 * 上限指定の値は数値（FBA上限）のほか、空欄や「終売」「できるだけ納品」等の
 * テキストが入る場合がある。
 *
 * 文字コードはShift-JISが標準（UTF-8 BOM付きにもフォールバック対応）。
 */

export type ParsedCsv = {
  headers: string[];
  rows: string[][];
};

/** バイナリを文字列にデコード（UTF-8 BOM優先、なければShift-JIS） */
function decode(buffer: Buffer): string {
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(buffer.subarray(3));
  }
  try {
    return new TextDecoder("shift_jis", { fatal: true }).decode(buffer);
  } catch {
    // Shift-JISで読めなければUTF-8で再試行
    return new TextDecoder("utf-8").decode(buffer);
  }
}

/** RFC4180準拠のCSV1行パース（ダブルクォート対応） */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === ",") {
        result.push(current);
        current = "";
      } else if (ch === '"' && current === "") {
        inQuotes = true;
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

export function parseCsv(buffer: Buffer): ParsedCsv {
  const text = decode(buffer);
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const parsed = lines.map(parseCsvLine);
  return {
    headers: parsed[0] ?? [],
    rows: parsed.slice(1),
  };
}
