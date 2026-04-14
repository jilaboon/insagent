"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export type ActionKind = "POSTPONED" | "DISMISSED" | "BLOCKED";

interface ActionModalProps {
  kind: ActionKind;
  customerName: string;
  onCancel: () => void;
  onConfirm: (payload: { note?: string; postponeUntil?: string }) => void;
  isSubmitting?: boolean;
}

const POSTPONE_PRESETS: { label: string; days: number | "custom" }[] = [
  { label: "שבוע", days: 7 },
  { label: "שבועיים", days: 14 },
  { label: "חודש", days: 30 },
  { label: "מותאם", days: "custom" },
];

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function ActionModal({
  kind,
  customerName,
  onCancel,
  onConfirm,
  isSubmitting,
}: ActionModalProps) {
  const [note, setNote] = useState("");
  const [preset, setPreset] = useState<number | "custom">(7);
  const [customDate, setCustomDate] = useState(daysFromNow(14));

  const titles: Record<ActionKind, string> = {
    POSTPONED: "דחה משימה",
    DISMISSED: "לא רלוונטי",
    BLOCKED: "חסום משימה",
  };

  const subtitles: Record<ActionKind, string> = {
    POSTPONED: `דחיית המשימה עבור ${customerName}`,
    DISMISSED: "דחייה זו תמנע מהלקוח להופיע בתור למשך 60 ימים",
    BLOCKED: "המשימה תיחסם עד להסרה ידנית",
  };

  function handleConfirm() {
    if (kind === "POSTPONED") {
      const postponeUntil =
        preset === "custom" ? customDate : daysFromNow(preset as number);
      onConfirm({ postponeUntil, note: note || undefined });
    } else {
      onConfirm({ note });
    }
  }

  const canConfirm =
    kind === "POSTPONED" ? true : note.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/50 p-4 animate-[fadeIn_0.15s_ease-out_forwards]"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-surface-200 bg-white shadow-xl animate-[slideUp_0.2s_ease-out_forwards]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-surface-100 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-surface-900">
              {titles[kind]}
            </h3>
            <p className="mt-0.5 text-xs text-surface-500">
              {subtitles[kind]}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1 text-surface-400 hover:bg-surface-100 hover:text-surface-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {kind === "POSTPONED" && (
            <>
              <div>
                <label className="mb-2 block text-xs font-medium text-surface-700">
                  לכמה זמן?
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {POSTPONE_PRESETS.map((p) => (
                    <button
                      key={String(p.days)}
                      onClick={() => setPreset(p.days)}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                        preset === p.days
                          ? "border-primary-500 bg-primary-50 text-primary-700"
                          : "border-surface-200 bg-white text-surface-600 hover:bg-surface-50"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              {preset === "custom" && (
                <div>
                  <label className="mb-2 block text-xs font-medium text-surface-700">
                    עד תאריך
                  </label>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    min={daysFromNow(1)}
                    className="w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-surface-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
              )}
              <div>
                <label className="mb-2 block text-xs font-medium text-surface-700">
                  הערה (אופציונלי)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="למשל: ממתין לתשובה מהלקוח..."
                  className="w-full resize-none rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
            </>
          )}

          {kind === "DISMISSED" && (
            <div>
              <label className="mb-2 block text-xs font-medium text-surface-700">
                סיבה <span className="text-red-500">*</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 200))}
                rows={3}
                placeholder="למה לא רלוונטי?"
                className="w-full resize-none rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
              <p className="mt-1 text-[11px] text-surface-400 number">
                {note.length}/200
              </p>
            </div>
          )}

          {kind === "BLOCKED" && (
            <div>
              <label className="mb-2 block text-xs font-medium text-surface-700">
                מה חסר? <span className="text-red-500">*</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="ממתין לאישור מנהל / מידע נוסף / מסמך..."
                className="w-full resize-none rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
              <p className="mt-1.5 text-[11px] text-surface-500">
                דוגמאות: ממתין לאישור מנהל · מידע נוסף · מסמך חסר
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-surface-100 bg-surface-50/50 px-6 py-3">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            ביטול
          </Button>
          <Button
            variant={kind === "DISMISSED" ? "danger" : "primary"}
            size="sm"
            onClick={handleConfirm}
            disabled={!canConfirm || isSubmitting}
          >
            {isSubmitting ? "מעבד..." : "אישור"}
          </Button>
        </div>
      </div>
    </div>
  );
}
