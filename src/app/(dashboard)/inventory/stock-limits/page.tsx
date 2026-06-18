import Link from "next/link";
import { db } from "@/lib/db";
import ImportForm from "./_components/ImportForm";

export default async function StockLimitsImportPage() {
  // 在庫上限が設定されている商品数
  const withLimitCount = await db.product.count({
    where: { stockUpperLimit: { not: null }, isActive: true },
  });

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <Link
          href="/inventory"
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          ← 在庫一覧に戻る
        </Link>
        <h1 className="text-lg font-semibold text-gray-900 mt-2">
          在庫上限 CSV取り込み（UpperReport）
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          在庫上限CSV（SKU, 在庫上限）または Amazon在庫計画レポート（Child_ASIN, Upper_Limit）を取り込みます
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 mb-4">
        <dl className="text-sm">
          <div>
            <dt className="text-xs text-gray-500">在庫上限 設定済み商品数</dt>
            <dd className="mt-0.5 text-gray-900">
              {withLimitCount.toLocaleString()} SKU
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <ImportForm />
      </div>

      <div className="mt-6 rounded-lg bg-gray-50 border border-gray-200 p-4 text-xs text-gray-600 space-y-2">
        <p className="font-semibold text-gray-700">取り込みについて</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            次の2形式に対応しています:
            <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5 text-gray-500">
              <li>
                <span className="font-mono">SKU</span>,{" "}
                <span className="font-mono">在庫上限</span>（上限指定 / 上限 でも可）→ SKUで突合
              </li>
              <li>
                Amazon在庫計画レポート（<span className="font-mono">Child_ASIN</span>,{" "}
                <span className="font-mono">Upper_Limit</span> 等の列）→ Child_ASINで突合
              </li>
            </ul>
          </li>
          <li>
            在庫上限（<span className="font-mono">Upper_Limit</span>）が数値の場合のみ保存します
          </li>
          <li>在庫上限が空欄の行はスキップします（変更なし）</li>
          <li>数値以外（テキスト）の行は不正値としてスキップします</li>
          <li>商品マスタに存在しないSKU / ASINはスキップされます</li>
          <li>文字コード: Shift-JIS / UTF-8 BOM どちらでも可</li>
        </ul>
      </div>
    </div>
  );
}
