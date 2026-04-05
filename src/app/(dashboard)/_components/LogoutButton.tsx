"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="w-full text-left text-xs text-gray-500 hover:text-gray-700 px-1 py-1 transition-colors"
    >
      ログアウト
    </button>
  );
}
