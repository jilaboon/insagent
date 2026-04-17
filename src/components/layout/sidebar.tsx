"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Search,
  Star,
  FileText,
  ListTodo,
  BookOpen,
  Upload,
  Shield,
  ShieldCheck,
  Brain,
  Clock,
  Settings,
  Palette,
} from "lucide-react";

const navigation = [
  { name: "דשבורד", href: "/dashboard", icon: LayoutDashboard },
  { name: "בקרוב", href: "/soon", icon: Clock },
  { name: "הגדרות תור", href: "/queue-settings", icon: Settings },
  { name: "לקוחות", href: "/customers", icon: Users },
  { name: "חקור", href: "/insights", icon: Search },
  { name: "המלצות", href: "/recommendations", icon: Star },
  { name: "מסמכים", href: "/documents", icon: FileText },
  { name: "משימות", href: "/tasks", icon: ListTodo },
  { name: "מנוע חוקים", href: "/rules", icon: BookOpen },
  { name: "יבוא נתונים", href: "/import", icon: Upload },
  { name: "יומן פעילות", href: "/audit", icon: Shield },
  { name: "אבטחה ופרטיות", href: "/security", icon: ShieldCheck },
  { name: "סטודיו עיצוב", href: "/studio", icon: Palette },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed top-0 right-0 z-30 flex h-full w-64 flex-col border-l border-surface-200 bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-surface-200 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white">
          <Brain className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-surface-900">InsAgent</h1>
          <p className="text-[11px] text-surface-500">המוח החכם של המשרד</p>
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
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary-50 text-primary-700"
                      : "text-surface-600 hover:bg-surface-50 hover:text-surface-900"
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0",
                      isActive ? "text-primary-600" : "text-surface-400"
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
      <div className="border-t border-surface-200 px-4 py-3">
        <p className="text-[11px] text-surface-400">בל סוכנות לביטוח בע״מ</p>
      </div>
    </aside>
  );
}
