"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  Sparkles,
  Pencil,
  Check,
  SkipForward,
  Copy,
  Loader2,
  ThumbsDown,
} from "lucide-react";
import { useGenerateMessage, useUpdateMessage } from "@/lib/api/hooks";
import type { MessageDraftItem } from "@/lib/types/message";

const FEEDBACK_OPTIONS = [
  { flag: "bad_hebrew", label: "עברית לא נכונה" },
  { flag: "bad_content", label: "תוכן לא מתאים" },
  { flag: "wrong_tone", label: "טון לא מתאים" },
] as const;

type ComposerState = "idle" | "generating" | "preview" | "editing" | "approved";

interface MessageComposerProps {
  insightId: string;
  customerName: string;
  existingMessage?: MessageDraftItem | null;
  onStatusChange?: (status: string) => void;
  className?: string;
}

export function MessageComposer({
  insightId,
  customerName,
  existingMessage,
  onStatusChange,
  className,
}: MessageComposerProps) {
  const generateMessage = useGenerateMessage();
  const updateMessage = useUpdateMessage();

  const [state, setState] = useState<ComposerState>(() => {
    if (existingMessage?.status === "APPROVED") return "approved";
    if (existingMessage) return "preview";
    return "idle";
  });
  const [message, setMessage] = useState<MessageDraftItem | null>(
    existingMessage ?? null
  );
  const [editText, setEditText] = useState("");
  const [copied, setCopied] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState<string | null>(null);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  async function handleGenerate() {
    setState("generating");
    try {
      const result = await generateMessage.mutateAsync({ insightId });
      // API returns { messageId, body } — map to MessageDraftItem shape
      const raw = result as Record<string, unknown>;
      const draft: MessageDraftItem = {
        id: (raw.messageId || raw.id || "") as string,
        customerId: "",
        customerName: customerName,
        insightId,
        insightTitle: null,
        body: (raw.body || "") as string,
        tone: null,
        purpose: null,
        status: "DRAFT",
        generatedBy: "AI",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setMessage(draft);
      setEditText(draft.body);
      setState("preview");
    } catch {
      setState("idle");
    }
  }

  function handleEdit() {
    setState("editing");
    if (message) setEditText(message.body);
  }

  async function handleApprove() {
    if (!message) return;
    const body = state === "editing" ? editText : message.body;
    await updateMessage.mutateAsync({
      id: message.id,
      status: "APPROVED",
      bodyText: body,
    });
    setMessage({ ...message, body, status: "APPROVED" });
    setState("approved");
    onStatusChange?.("APPROVED");
  }

  async function handleSkip() {
    if (!message) return;
    await updateMessage.mutateAsync({ id: message.id, status: "SKIPPED" });
    setMessage({ ...message, status: "SKIPPED" });
    setState("idle");
    onStatusChange?.("SKIPPED");
  }

  async function handleCopy() {
    if (!message) return;
    await navigator.clipboard.writeText(message.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleFeedbackSubmit() {
    if (!message || !feedbackOpen) return;
    await updateMessage.mutateAsync({
      id: message.id,
      feedbackFlag: feedbackOpen,
      feedbackNote: feedbackNote || undefined,
    });
    setFeedbackOpen(null);
    setFeedbackNote("");
    setFeedbackSent(true);
    setTimeout(() => setFeedbackSent(false), 3000);
  }

  if (state === "idle") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <button
          onClick={handleGenerate}
          disabled={generateMessage.isPending}
          className="group relative inline-flex items-center gap-2 rounded-lg bg-gradient-to-l from-primary-600 to-primary-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:from-primary-700 hover:to-primary-600 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles className="h-4 w-4 transition-transform group-hover:scale-110" />
          צור הודעה עם AI
          <span className="absolute -top-1 -left-1 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-400" />
          </span>
        </button>
      </div>
    );
  }

  if (state === "generating") {
    return (
      <div className={cn("space-y-3", className)}>
        <div className="flex items-center gap-2 text-xs text-surface-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          יוצר הודעה עבור {customerName}...
        </div>
        <div className="space-y-2">
          <div className="h-3 w-3/4 animate-pulse rounded bg-surface-200" />
          <div className="h-3 w-full animate-pulse rounded bg-surface-200" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-surface-200" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* WhatsApp-style bubble */}
      <div className="relative max-w-md rounded-xl rounded-tl-sm bg-emerald-50 px-3 py-2 text-sm leading-relaxed text-surface-800 shadow-xs">
        {state === "editing" ? (
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={5}
            className="w-full resize-none border-0 bg-transparent p-0 text-sm leading-relaxed text-surface-800 focus:outline-none focus:ring-0"
          />
        ) : (
          <p className="whitespace-pre-wrap">{message?.body}</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {state === "approved" ? (
          <>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
              <Check className="h-3.5 w-3.5" />
              הודעה אושרה
            </span>
            <Button variant="ghost" size="sm" onClick={handleCopy}>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "הועתק" : "העתק"}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="primary"
              size="sm"
              onClick={handleApprove}
              disabled={updateMessage.isPending}
            >
              <Check className="h-3.5 w-3.5" />
              אשר
            </Button>
            {state === "preview" && (
              <Button variant="secondary" size="sm" onClick={handleEdit}>
                <Pencil className="h-3.5 w-3.5" />
                ערוך
              </Button>
            )}
            {state === "editing" && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setState("preview")}
              >
                בטל עריכה
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleSkip}>
              <SkipForward className="h-3.5 w-3.5" />
              דלג
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCopy}>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "הועתק" : "העתק"}
            </Button>
          </>
        )}
      </div>

      {/* Feedback buttons — show in preview or approved state */}
      {(state === "preview" || state === "approved") && !feedbackSent && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {FEEDBACK_OPTIONS.map((opt) => (
              <Button
                key={opt.flag}
                variant="ghost"
                size="sm"
                className={cn(
                  "text-surface-400 hover:text-red-500",
                  feedbackOpen === opt.flag && "text-red-500 bg-red-50"
                )}
                onClick={() => {
                  setFeedbackOpen(feedbackOpen === opt.flag ? null : opt.flag);
                  setFeedbackNote("");
                }}
              >
                <ThumbsDown className="h-3 w-3" />
                {opt.label}
              </Button>
            ))}
          </div>

          {feedbackOpen && (
            <div className="flex items-center gap-2 max-w-md">
              <input
                type="text"
                value={feedbackNote}
                onChange={(e) => setFeedbackNote(e.target.value)}
                placeholder="הערה (אופציונלי)..."
                className="flex-1 rounded-lg border border-surface-300 bg-white px-3 py-1.5 text-xs text-surface-900 text-right placeholder:text-surface-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleFeedbackSubmit}
                disabled={updateMessage.isPending}
              >
                שלח
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFeedbackOpen(null);
                  setFeedbackNote("");
                }}
              >
                ביטול
              </Button>
            </div>
          )}
        </div>
      )}

      {feedbackSent && (
        <p className="text-xs text-emerald-600 font-medium">
          תודה על המשוב
        </p>
      )}
    </div>
  );
}
