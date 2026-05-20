import Link from "next/link";
import { db } from "@/lib/db";
import ImportForm from "./_components/ImportForm";

export default async function FbaLimitsImportPage() {
  // 最終取り込み日時を取得
  const latest = await db.product.findFirst({
    where: { fbaLimitUpdatedAt: { not: null } },
    orderBy: { fbaLimitUpdatedAt: "desc" },
    select: { fbaLimitUpdatedAt: true },
  });

  // 上限が設定されている商品数
  const withLimitCount = await db.product.count({
    where: { fbaStockUpperLimit: { not: null }, isActive: true },
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
          FBA容量上限 CSV取り込み
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Amazonセラーセントラルからエクスポートした容量上限CSVを取り込みます
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 mb-4">
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs text-gray-500">最終取り込み</dt>
            <dd className="mt-0.5 text-gray-900">
              {latest?.fbaLimitUpdatedAt
                ? new Date(latest.fbaLimitUpdatedAt).toLocaleString("ja-JP", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "未取り込み"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">上限設定済み商品数</dt>
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
          <li>Child_ASIN を商品マスタの ASIN と突合します</li>
          <li>
            <span className="font-mono">Upper_Limit</span> →
            FBA上限、<span className="font-mono">Open_PO_Quantity</span> → 入荷予定 として保存します
          </li>
          <li>
            <span className="font-mono">On_Hand_Quantity</span>{" "}
            は SP-API同期で管理されるためCSVからは更新しません
          </li>
          <li>商品マスタに存在しないASINはスキップされます</li>
          <li>文字コード: Shift-JIS / UTF-8 BOM どちらでも可</li>
        </ul>
      </div>
    </div>
  );
}
