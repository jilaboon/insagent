"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquarePlus,
  Loader2,
  Pencil,
  Trash2,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CustomerNote {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; email: string } | null;
  canEdit: boolean;
}

interface NotesResponse {
  items: CustomerNote[];
}

const MAX_LENGTH = 4000;

export function CustomerNotes({ customerId }: { customerId: string }) {
  const qc = useQueryClient();
  const queryKey = ["customer-notes", customerId] as const;

  const { data, isLoading } = useQuery<NotesResponse>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/customers/${customerId}/notes`);
      if (!res.ok) throw new Error("Failed to load notes");
      return res.json();
    },
  });

  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch(`/api/customers/${customerId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "שגיאה בשמירה");
      }
      return (await res.json()) as CustomerNote;
    },
    onSuccess: () => {
      setBody("");
      setError(null);
      qc.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => setError(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) {
      setError("לא ניתן לשמור עדכון ריק");
      return;
    }
    if (trimmed.length > MAX_LENGTH) {
      setError(`עדכון ארוך מדי (מקסימום ${MAX_LENGTH} תווים)`);
      return;
    }
    create.mutate(trimmed);
  };

  const notes = data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            📝 עדכונים ושיחות
            {notes.length > 0 && (
              <span className="number text-xs text-surface-500">
                ({notes.length})
              </span>
            )}
          </span>
        </CardTitle>
      </CardHeader>

      {/* Add new note */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (error) setError(null);
          }}
          rows={3}
          placeholder="הוסף עדכון — דיברתי, הצעתי, מה סוכם, מתי לחזור..."
          className="w-full resize-y rounded-lg border border-white/80 bg-white/85 px-3 py-2 text-sm text-surface-900 placeholder:text-surface-400 backdrop-blur-md focus:border-violet-400/60 focus:bg-white/95 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
          maxLength={MAX_LENGTH}
          disabled={create.isPending}
        />
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={create.isPending || !body.trim()}
            >
              {create.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MessageSquarePlus className="h-3.5 w-3.5" />
              )}
              שמור עדכון
            </Button>
            {error && (
              <span className="flex items-center gap-1 text-xs text-red-600">
                <AlertCircle className="h-3.5 w-3.5" />
                {error}
              </span>
            )}
          </div>
          <span className="text-[11px] text-surface-400 number">
            {body.length}/{MAX_LENGTH}
          </span>
        </div>
      </form>

      {/* Notes timeline */}
      <div className="mt-5 space-y-3">
        {isLoading ? (
          <p className="text-center text-xs text-surface-400 py-4">טוען...</p>
        ) : notes.length === 0 ? (
          <p className="text-center text-xs text-surface-400 py-4">
            עוד לא נוסף אף עדכון ללקוח הזה.
          </p>
        ) : (
          notes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              customerId={customerId}
              onChange={() => qc.invalidateQueries({ queryKey })}
            />
          ))
        )}
      </div>
    </Card>
  );
}

// ============================================================
// Single note row with inline edit / delete
// ============================================================

function NoteRow({
  note,
  customerId,
  onChange,
}: {
  note: CustomerNote;
  customerId: string;
  onChange: () => void;
}) {
  const canModify = note.canEdit;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const [err, setErr] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: async (text: string) => {
      const res = await fetch(
        `/api/customers/${customerId}/notes/${note.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        }
      );
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "שגיאה בעדכון");
      }
    },
    onSuccess: () => {
      setEditing(false);
      setErr(null);
      onChange();
    },
    onError: (e: Error) => setErr(e.message),
  });

  const del = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/customers/${customerId}/notes/${note.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "שגיאה במחיקה");
      }
    },
    onSuccess: onChange,
    onError: (e: Error) => setErr(e.message),
  });

  const when = new Date(note.createdAt);
  const edited =
    new Date(note.updatedAt).getTime() - when.getTime() > 1000; // >1s of drift = edited
  const authorLabel =
    note.author?.name?.trim() ||
    note.author?.email?.split("@")[0] ||
    "—";

  return (
    <div className="rounded-lg border border-surface-200 bg-white/65 p-3 backdrop-blur-md">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] text-surface-500">
          <span className="font-medium text-surface-700">{authorLabel}</span>
          <span>·</span>
          <span className="number">
            {when.toLocaleDateString("he-IL")} ·{" "}
            {when.toLocaleTimeString("he-IL", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {edited && (
            <span className="text-surface-400">· נערך</span>
          )}
        </div>
        {canModify && !editing && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setDraft(note.body);
                setEditing(true);
                setErr(null);
              }}
              className="rounded p-1 text-surface-500 hover:bg-white/60 hover:text-violet-700"
              aria-label="ערוך"
              title="ערוך"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm("למחוק את העדכון הזה?")) del.mutate();
              }}
              className="rounded p-1 text-surface-500 hover:bg-white/60 hover:text-red-600"
              aria-label="מחק"
              title="מחק"
              disabled={del.isPending}
            >
              {del.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={MAX_LENGTH}
            className="w-full resize-y rounded-lg border border-white/80 bg-white/85 px-3 py-2 text-sm text-surface-900 backdrop-blur-md focus:border-violet-400/60 focus:bg-white/95 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
          />
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                const trimmed = draft.trim();
                if (!trimmed) {
                  setErr("לא ניתן לשמור עדכון ריק");
                  return;
                }
                update.mutate(trimmed);
              }}
              disabled={update.isPending}
            >
              {update.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              שמור
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(note.body);
                setEditing(false);
                setErr(null);
              }}
              disabled={update.isPending}
            >
              <X className="h-3.5 w-3.5" />
              בטל
            </Button>
            {err && (
              <span className={cn("flex items-center gap-1 text-xs text-red-600")}>
                <AlertCircle className="h-3.5 w-3.5" />
                {err}
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-surface-800 leading-relaxed">
          {note.body}
        </p>
      )}
      {!editing && err && (
        <p className="mt-2 flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5" />
          {err}
        </p>
      )}
    </div>
  );
}
