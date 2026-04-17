"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp,
  DollarSign,
  Clock,
  Heart,
  Sparkles,
  Loader2,
  Save,
  X,
  Pencil,
  Check,
  BarChart3,
} from "lucide-react";
import {
  useDataPatterns,
  useSuggestFromPattern,
  useCreateRule,
  type DataPatternItem,
  type PatternSuggestion,
} from "@/lib/api/hooks";

// ============================================================
// Constants
// ============================================================

const CATEGORIES = [
  { value: "חידוש", label: "חידוש" },
  { value: "כיסוי", label: "כיסוי" },
  { value: "חיסכון", label: "חיסכון" },
  { value: "שירות", label: "שירות" },
  { value: "כללי", label: "כללי" },
] as const;

const categoryIcon: Record<string, typeof TrendingUp> = {
  "cross-sell": TrendingUp,
  optimization: DollarSign,
  renewal: Clock,
  service: Heart,
};

const categoryLabel: Record<string, string> = {
  "cross-sell": "מכירה צולבת",
  optimization: "אופטימיזציה",
  renewal: "חידוש",
  service: "שירות",
};

const severityDot: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-400",
  low: "bg-surface-300",
};

const severityLabel: Record<string, string> = {
  high: "גבוהה",
  medium: "בינונית",
  low: "נמוכה",
};

// ============================================================
// Types
// ============================================================

interface ManualFormState {
  title: string;
  body: string;
  category: string;
  triggerHint: string;
}

interface PatternState {
  manualFormOpen: boolean;
  manualForm: ManualFormState;
  suggestion: PatternSuggestion | null;
  editingSuggestion: boolean;
  editForm: ManualFormState;
}

// ============================================================
// Component
// ============================================================

export function DataPatternsTab() {
  const { data, isLoading } = useDataPatterns();
  const suggestFromPattern = useSuggestFromPattern();
  const createRule = useCreateRule();

  // Per-pattern UI state
  const [patternStates, setPatternStates] = useState<
    Record<string, PatternState>
  >({});

  function getState(id: string): PatternState {
    return (
      patternStates[id] ?? {
        manualFormOpen: false,
        manualForm: { title: "", body: "", category: "", triggerHint: "" },
        suggestion: null,
        editingSuggestion: false,
        editForm: { title: "", body: "", category: "", triggerHint: "" },
      }
    );
  }

  function updateState(id: string, partial: Partial<PatternState>) {
    setPatternStates((prev) => ({
      ...prev,
      [id]: { ...getState(id), ...partial },
    }));
  }

  // --------------------------------------------------------
  // Manual form
  // --------------------------------------------------------
  function openManualForm(pattern: DataPatternItem) {
    updateState(pattern.id, {
      manualFormOpen: true,
      manualForm: {
        title: pattern.title,
        body: "",
        category: "",
        triggerHint: "",
      },
      suggestion: null,
    });
  }

  async function handleManualSave(patternId: string) {
    const state = getState(patternId);
    const { title, body, category, triggerHint } = state.manualForm;
    if (!title || !body) return;
    await createRule.mutateAsync({
      title,
      body,
      category: category || undefined,
      triggerHint: triggerHint || undefined,
    });
    updateState(patternId, {
      manualFormOpen: false,
      manualForm: { title: "", body: "", category: "", triggerHint: "" },
    });
  }

  // --------------------------------------------------------
  // AI suggestion
  // --------------------------------------------------------
  async function handleSuggest(pattern: DataPatternItem) {
    updateState(pattern.id, {
      manualFormOpen: false,
      suggestion: null,
      editingSuggestion: false,
    });
    const result = await suggestFromPattern.mutateAsync({
      patternId: pattern.id,
      patternTitle: pattern.title,
      patternDescription: pattern.description,
      count: pattern.count,
    });
    updateState(pattern.id, {
      suggestion: result,
      editingSuggestion: false,
      editForm: {
        title: result.title,
        body: result.body,
        category: result.category,
        triggerHint: result.triggerHint,
      },
    });
  }

  async function handleSaveSuggestion(patternId: string) {
    const state = getState(patternId);
    const source = state.editingSuggestion ? state.editForm : {
      title: state.suggestion!.title,
      body: state.suggestion!.body,
      category: state.suggestion!.category,
      triggerHint: state.suggestion!.triggerHint,
    };
    await createRule.mutateAsync({
      title: source.title,
      body: source.body,
      category: source.category || undefined,
      triggerHint: source.triggerHint || undefined,
    });
    updateState(patternId, { suggestion: null, editingSuggestion: false });
  }

  function startEditSuggestion(patternId: string) {
    const state = getState(patternId);
    updateState(patternId, {
      editingSuggestion: true,
      editForm: {
        title: state.suggestion!.title,
        body: state.suggestion!.body,
        category: state.suggestion!.category,
        triggerHint: state.suggestion!.triggerHint,
      },
    });
  }

  // --------------------------------------------------------
  // Render
  // --------------------------------------------------------

  const patterns = data?.patterns ?? [];
  const totalCustomers = data?.totalCustomers ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-surface-200 bg-white p-5"
          >
            <div className="flex items-start gap-3">
              <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-72" />
                <div className="flex gap-3 pt-1">
                  <Skeleton className="h-6 w-20 rounded-md" />
                  <Skeleton className="h-6 w-24 rounded-md" />
                </div>
              </div>
              <Skeleton className="h-8 w-16 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (patterns.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center py-16 text-center">
        <BarChart3 className="h-10 w-10 text-surface-300 mb-3" />
        <p className="text-sm text-surface-500">
          אין דפוסים לניתוח כרגע. ייבא נתוני לקוחות כדי להתחיל.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm text-surface-500">
        <span>{patterns.length} דפוסים זוהו</span>
        <span className="text-surface-300">|</span>
        <span>{totalCustomers.toLocaleString("he-IL")} לקוחות</span>
      </div>

      {/* Pattern cards */}
      {patterns.map((pattern) => {
        const state = getState(pattern.id);
        const Icon = categoryIcon[pattern.category] ?? TrendingUp;
        const loadingThisPattern =
          suggestFromPattern.isPending &&
          suggestFromPattern.variables?.patternId === pattern.id;

        return (
          <div key={pattern.id} className="space-y-0">
            <Card padding="sm" className="space-y-4">
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50">
                  <Icon className="h-4.5 w-4.5 text-primary-600" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold text-surface-900 leading-snug">
                      {pattern.title}
                    </h3>
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full shrink-0",
                        severityDot[pattern.severity]
                      )}
                      title={`חשיבות: ${severityLabel[pattern.severity]}`}
                    />
                  </div>
                  <p className="text-sm text-surface-600 leading-relaxed">
                    {pattern.description}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <Badge variant="primary" className="number">
                      {pattern.count.toLocaleString("he-IL")} לקוחות
                    </Badge>
                    <span className="text-xs text-surface-400 number">
                      {pattern.percentage}% מהלקוחות
                    </span>
                    <Badge variant="muted">
                      {categoryLabel[pattern.category] ?? pattern.category}
                    </Badge>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openManualForm(pattern)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    כתוב בעצמי
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleSuggest(pattern)}
                    disabled={loadingThisPattern}
                    className="bg-gradient-to-l from-indigo-600 to-primary-600 hover:from-indigo-700 hover:to-primary-700"
                  >
                    {loadingThisPattern ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {loadingThisPattern ? "יוצר..." : "הצע עם AI"}
                  </Button>
                </div>
              </div>

              {/* ---- Manual form (inline) ---- */}
              {state.manualFormOpen && (
                <div className="border-t border-surface-100 pt-4 space-y-3">
                  <input
                    type="text"
                    value={state.manualForm.title}
                    onChange={(e) =>
                      updateState(pattern.id, {
                        manualForm: {
                          ...state.manualForm,
                          title: e.target.value,
                        },
                      })
                    }
                    placeholder="כותרת החוק"
                    className="w-full rounded-lg border border-white/80 bg-white/80 px-3 py-2 text-sm text-surface-900 text-right placeholder:text-surface-500 backdrop-blur-sm focus:border-violet-400/60 focus:bg-white/90 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
                  />
                  <Textarea
                    value={state.manualForm.body}
                    onChange={(e) =>
                      updateState(pattern.id, {
                        manualForm: {
                          ...state.manualForm,
                          body: e.target.value,
                        },
                      })
                    }
                    placeholder="תוכן החוק"
                    rows={3}
                  />
                  <div className="flex items-center gap-3">
                    <select
                      value={state.manualForm.category}
                      onChange={(e) =>
                        updateState(pattern.id, {
                          manualForm: {
                            ...state.manualForm,
                            category: e.target.value,
                          },
                        })
                      }
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
                      value={state.manualForm.triggerHint}
                      onChange={(e) =>
                        updateState(pattern.id, {
                          manualForm: {
                            ...state.manualForm,
                            triggerHint: e.target.value,
                          },
                        })
                      }
                      placeholder="מתי להשתמש?"
                      className="flex-1 rounded-lg border border-white/80 bg-white/80 px-3 py-2 text-sm text-surface-900 text-right placeholder:text-surface-500 backdrop-blur-sm focus:border-violet-400/60 focus:bg-white/90 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleManualSave(pattern.id)}
                      disabled={
                        createRule.isPending ||
                        !state.manualForm.title ||
                        !state.manualForm.body
                      }
                    >
                      {createRule.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      שמור לספרייה
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateState(pattern.id, { manualFormOpen: false })
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                      ביטול
                    </Button>
                  </div>
                </div>
              )}
            </Card>

            {/* ---- AI suggestion preview ---- */}
            {state.suggestion && (
              <Card
                padding="sm"
                className="border-2 border-dashed border-indigo-200 bg-indigo-50/30 mr-6 -mt-1 rounded-t-none"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                    <span className="text-xs font-bold text-indigo-600">
                      הצעת AI
                    </span>
                  </div>

                  {state.editingSuggestion ? (
                    /* Editable mode */
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={state.editForm.title}
                        onChange={(e) =>
                          updateState(pattern.id, {
                            editForm: {
                              ...state.editForm,
                              title: e.target.value,
                            },
                          })
                        }
                        className="w-full rounded-lg border border-white/80 bg-white/80 px-3 py-2 text-sm text-surface-900 text-right placeholder:text-surface-500 backdrop-blur-sm focus:border-violet-400/60 focus:bg-white/90 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
                      />
                      <Textarea
                        value={state.editForm.body}
                        onChange={(e) =>
                          updateState(pattern.id, {
                            editForm: {
                              ...state.editForm,
                              body: e.target.value,
                            },
                          })
                        }
                        rows={3}
                      />
                      <div className="flex items-center gap-3">
                        <select
                          value={state.editForm.category}
                          onChange={(e) =>
                            updateState(pattern.id, {
                              editForm: {
                                ...state.editForm,
                                category: e.target.value,
                              },
                            })
                          }
                          className="rounded-lg border border-white/80 bg-white/80 px-3 py-2 text-sm text-surface-900 text-right backdrop-blur-sm focus:border-violet-400/60 focus:bg-white/90 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
                        >
                          <option value="">קטגוריה</option>
                          {CATEGORIES.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={state.editForm.triggerHint}
                          onChange={(e) =>
                            updateState(pattern.id, {
                              editForm: {
                                ...state.editForm,
                                triggerHint: e.target.value,
                              },
                            })
                          }
                          placeholder="מתי להשתמש?"
                          className="flex-1 rounded-lg border border-white/80 bg-white/80 px-3 py-2 text-sm text-surface-900 text-right placeholder:text-surface-500 backdrop-blur-sm focus:border-violet-400/60 focus:bg-white/90 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
                        />
                      </div>
                    </div>
                  ) : (
                    /* Preview mode */
                    <div className="space-y-2">
                      <h4 className="text-sm font-bold text-surface-900">
                        {state.suggestion.title}
                      </h4>
                      <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">
                        {state.suggestion.body}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge variant="info">{state.suggestion.category}</Badge>
                        {state.suggestion.triggerHint && (
                          <span className="text-xs text-surface-400">
                            מתי: {state.suggestion.triggerHint}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t border-indigo-100">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleSaveSuggestion(pattern.id)}
                      disabled={createRule.isPending}
                    >
                      {createRule.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      הוסף לספרייה
                    </Button>
                    {!state.editingSuggestion && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEditSuggestion(pattern.id)}
                      >
                        <Pencil className="h-3 w-3" />
                        ערוך
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        updateState(pattern.id, {
                          suggestion: null,
                          editingSuggestion: false,
                        })
                      }
                    >
                      <X className="h-3 w-3" />
                      בטל
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </div>
        );
      })}
    </div>
  );
}
