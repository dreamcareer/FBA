import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { db } from "@/lib/db";
import LogoutButton from "./_components/LogoutButton";

const NAV_ITEMS = [
  { href: "/inventory",        label: "在庫一覧",       icon: "📦" },
  { href: "/provisional-plan", label: "仮プラン作成",   icon: "📋" },
  { href: "/delivery-plan",    label: "納品プラン管理", icon: "🚚" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 最終同期日時を取得
  const lastSync = await db.syncLog.findFirst({
    where: { type: "LOGILESS_INVENTORY", status: "SUCCESS" },
    orderBy: { finishedAt: "desc" },
  });

  return (
    <div className="flex h-screen bg-gray-50">
      {/* サイドバー */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-900">Naturali FBA</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{user.email}</p>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-gray-100 space-y-2">
          {lastSync?.finishedAt && (
            <p className="text-xs text-gray-400">
              最終同期:{" "}
              {new Date(lastSync.finishedAt).toLocaleString("ja-JP", {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
          <LogoutButton />
        </div>
      </aside>

      {/* メインコンテンツ */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
