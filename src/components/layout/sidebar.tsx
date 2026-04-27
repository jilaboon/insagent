"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Search,
  BookOpen,
  Upload,
  ShieldCheck,
  Settings,
  RefreshCw,
  Brain,
  Clock,
} from "lucide-react";

// Trimmed menu for the customer demo — only items that are real and
// functional. Empty-state placeholders (/documents, /tasks,
// /recommendations, /audit) and the design playground (/studio) are
// hidden. The pages still exist; just not surfaced in the nav.
const navigation = [
  { name: "דשבורד", href: "/dashboard", icon: LayoutDashboard },
  { name: "תור מחר", href: "/soon", icon: Clock },
  { name: "חידושים מ-BAFI", href: "/renewals", icon: RefreshCw },
  { name: "הגדרות תור", href: "/queue-settings", icon: Settings },
  { name: "לקוחות", href: "/customers", icon: Users },
  { name: "חקור תובנות", href: "/insights", icon: Search },
  { name: "מנוע חוקים", href: "/rules", icon: BookOpen },
  { name: "יבוא נתונים", href: "/import", icon: Upload },
  { name: "אבטחה ופרטיות", href: "/security", icon: ShieldCheck },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        // Glass slab on the right (RTL — sidebar is on the right side)
        "fixed top-0 right-0 z-30 flex h-full w-64 flex-col",
        "border-l border-white/70",
        "bg-white/70 backdrop-blur-2xl backdrop-saturate-150"
      )}
      style={{
        boxShadow:
          "-1px 0 0 0 rgba(255,255,255,0.7) inset, " +
          "-12px 0 40px -20px rgba(80,70,180,0.22)",
      }}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-white/60 px-6">
        <div
          className="relative flex h-9 w-9 items-center justify-center rounded-xl text-white"
          style={{
            background:
              "linear-gradient(135deg, #818CF8 0%, #A78BFA 55%, #F0ABFC 100%)",
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.5) inset, 0 6px 16px -6px rgba(167,139,250,0.7)",
          }}
        >
          <Brain className="h-5 w-5" />
        </div>
        <div>
          <h1
            className="text-sm font-bold"
            style={{
              backgroundImage:
                "linear-gradient(100deg, #4338CA 0%, #7C3AED 50%, #C026D3 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            זרקור
          </h1>
          <p className="text-[11px] text-surface-500">ממקד את המשרד במה שחשוב עכשיו</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                    isActive
                      ? cn(
                          "text-violet-700",
                          // violet glass chip + subtle glow
                          "border border-[rgba(167,139,250,0.35)]",
                          "bg-[rgba(167,139,250,0.14)] backdrop-blur-sm",
                          "shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_6px_16px_-8px_rgba(167,139,250,0.55)]"
                        )
                      : cn(
                          "border border-transparent text-surface-600",
                          "hover:bg-[rgba(167,139,250,0.08)] hover:text-violet-700"
                        )
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0",
                      isActive ? "text-violet-600" : "text-surface-400"
                    )}
                  />
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-white/60 px-4 py-3">
        <p className="text-[11px] text-surface-400">בל סוכנות לביטוח בע״מ</p>
      </div>
    </aside>
  );
}
