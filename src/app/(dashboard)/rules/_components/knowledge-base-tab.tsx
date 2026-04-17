"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  BookOpen,
  Sparkles,
  Trash2,
  Loader2,
  Plus,
  Check,
  X,
  Pencil,
  ExternalLink,
  FileText,
  Info,
  Save,
  Search,
} from "lucide-react";
import {
  useKnowledgeArticles,
  useCreateArticle,
  useDeleteArticle,
  useExtractTips,
  useCreateRule,
  useDiscoverArticles,
  type ExtractedTipItem,
  type DiscoveredArticleItem,
} from "@/lib/api/hooks";

const categoryVariant: Record<
  string,
  "primary" | "success" | "warning" | "info" | "default"
> = {
  חידוש: "warning",
  כיסוי: "primary",
  חיסכון: "success",
  שירות: "info",
  כללי: "default",
};

interface ArticleFormData {
  title: string;
  content: string;
  source: string;
}

const EMPTY_FORM: ArticleFormData = { title: "", content: "", source: "" };

interface ExtractedTipWithEdit extends ExtractedTipItem {
  editing?: boolean;
  editTitle?: string;
  editBody?: string;
  editCategory?: string;
  editTriggerHint?: string;
}

export default function KnowledgeBaseTab() {
  const { data, isLoading } = useKnowledgeArticles();
  const createArticle = useCreateArticle();
  const deleteArticle = useDeleteArticle();
  const extractTips = useExtractTips();
  const createRule = useCreateRule();
  const discoverArticles = useDiscoverArticles();

  const [form, setForm] = useState<ArticleFormData>(EMPTY_FORM);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [extractedRules, setExtractedRules] = useState<
    Record<string, ExtractedTipWithEdit[]>
  >({});
  const [discoverTopic, setDiscoverTopic] = useState("");
  const [discoveredArticles, setDiscoveredArticles] = useState<
    DiscoveredArticleItem[]
  >([]);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);

  const articles = data?.items ?? [];

  async function handleCreate() {
    if (!form.title || !form.content) return;
    await createArticle.mutateAsync({
      title: form.title,
      content: form.content,
      source: form.source || undefined,
    });
    setForm(EMPTY_FORM);
  }

  async function handleDelete(id: string) {
    await deleteArticle.mutateAsync(id);
    setDeleteConfirmId(null);
    setExtractedRules((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function handleExtract(articleId: string) {
    setExtractingId(articleId);
    try {
      const result = await extractTips.mutateAsync(articleId);
      setExtractedRules((prev) => ({
        ...prev,
        [articleId]: result.tips.map((t) => ({ ...t })),
      }));
    } finally {
      setExtractingId(null);
    }
  }

  async function handleApproveRule(
    articleId: string,
    tip: ExtractedTipWithEdit
  ) {
    await createRule.mutateAsync({
      title: tip.editing ? (tip.editTitle ?? tip.title) : tip.title,
      body: tip.editing ? (tip.editBody ?? tip.body) : tip.body,
      category: tip.editing ? (tip.editCategory ?? tip.category) : tip.category,
      triggerHint: tip.editing
        ? (tip.editTriggerHint ?? tip.triggerHint)
        : tip.triggerHint,
    });
    setExtractedRules((prev) => ({
      ...prev,
      [articleId]: (prev[articleId] ?? []).filter((t) => t.title !== tip.title),
    }));
  }

  function handleDismissRule(articleId: string, tipTitle: string) {
    setExtractedRules((prev) => ({
      ...prev,
      [articleId]: (prev[articleId] ?? []).filter((t) => t.title !== tipTitle),
    }));
  }

  function toggleEditRule(articleId: string, tipTitle: string) {
    setExtractedRules((prev) => ({
      ...prev,
      [articleId]: (prev[articleId] ?? []).map((t) =>
        t.title === tipTitle
          ? {
              ...t,
              editing: !t.editing,
              editTitle: t.title,
              editBody: t.body,
              editCategory: t.category,
              editTriggerHint: t.triggerHint,
            }
          : t
      ),
    }));
  }

  async function handleDiscover() {
    const result = await discoverArticles.mutateAsync({
      topic: discoverTopic || undefined,
    });
    setDiscoveredArticles(result.articles);
  }

  async function handleSaveDiscovered(article: DiscoveredArticleItem, index: number) {
    setSavingIndex(index);
    try {
      await createArticle.mutateAsync({
        title: article.title,
        content: article.content,
        source: article.source,
      });
      setDiscoveredArticles((prev) => prev.filter((_, i) => i !== index));
    } finally {
      setSavingIndex(null);
    }
  }

  function handleDismissDiscovered(index: number) {
    setDiscoveredArticles((prev) => prev.filter((_, i) => i !== index));
  }

  function updateEditRule(
    articleId: string,
    tipTitle: string,
    field: string,
    value: string
  ) {
    setExtractedRules((prev) => ({
      ...prev,
      [articleId]: (prev[articleId] ?? []).map((t) =>
        t.title === tipTitle ? { ...t, [field]: value } : t
      ),
    }));
  }

  return (
    <div className="space-y-6">
      {/* AI Article Discovery */}
      <Card className="border-blue-200 bg-blue-50/30">
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Search className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold text-surface-900">
              גילוי מאמרים חכם
            </h2>
          </div>
          <p className="text-xs text-surface-500">
            חפשו מאמרים ועדכונים רלוונטיים לשוק הביטוח הישראלי באמצעות AI
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={discoverTopic}
              onChange={(e) => setDiscoverTopic(e.target.value)}
              placeholder="נושא ספציפי (אופציונלי)..."
              className="flex-1 rounded-lg border border-white/80 bg-white/80 px-3 py-2 text-sm text-surface-900 text-right placeholder:text-surface-500 backdrop-blur-sm focus:border-violet-400/60 focus:bg-white/90 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={handleDiscover}
              disabled={discoverArticles.isPending}
              className="bg-gradient-to-l from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shrink-0"
            >
              {discoverArticles.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              {discoverArticles.isPending
                ? "מחפש מאמרים רלוונטיים..."
                : "חפש מאמרים רלוונטיים"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Discovered Articles */}
      {discoveredArticles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-blue-500" />
            <h3 className="text-sm font-bold text-blue-700">
              מאמרים שנמצאו ({discoveredArticles.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {discoveredArticles.map((article, index) => (
              <Card
                key={`${article.title}-${index}`}
                padding="sm"
                className="border-2 border-blue-200 bg-blue-50/30"
              >
                <div className="space-y-3">
                  {/* Title */}
                  <div className="flex items-start gap-2">
                    <Search className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                    <h4 className="text-sm font-bold text-surface-900">
                      {article.title}
                    </h4>
                  </div>

                  {/* Summary */}
                  <p className="text-sm text-surface-700 leading-relaxed">
                    {article.summary}
                  </p>

                  {/* Source */}
                  <div className="text-xs text-surface-400">
                    {article.source.startsWith("http") ? (
                      <a
                        href={article.source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
                      >
                        <ExternalLink className="h-3 w-3" />
                        מקור
                      </a>
                    ) : (
                      <span>{article.source}</span>
                    )}
                  </div>

                  {/* Relevance */}
                  <div className="rounded-lg bg-blue-50 p-2.5 border border-blue-100">
                    <div className="flex items-start gap-1.5">
                      <Info className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-blue-700 leading-relaxed">
                        {article.relevance}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1 border-t border-blue-100">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleSaveDiscovered(article, index)}
                      disabled={savingIndex === index}
                    >
                      {savingIndex === index ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="h-3 w-3" />
                      )}
                      הוסף לבסיס הידע
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDismissDiscovered(index)}
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

      {/* Add Article Form */}
      <Card className="border-primary-200 bg-primary-50/30">
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Plus className="h-4 w-4 text-primary-600" />
            <h2 className="text-sm font-bold text-surface-900">
              הוסף מאמר או עדכון
            </h2>
          </div>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="כותרת המאמר"
            className="w-full rounded-lg border border-white/80 bg-white/80 px-3 py-2 text-sm text-surface-900 text-right placeholder:text-surface-500 backdrop-blur-sm focus:border-violet-400/60 focus:bg-white/90 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
          />
          <Textarea
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            placeholder="הדביקו כאן את תוכן המאמר, עדכון הרגולציה או החדשות"
            rows={10}
          />
          <input
            type="text"
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
            placeholder="קישור או מקור המידע (אופציונלי)"
            className="w-full rounded-lg border border-white/80 bg-white/80 px-3 py-2 text-sm text-surface-900 text-right placeholder:text-surface-500 backdrop-blur-sm focus:border-violet-400/60 focus:bg-white/90 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={handleCreate}
            disabled={createArticle.isPending || !form.title || !form.content}
          >
            {createArticle.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            שמור
          </Button>
        </div>
      </Card>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12 text-surface-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="mr-2 text-sm">טוען מאמרים...</span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && articles.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <BookOpen className="h-10 w-10 text-surface-300 mb-3" />
          <p className="text-sm text-surface-500 max-w-md">
            הוסיפו מאמרים, עדכוני רגולציה או חדשות מהתחום. המערכת תחלץ חוקים
            רלוונטיים ללקוחות שלכם.
          </p>
        </Card>
      )}

      {/* Articles List */}
      <div className="space-y-4">
        {articles.map((article) => (
          <div key={article.id} className="space-y-3">
            <Card padding="sm">
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-surface-400 shrink-0" />
                    <h3 className="text-sm font-bold text-surface-900 truncate">
                      {article.title}
                    </h3>
                  </div>
                  {article.tipsExtracted > 0 && (
                    <Badge variant="success">
                      {article.tipsExtracted} חוקים חולצו
                    </Badge>
                  )}
                </div>

                {/* Content Preview */}
                <p className="text-sm text-surface-600 leading-relaxed line-clamp-3">
                  {article.content.slice(0, 200)}
                  {article.content.length > 200 && "..."}
                </p>

                {/* Meta */}
                <div className="flex items-center gap-3 text-xs text-surface-400">
                  <span>{formatDate(article.createdAt)}</span>
                  {article.source && (
                    <>
                      <span className="text-surface-300">|</span>
                      {article.source.startsWith("http") ? (
                        <a
                          href={article.source}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary-600 hover:text-primary-700"
                        >
                          <ExternalLink className="h-3 w-3" />
                          מקור
                        </a>
                      ) : (
                        <span>{article.source}</span>
                      )}
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1 border-t border-surface-100">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleExtract(article.id)}
                    disabled={extractingId === article.id}
                    className="bg-gradient-to-l from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700"
                  >
                    {extractingId === article.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {extractingId === article.id
                      ? "מנתח את המאמר..."
                      : "חלץ חוקים"}
                  </Button>

                  {deleteConfirmId === article.id ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-red-600">בטוח?</span>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(article.id)}
                        disabled={deleteArticle.isPending}
                      >
                        {deleteArticle.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        כן
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirmId(null)}
                      >
                        <X className="h-3 w-3" />
                        לא
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setDeleteConfirmId(article.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                      מחק
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            {/* Extracted Rules */}
            {extractedRules[article.id]?.length > 0 && (
              <div className="mr-4 space-y-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-emerald-500" />
                  <h4 className="text-sm font-bold text-emerald-700">
                    חוקים שחולצו ({extractedRules[article.id].length})
                  </h4>
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {extractedRules[article.id].map((rule) => (
                    <Card
                      key={rule.title}
                      padding="sm"
                      className="border-2 border-emerald-200 bg-emerald-50/30"
                    >
                      <div className="space-y-3">
                        {/* Rule Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <BookOpen className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            {rule.editing ? (
                              <input
                                type="text"
                                value={rule.editTitle ?? rule.title}
                                onChange={(e) =>
                                  updateEditRule(
                                    article.id,
                                    rule.title,
                                    "editTitle",
                                    e.target.value
                                  )
                                }
                                className="w-full rounded border border-white/80 bg-white/80 px-2 py-1 text-sm text-surface-900 text-right backdrop-blur-sm focus:border-violet-400/60 focus:bg-white/90 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
                              />
                            ) : (
                              <h5 className="text-sm font-bold text-surface-900">
                                {rule.title}
                              </h5>
                            )}
                          </div>
                          <Badge
                            variant={
                              categoryVariant[
                                rule.editing
                                  ? (rule.editCategory ?? rule.category)
                                  : rule.category
                              ] ?? "default"
                            }
                          >
                            {rule.editing
                              ? (rule.editCategory ?? rule.category)
                              : rule.category}
                          </Badge>
                        </div>

                        {/* Body */}
                        {rule.editing ? (
                          <Textarea
                            value={rule.editBody ?? rule.body}
                            onChange={(e) =>
                              updateEditRule(
                                article.id,
                                rule.title,
                                "editBody",
                                e.target.value
                              )
                            }
                            rows={3}
                          />
                        ) : (
                          <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">
                            {rule.body}
                          </p>
                        )}

                        {/* Trigger Hint */}
                        {rule.editing ? (
                          <input
                            type="text"
                            value={rule.editTriggerHint ?? rule.triggerHint}
                            onChange={(e) =>
                              updateEditRule(
                                article.id,
                                rule.title,
                                "editTriggerHint",
                                e.target.value
                              )
                            }
                            placeholder="מתי להשתמש?"
                            className="w-full rounded border border-white/80 bg-white/80 px-2 py-1 text-xs text-surface-900 text-right placeholder:text-surface-500 backdrop-blur-sm focus:border-violet-400/60 focus:bg-white/90 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
                          />
                        ) : (
                          rule.triggerHint && (
                            <p className="text-xs text-surface-400">
                              מתי להשתמש: {rule.triggerHint}
                            </p>
                          )
                        )}

                        {/* Category selector in edit mode */}
                        {rule.editing && (
                          <select
                            value={rule.editCategory ?? rule.category}
                            onChange={(e) =>
                              updateEditRule(
                                article.id,
                                rule.title,
                                "editCategory",
                                e.target.value
                              )
                            }
                            className="rounded border border-white/80 bg-white/80 px-2 py-1 text-xs text-surface-900 text-right backdrop-blur-sm focus:border-violet-400/60 focus:bg-white/90 focus:outline-none focus:ring-2 focus:ring-violet-400/25"
                          >
                            <option value="חידוש">חידוש</option>
                            <option value="כיסוי">כיסוי</option>
                            <option value="חיסכון">חיסכון</option>
                            <option value="שירות">שירות</option>
                            <option value="כללי">כללי</option>
                          </select>
                        )}

                        {/* Relevance Info */}
                        {!rule.editing && (
                          <div className="rounded-lg bg-emerald-50 p-2.5 border border-emerald-100">
                            <div className="flex items-start gap-1.5">
                              <Info className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                              <div className="space-y-1">
                                <p className="text-xs text-emerald-700 leading-relaxed">
                                  {rule.relevance}
                                </p>
                                <p className="text-xs font-medium text-emerald-600">
                                  {rule.estimatedCustomers}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1 border-t border-emerald-100">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() =>
                              handleApproveRule(article.id, rule)
                            }
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
                            onClick={() =>
                              toggleEditRule(article.id, rule.title)
                            }
                          >
                            <Pencil className="h-3 w-3" />
                            {rule.editing ? "סגור עריכה" : "ערוך"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleDismissRule(article.id, rule.title)
                            }
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
          </div>
        ))}
      </div>
    </div>
  );
}
