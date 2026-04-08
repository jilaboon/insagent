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
        "flex gap-1 border-b border-surface-200",
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
              ? "text-primary-700"
              : "text-surface-500 hover:text-surface-700"
          )}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.id === activeTab && (
            <span className="absolute bottom-0 inset-x-0 h-0.5 bg-primary-600 rounded-full" />
          )}
        </button>
      ))}
    </div>
  );
}
