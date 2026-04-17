"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs } from "@/components/ui/tabs";
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
  useRules,
  useCreateRule,
  useUpdateRule,
  useDeleteRule,
  useSeedRules,
  useSuggestRules,
  type OfficeRuleItem,
  type SuggestedRuleItem,
} from "@/lib/api/hooks";
import { DataPatternsTab } from "./_components/data-patterns-tab";
import KnowledgeBaseTab from "./_components/knowledge-base-tab";

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

interface RuleFormData {
  title: string;
  body: string;
  category: string;
  triggerHint: string;
}

const EMPTY_FORM: RuleFormData = { title: "", body: "", category: "", triggerHint: "" };

const RULES_TABS = [
  { id: "library", label: "ספריית חוקים" },
  { id: "patterns", label: "תובנות מהנתונים" },
  { id: "knowledge", label: "בסיס ידע מקצועי" },
];

export default function RulesPage() {
  const { data, isLoading } = useRules();
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();
  const deleteRule = useDeleteRule();
  const seedRules = useSeedRules();
  const suggestRules = useSuggestRules();

  const [activeTab, setActiveTab] = useState("library");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState<RuleFormData>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RuleFormData>(EMPTY_FORM);
  const [suggestions, setSuggestions] = useState<SuggestedRuleItem[]>([]);

  const rules = data?.items ?? [];

  function startEdit(rule: OfficeRuleItem) {
    setEditingId(rule.id);
    setEditForm({
      title: rule.title,
      body: rule.body,
      category: rule.category ?? "",
      triggerHint: rule.triggerHint ?? "",
    });
  }

  async function handleCreate() {
    if (!newForm.title || !newForm.body) return;
    await createRule.mutateAsync({
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
    await updateRule.mutateAsync({
      id,
      title: editForm.title,
      body: editForm.body,
      category: editForm.category || undefined,
      triggerHint: editForm.triggerHint || undefined,
    });
    setEditingId(null);
  }

  async function handleToggleActive(rule: OfficeRuleItem) {
    await updateRule.mutateAsync({ id: rule.id, isActive: !rule.isActive });
  }

  async function handleDelete(id: string) {
    await deleteRule.mutateAsync(id);
  }

  async function handleSeed() {
    await seedRules.mutateAsync();
  }

  async function handleSuggest() {
    const result = await suggestRules.mutateAsync();
    setSuggestions(result.suggestions);
  }

  async function handleApproveSuggestion(suggestion: SuggestedRuleItem) {
    await createRule.mutateAsync({
      title: suggestion.title,
      body: suggestion.body,
      category: suggestion.category,
      triggerHint: suggestion.triggerHint,
    });
    setSuggestions((prev) => prev.filter((s) => s.title !== suggestion.title));
  }

  function handleDismissSuggestion(suggestion: SuggestedRuleItem) {
    setSuggestions((prev) => prev.filter((s) => s.title !== suggestion.title));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-surface-900 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary-600" />
            מנוע חוקים
          </h1>
          <p className="mt-1 text-sm text-surface-500">
            החוקים של רפי — בסיס הידע של המשרד
          </p>
        </div>
        {activeTab === "library" && (
          <div className="flex items-center gap-2">
            {rules.length === 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSeed}
                disabled={seedRules.isPending}
              >
                {seedRules.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                טען חוקים ראשוניים
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={handleSuggest}
              disabled={suggestRules.isPending}
            >
              {suggestRules.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {suggestRules.isPending ? "מנתח נתונים..." : "הצע חוקים חדשים מ-AI"}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setShowNewForm(true);
                setNewForm(EMPTY_FORM);
              }}
            >
              <Plus className="h-4 w-4" />
              הוסף חוק חדש
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs tabs={RULES_TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* Data Patterns Tab */}
      {activeTab === "patterns" && <DataPatternsTab />}

      {/* Knowledge Base Tab */}
      {activeTab === "knowledge" && <KnowledgeBaseTab />}

      {/* Library Tab */}
      {activeTab === "library" && <>
      {/* Stats */}
      {data && (
        <div className="flex items-center gap-4 text-sm text-surface-500">
          <span>{data.total} חוקים</span>
          <span className="text-surface-300">|</span>
          <span className="text-emerald-600">{data.activeCount} פעילים</span>
        </div>
      )}

      {/* New rule form */}
      {showNewForm && (
        <Card className="border-primary-200 bg-primary-50/30">
          <RuleForm
            form={newForm}
            onChange={setNewForm}
            onSave={handleCreate}
            onCancel={() => setShowNewForm(false)}
            saving={createRule.isPending}
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
                      disabled={createRule.isPending}
                    >
                      {createRule.isPending ? (
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
          <span className="mr-2 text-sm">טוען חוקים...</span>
        </div>
      )}

      {/* Rules grid */}
      {!isLoading && rules.length === 0 && !showNewForm && (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Lightbulb className="h-10 w-10 text-surface-300 mb-3" />
          <p className="text-sm text-surface-500">
            עדיין אין חוקים. לחץ על &quot;טען חוקים ראשוניים&quot; להתחלה מהירה.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {rules.map((rule) => (
          <Card
            key={rule.id}
            padding="sm"
            className={cn(
              "transition-colors",
              !rule.isActive && "opacity-60 bg-surface-50"
            )}
          >
            {editingId === rule.id ? (
              <RuleForm
                form={editForm}
                onChange={setEditForm}
                onSave={() => handleUpdate(rule.id)}
                onCancel={() => setEditingId(null)}
                saving={updateRule.isPending}
              />
            ) : (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-surface-900">
                    {rule.title}
                  </h3>
                  <div className="flex items-center gap-1 shrink-0">
                    {rule.category && (
                      <Badge variant={categoryVariant[rule.category] ?? "default"}>
                        {rule.category}
                      </Badge>
                    )}
                  </div>
                </div>

                <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">
                  {rule.body}
                </p>

                {rule.triggerHint && (
                  <p className="text-xs text-surface-400">
                    מתי להשתמש: {rule.triggerHint}
                  </p>
                )}

                <div className="flex items-center justify-between pt-1 border-t border-surface-100">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => startEdit(rule)}
                    >
                      <Pencil className="h-3 w-3" />
                      ערוך
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(rule.id)}
                      disabled={deleteRule.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                      מחק
                    </Button>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={rule.isActive}
                    onClick={() => handleToggleActive(rule)}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                      rule.isActive ? "bg-primary-600" : "bg-surface-300"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                        rule.isActive ? "-translate-x-4" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
      </>}
    </div>
  );
}

function RuleForm({
  form,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  form: RuleFormData;
  onChange: (form: RuleFormData) => void;
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
        placeholder="כותרת החוק"
        className="w-full rounded-lg border border-white/80 bg-white/80 px-3 py-2 text-sm text-surface-900 text-right placeholder:text-surface-500 backdrop-blur-sm focus:border-violet-400/60 focus:bg-white/90 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
      />
      <Textarea
        value={form.body}
        onChange={(e) => onChange({ ...form, body: e.target.value })}
        placeholder="תוכן החוק"
        rows={3}
      />
      <div className="flex items-center gap-3">
        <select
          value={form.category}
          onChange={(e) => onChange({ ...form, category: e.target.value })}
          className="rounded-lg border border-white/80 bg-white/80 px-3 py-2 text-sm text-surface-900 text-right backdrop-blur-sm focus:border-violet-400/60 focus:bg-white/90 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
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
          className="flex-1 rounded-lg border border-white/80 bg-white/80 px-3 py-2 text-sm text-surface-900 text-right placeholder:text-surface-500 backdrop-blur-sm focus:border-violet-400/60 focus:bg-white/90 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
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
