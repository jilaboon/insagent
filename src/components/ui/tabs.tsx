import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  return (
    <div
      className={cn(
        "flex gap-1 border-b border-white/60",
        className
      )}
      role="tablist"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeTab}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors relative",
            tab.id === activeTab
              ? "text-violet-700"
              : "text-surface-600 hover:text-surface-800"
          )}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.id === activeTab && (
            <span
              className="absolute bottom-0 inset-x-0 h-0.5 rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, #818CF8, #A78BFA 50%, #F0ABFC)",
              }}
            />
          )}
        </button>
      ))}
    </div>
  );
}
