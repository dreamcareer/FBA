/**
 * 商品名からカラー名を抽出し、背景色を返す
 * スプレッドシートのように同じ商品カラーは同じ薄い背景色
 */

const COLOR_MAP: Record<string, string> = {
  "チャーミングブラウン": "#fef3e2",
  "チャーミングオレンジブラウン": "#fef3e2",
  "チャーミングオリーブブラウン": "#f0f4e4",
  "チャーミンググレー": "#eef0f2",
  "チャーミングブルー": "#e8f0fa",
  "チャーミンググリーン": "#e6f2e6",
  "チャーミングヘーゼル": "#fdf6e3",
  "ナチュラルブラウン": "#faf0e6",
  "ナチュラルライトブラウン": "#fdf8ef",
  "スウィートチョコ": "#f2ebe6",
  "スウィートフェミニンブラウン": "#fceef2",
  "エレガントブラック": "#eaeaea",
  "ピュアブラウン": "#faf0e6",
  "ピュアヘーゼル": "#fdf6e3",
  "ピュアクリスタル": "#f0f0f8",
  "ミスティブラウン": "#f5efe8",
  "ミスティピーチブラウン": "#fdf0ee",
  "ミスティハニーブラウン": "#fdf5e8",
  "ミスティロージーブラウン": "#fdf0ee",
  "ミスティヘーゼル": "#f5f3e6",
  "ハニーブラウン": "#fdf5e8",
  "グレージュピンク": "#f8f0f2",
  "スノーグレー": "#eef0f2",
  "アッシュブルー": "#e8f0fa",
  "クリームヘーゼル": "#fdf6e3",
  "アプリコットラテ": "#fdf3ea",
  "ティラミス": "#f2ebe6",
  "ムーングロウトパーズ": "#f0eff8",
  "ブラウンクォーツ": "#f2ebe6",
  "ココアエスプレッソ": "#efe8e2",
  "ウォーターグロー": "#e8f4f6",
  "クリア": "#f5f5f5",
};

const PATTERNS = Object.keys(COLOR_MAP).sort((a, b) => b.length - a.length);

export function getProductColor(name: string): string | null {
  for (const pattern of PATTERNS) {
    if (name.includes(pattern)) {
      return COLOR_MAP[pattern];
    }
  }
  return null;
}

/**
 * 商品名からカラー名を抽出
 */
export function getColorName(name: string): string {
  for (const pattern of PATTERNS) {
    if (name.includes(pattern)) {
      return pattern;
    }
  }
  return "その他";
}
