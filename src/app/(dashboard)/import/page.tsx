"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BafiImport } from "./_components/bafi-import";
import { HarHabituachImport } from "./_components/har-habituach-import";
import { ImportHistory } from "./_components/import-history";

type Tab = "bafi" | "har_habituach";

export default function ImportPage() {
  const [tab, setTab] = useState<Tab>("bafi");
  const [historyKey, setHistoryKey] = useState(0);

  const bumpHistory = () => setHistoryKey((k) => k + 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-surface-900">מרכז יבוא נתונים</h1>
        <p className="text-sm text-surface-500">
          העלו נתוני לקוחות ופוליסות ממקורות שונים
        </p>
      </div>

      {/* Source tabs */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-surface-200/80 bg-white/55 p-1.5 backdrop-blur-md">
        <TabButton
          label="BAFI (CSV)"
          sub="קבצי CSV של המשרד"
          active={tab === "bafi"}
          onClick={() => setTab("bafi")}
        />
        <TabButton
          label="הר הביטוח (Excel)"
          sub="פוליסות חיצוניות של הלקוחות"
          active={tab === "har_habituach"}
          onClick={() => setTab("har_habituach")}
        />
      </div>

      {tab === "bafi" && <BafiImport onImportComplete={bumpHistory} />}
      {tab === "har_habituach" && (
        <HarHabituachImport onImportComplete={bumpHistory} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>היסטוריית ייבוא</CardTitle>
        </CardHeader>
        <ImportHistory refreshKey={historyKey} />
      </Card>
    </div>
  );
}

function TabButton({
  label,
  sub,
  active,
  onClick,
}: {
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start rounded-lg border px-4 py-2 text-right transition-all",
        active
          ? "border-primary-300/60 bg-primary-50/70 text-primary-800"
          : "border-transparent bg-transparent text-surface-600 hover:bg-white/65 hover:text-surface-800"
      )}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="text-[11px] opacity-75">{sub}</span>
    </button>
  );
}
