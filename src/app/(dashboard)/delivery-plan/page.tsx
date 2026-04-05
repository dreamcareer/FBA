import { db } from "@/lib/db";
import { format } from "date-fns";
import { DELIVERY_PLAN_STATUS_LABELS } from "@/types";
import type { DeliveryPlanStatus } from "@prisma/client";

const STATUS_COLORS: Record<DeliveryPlanStatus, string> = {
  DRAFT:      "bg-gray-100 text-gray-600",
  SUBMITTED:  "bg-blue-50 text-blue-700",
  SHIPPED:    "bg-amber-50 text-amber-700",
  COMPLETED:  "bg-green-50 text-green-700",
  CANCELLED:  "bg-red-50 text-red-600",
};

export default async function DeliveryPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Number(params.page ?? 1);
  const perPage = 20;

  const [plans, total] = await Promise.all([
    db.deliveryPlan.findMany({
      include: {
        items: {
          include: { product: { select: { sku: true, name: true } } },
        },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.deliveryPlan.count(),
  ]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">納品プラン管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">全 {total} 件</p>
        </div>
      </div>

      <div className="space-y-3">
        {plans.map((plan) => {
          const totalQty = plan.items.reduce((s, i) => s + i.plannedQuantity, 0);

          return (
            <div
              key={plan.id}
              className="bg-white rounded-xl border border-gray-200 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-medium text-gray-900">
                      {plan.logilessOrderCode ?? plan.name}
                    </span>
                    <span
                      className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        STATUS_COLORS[plan.status]
                      }`}
                    >
                      {DELIVERY_PLAN_STATUS_LABELS[plan.status]}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>
                      作成: {format(plan.createdAt, "yyyy/MM/dd HH:mm")}
                    </span>
                    {plan.shipmentDate && (
                      <span>
                        出荷予定: {format(plan.shipmentDate, "yyyy/MM/dd (E)")}
                      </span>
                    )}
                    <span>{plan._count.items} SKU / {totalQty}点</span>
                  </div>
                </div>
              </div>

              {/* 商品一覧（展開） */}
              {plan.items.length > 0 && (
                <details className="mt-3">
                  <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                    商品一覧を見る
                  </summary>
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    {plan.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between text-xs bg-gray-50 rounded px-2.5 py-1.5"
                      >
                        <span className="font-mono text-gray-500 truncate mr-2">
                          {item.product.sku}
                        </span>
                        <span className="font-medium text-gray-900 shrink-0">
                          {item.plannedQuantity}点
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}

        {plans.length === 0 && (
          <div className="text-center py-16 text-sm text-gray-400">
            <p>納品プランがありません</p>
            <p className="mt-1">「仮プラン作成」から作成できます</p>
          </div>
        )}
      </div>

      {total > perPage && (
        <div className="flex justify-end gap-2 mt-4">
          {page > 1 && (
            <a
              href={`?page=${page - 1}`}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              前へ
            </a>
          )}
          <span className="px-3 py-1.5 text-sm text-gray-500">
            {page} / {Math.ceil(total / perPage)}
          </span>
          {page < Math.ceil(total / perPage) && (
            <a
              href={`?page=${page + 1}`}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              次へ
            </a>
          )}
        </div>
      )}
    </div>
  );
}
