"use client";

import { usePathname } from "next/navigation";
import { Bell, User } from "lucide-react";

const pageTitles: Record<string, string> = {
  "/dashboard": "דשבורד",
  "/customers": "לקוחות",
  "/insights": "תובנות",
  "/recommendations": "המלצות",
  "/documents": "מסמכים",
  "/tasks": "משימות",
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
  const title = getPageTitle(pathname);

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
            <p className="text-sm font-medium text-surface-800">רפי בכר</p>
            <p className="text-[11px] text-surface-500">מנהל</p>
          </div>
        </div>
      </div>
    </header>
  );
}
