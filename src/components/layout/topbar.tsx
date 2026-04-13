"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, LogOut, User } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const pageTitles: Record<string, string> = {
  "/dashboard": "דשבורד",
  "/customers": "לקוחות",
  "/insights": "תובנות",
  "/recommendations": "המלצות",
  "/documents": "מסמכים",
  "/tasks": "משימות",
  "/tips": "ספריית טיפים",
  "/import": "יבוא נתונים",
  "/audit": "יומן פעילות",
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  if (pathname.startsWith("/customers/")) return "פרופיל לקוח";
  return "InsAgent";
}

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const title = getPageTitle(pathname);
  const [userName, setUserName] = useState("סוכן");
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        const meta = data.user.user_metadata;
        const displayName = meta?.display_name || meta?.full_name || meta?.name;
        if (displayName) {
          setUserName(displayName);
        } else if (data.user.email) {
          setUserName(data.user.email.split("@")[0]);
        }
        setUserEmail(data.user.email || "");
      }
    });
  }, []);

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-surface-200 bg-white/80 px-8 backdrop-blur-sm">
      <h2 className="text-lg font-semibold text-surface-900">{title}</h2>

      <div className="flex items-center gap-4">
        <button
          className="relative rounded-lg p-2 text-surface-500 transition-colors hover:bg-surface-50 hover:text-surface-700"
          aria-label="התראות"
        >
          <Bell className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 rounded-lg border border-surface-200 px-3 py-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-primary-700">
            <User className="h-4 w-4" />
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-surface-800">{userName}</p>
            {userEmail && (
              <p className="text-[11px] text-surface-500">{userEmail}</p>
            )}
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-surface-500 transition-colors hover:bg-surface-50 hover:text-danger"
          aria-label="התנתק"
        >
          <LogOut className="h-4 w-4" />
          <span>התנתק</span>
        </button>
      </div>
    </header>
  );
}
