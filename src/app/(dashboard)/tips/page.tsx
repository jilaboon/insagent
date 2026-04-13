"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  Loader2,
  Lightbulb,
  Sparkles,
  Check,
  Info,
} from "lucide-react";
import {
  useTips,
  useCreateTip,
  useUpdateTip,
  useDeleteTip,
  useSeedTips,
  useSuggestTips,
  type OfficeTipItem,
  type SuggestedTipItem,
} from "@/lib/api/hooks";

const CATEGORIES = [
  { value: "חידוש", label: "חידוש" },
  { value: "כיסוי", label: "כיסוי" },
  { value: "חיסכון", label: "חיסכון" },
  { value: "שירות", label: "שירות" },
  { value: "כללי", label: "כללי" },
] as const;

const categoryVariant: Record<string, "primary" | "success" | "warning" | "info" | "default"> = {
  "חידוש": "warning",
  "כיסוי": "primary",
  "חיסכון": "success",
  "שירות": "info",
  "כללי": "default",
};

interface TipFormData {
  title: string;
  body: string;
  category: string;
  triggerHint: string;
}

const EMPTY_FORM: TipFormData = { title: "", body: "", category: "", triggerHint: "" };

export default function TipsPage() {
  const { data, isLoading } = useTips();
  const createTip = useCreateTip();
  const updateTip = useUpdateTip();
  const deleteTip = useDeleteTip();
  const seedTips = useSeedTips();
  const suggestTips = useSuggestTips();

  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState<TipFormData>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TipFormData>(EMPTY_FORM);
  const [suggestions, setSuggestions] = useState<SuggestedTipItem[]>([]);

  const tips = data?.items ?? [];

  function startEdit(tip: OfficeTipItem) {
    setEditingId(tip.id);
    setEditForm({
      title: tip.title,
      body: tip.body,
      category: tip.category ?? "",
      triggerHint: tip.triggerHint ?? "",
    });
  }

  async function handleCreate() {
    if (!newForm.title || !newForm.body) return;
    await createTip.mutateAsync({
      title: newForm.title,
      body: newForm.body,
      category: newForm.category || undefined,
      triggerHint: newForm.triggerHint || undefined,
    });
    setNewForm(EMPTY_FORM);
    setShowNewForm(false);
  }

  async function handleUpdate(id: string) {
    if (!editForm.title || !editForm.body) return;
    await updateTip.mutateAsync({
      id,
      title: editForm.title,
      body: editForm.body,
      category: editForm.category || undefined,
      triggerHint: editForm.triggerHint || undefined,
    });
    setEditingId(null);
  }

  async function handleToggleActive(tip: OfficeTipItem) {
    await updateTip.mutateAsync({ id: tip.id, isActive: !tip.isActive });
  }

  async function handleDelete(id: string) {
    await deleteTip.mutateAsync(id);
  }

  async function handleSeed() {
    await seedTips.mutateAsync();
  }

  async function handleSuggest() {
    const result = await suggestTips.mutateAsync();
    setSuggestions(result.suggestions);
  }

  async function handleApproveSuggestion(suggestion: SuggestedTipItem) {
    await createTip.mutateAsync({
      title: suggestion.title,
      body: suggestion.body,
      category: suggestion.category,
      triggerHint: suggestion.triggerHint,
    });
    setSuggestions((prev) => prev.filter((s) => s.title !== suggestion.title));
  }

  function handleDismissSuggestion(suggestion: SuggestedTipItem) {
    setSuggestions((prev) => prev.filter((s) => s.title !== suggestion.title));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary-600" />
            ספריית טיפים
          </h1>
          <p className="mt-1 text-sm text-surface-500">
            הטיפים של רפי — בסיס הידע של המשרד
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tips.length === 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSeed}
              disabled={seedTips.isPending}
            >
              {seedTips.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              טען טיפים של רפי
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={handleSuggest}
            disabled={suggestTips.isPending}
          >
            {suggestTips.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {suggestTips.isPending ? "מנתח נתונים..." : "הצע טיפים חדשים מ-AI"}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setShowNewForm(true);
              setNewForm(EMPTY_FORM);
            }}
          >
            <Plus className="h-4 w-4" />
            הוסף טיפ חדש
          </Button>
        </div>
      </div>

      {/* Stats */}
      {data && (
        <div className="flex items-center gap-4 text-sm text-surface-500">
          <span>{data.total} טיפים</span>
          <span className="text-surface-300">|</span>
          <span className="text-emerald-600">{data.activeCount} פעילים</span>
        </div>
      )}

      {/* New tip form */}
      {showNewForm && (
        <Card className="border-primary-200 bg-primary-50/30">
          <TipForm
            form={newForm}
            onChange={setNewForm}
            onSave={handleCreate}
            onCancel={() => setShowNewForm(false)}
            saving={createTip.isPending}
          />
        </Card>
      )}

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            <h2 className="text-sm font-bold text-indigo-700">
              הצעות AI ({suggestions.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {suggestions.map((suggestion) => (
              <Card
                key={suggestion.title}
                padding="sm"
                className="border-2 border-dashed border-indigo-200 bg-indigo-50/30"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                      <h3 className="text-sm font-bold text-surface-900">
                        {suggestion.title}
                      </h3>
                    </div>
                    <Badge variant={categoryVariant[suggestion.category] ?? "default"}>
                      {suggestion.category}
                    </Badge>
                  </div>

                  <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">
                    {suggestion.body}
                  </p>

                  {suggestion.triggerHint && (
                    <p className="text-xs text-surface-400">
                      מתי להשתמש: {suggestion.triggerHint}
                    </p>
                  )}

                  <div className="rounded-lg bg-indigo-50 p-2.5 border border-indigo-100">
                    <div className="flex items-start gap-1.5">
                      <Info className="h-3.5 w-3.5 text-indigo-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-xs font-medium text-indigo-600">
                          למה?
                        </span>
                        <p className="text-xs text-indigo-700 mt-0.5 leading-relaxed">
                          {suggestion.reasoning}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-indigo-100">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleApproveSuggestion(suggestion)}
                      disabled={createTip.isPending}
                    >
                      {createTip.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      הוסף לספרייה
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDismissSuggestion(suggestion)}
                    >
                      <X className="h-3 w-3" />
                      דחה
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12 text-surface-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="mr-2 text-sm">טוען טיפים...</span>
        </div>
      )}

      {/* Tips grid */}
      {!isLoading && tips.length === 0 && !showNewForm && (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Lightbulb className="h-10 w-10 text-surface-300 mb-3" />
          <p className="text-sm text-surface-500">
            עדיין אין טיפים. לחץ על &quot;טען טיפים של רפי&quot; להתחלה מהירה.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {tips.map((tip) => (
          <Card
            key={tip.id}
            padding="sm"
            className={cn(
              "transition-colors",
              !tip.isActive && "opacity-60 bg-surface-50"
            )}
          >
            {editingId === tip.id ? (
              <TipForm
                form={editForm}
                onChange={setEditForm}
                onSave={() => handleUpdate(tip.id)}
                onCancel={() => setEditingId(null)}
                saving={updateTip.isPending}
              />
            ) : (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-surface-900">
                    {tip.title}
                  </h3>
                  <div className="flex items-center gap-1 shrink-0">
                    {tip.category && (
                      <Badge variant={categoryVariant[tip.category] ?? "default"}>
                        {tip.category}
                      </Badge>
                    )}
                  </div>
                </div>

                <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">
                  {tip.body}
                </p>

                {tip.triggerHint && (
                  <p className="text-xs text-surface-400">
                    מתי להשתמש: {tip.triggerHint}
                  </p>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-surface-100">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(tip)}
                    >
                      <Pencil className="h-3 w-3" />
                      ערוך
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(tip.id)}
                      disabled={deleteTip.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                      מחק
                    </Button>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={tip.isActive}
                    onClick={() => handleToggleActive(tip)}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                      tip.isActive ? "bg-primary-600" : "bg-surface-300"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                        tip.isActive ? "-translate-x-4" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function TipForm({
  form,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  form: TipFormData;
  onChange: (form: TipFormData) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-3">
      <input
        type="text"
        value={form.title}
        onChange={(e) => onChange({ ...form, title: e.target.value })}
        placeholder="כותרת הטיפ"
        className="w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-surface-900 text-right placeholder:text-surface-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
      />
      <Textarea
        value={form.body}
        onChange={(e) => onChange({ ...form, body: e.target.value })}
        placeholder="תוכן הטיפ"
        rows={3}
      />
      <div className="flex items-center gap-3">
        <select
          value={form.category}
          onChange={(e) => onChange({ ...form, category: e.target.value })}
          className="rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-surface-900 text-right focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
        >
          <option value="">קטגוריה (אופציונלי)</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={form.triggerHint}
          onChange={(e) => onChange({ ...form, triggerHint: e.target.value })}
          placeholder="מתי להשתמש? לדוגמה: גיל מעל 60"
          className="flex-1 rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-surface-900 text-right placeholder:text-surface-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={onSave}
          disabled={saving || !form.title || !form.body}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          שמור
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
          ביטול
        </Button>
      </div>
    </div>
  );
}
