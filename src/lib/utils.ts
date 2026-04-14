import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return `₪${amount.toLocaleString("he-IL")}`;
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function daysBetween(from: Date, to: Date): number {
  const diff = to.getTime() - from.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "מעולם לא";
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "זה עתה";
  if (mins < 60) return `לפני ${mins} דקות`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `לפני ${days} ימים`;
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
}

export function dataFreshnessLabel(date: Date | null | undefined): {
  label: string;
  level: "fresh" | "partial" | "stale";
} {
  if (!date) return { label: "לא ידוע", level: "stale" };
  const months = daysBetween(date, new Date()) / 30;
  if (months <= 3) return { label: "עדכני", level: "fresh" };
  if (months <= 12) return { label: `לפני ${Math.round(months)} חודשים`, level: "partial" };
  return { label: `לפני ${Math.round(months)} חודשים`, level: "stale" };
}
