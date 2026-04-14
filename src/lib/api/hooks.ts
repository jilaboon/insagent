"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { InsightFilters, InsightDetail } from "@/lib/types/insight";
import type { MessageDraftItem } from "@/lib/types/message";

// ============================================================
// Response Types
// ============================================================

export interface PaginatedInsights {
  items: InsightDetail[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DashboardTopInsight {
  id: string;
  customerId: string;
  customerName: string;
  title: string;
  strengthScore: number;
  urgencyLevel: number;
  category: string;
}

export interface DashboardLastImport {
  id: string;
  fileName: string;
  status: string;
  createdAt: string;
}

export interface DashboardStats {
  totalCustomers: number;
  totalPolicies: number;
  totalInsights: number;
  highUrgencyCount: number;
  pendingMessages: number;
  lastImportDate: string | null;
  lastImport: DashboardLastImport | null;
  recentImports: Array<{
    id: string;
    fileName: string;
    status: string;
    createdAt: string;
    newCustomers: number | null;
    updatedCustomers: number | null;
  }>;
  topInsights: DashboardTopInsight[];
}

export interface ImportJob {
  id: string;
  fileName: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  totalRows: number;
  processedRows: number;
  errorRows: number;
  createdAt: string;
  completedAt: string | null;
  errors: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface CustomerDetail {
  id: string;
  firstName: string;
  lastName: string;
  israeliId: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  age: number | null;
  dateOfBirth: string | null;
  assignedManagerId: string | null;
  lastImportDate: string | null;
  importFileCount: number;
  familyMembers: {
    id: string;
    name: string;
    israeliId: string | null;
    relationship: string | null;
    source: string;
  }[];
  insuranceMap: Record<
    string,
    {
      exists: boolean;
      policyCount: number;
      totalAnnualPremium: number;
      totalMonthlyPremium: number;
      totalAccumulated: number;
      insurers: string[];
      nearestExpiry: string | null;
      dataFreshness: string | null;
    }
  >;
  policies: {
    id: string;
    policyNumber: string;
    insurer: string;
    category: string;
    subType: string | null;
    status: string;
    productName: string | null;
    startDate: string | null;
    endDate: string | null;
    premiumMonthly: number | null;
    premiumAnnual: number | null;
    accumulatedSavings: number | null;
    vehicleYear: number | null;
    vehiclePlate: string | null;
    vehicleModel: string | null;
    dataFreshness: string | null;
    investmentTracks: { name: string; amount: number | null; ytdReturn: number | null }[];
    managementFees: { type: string; rate: number | null; amount: number | null }[];
  }[];
  insights: {
    id: string;
    category: string;
    title: string;
    summary: string;
    explanation: string | null;
    whyNow: string | null;
    urgencyLevel: number;
    strengthScore: number;
    generatedBy: string;
    status: string;
    createdAt: string;
    messageDraft: {
      id: string;
      body: string;
      status: string;
    } | null;
  }[];
  messageDrafts: {
    id: string;
    insightId: string | null;
    body: string;
    tone: string | null;
    purpose: string | null;
    status: string;
    generatedBy: string;
    createdAt: string;
    updatedAt: string;
  }[];
}

// ============================================================
// Query Keys
// ============================================================

export interface OfficeTipItem {
  id: string;
  title: string;
  body: string;
  category: string | null;
  triggerHint: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TipsResponse {
  items: OfficeTipItem[];
  total: number;
  activeCount: number;
}

export interface DataPatternItem {
  id: string;
  title: string;
  description: string;
  count: number;
  percentage: number;
  category: "cross-sell" | "optimization" | "service" | "renewal";
  severity: "high" | "medium" | "low";
}

export interface DataPatternsResponse {
  patterns: DataPatternItem[];
  totalCustomers: number;
}

export interface PatternSuggestion {
  title: string;
  body: string;
  category: string;
  triggerHint: string;
}

export const queryKeys = {
  insights: (filters: Partial<InsightFilters>) => ["insights", filters] as const,
  dashboardStats: () => ["dashboard", "stats"] as const,
  importJob: (jobId: string) => ["import", "job", jobId] as const,
  importHistory: () => ["import", "history"] as const,
  customerDetail: (id: string) => ["customer", id] as const,
  customerMessages: (customerId: string) =>
    ["messages", "customer", customerId] as const,
  tips: () => ["tips"] as const,
  dataPatterns: () => ["data-patterns"] as const,
} as const;

// ============================================================
// Fetch helpers
// ============================================================

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function buildInsightParams(filters: Partial<InsightFilters>): string {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.search) params.set("search", filters.search);
  if (filters.sortBy) params.set("sortBy", filters.sortBy);
  if (filters.sortDir) params.set("sortDir", filters.sortDir);
  if (filters.scoreMin != null && filters.scoreMin > 0)
    params.set("scoreMin", String(filters.scoreMin));
  if (filters.scoreMax != null && filters.scoreMax < 100)
    params.set("scoreMax", String(filters.scoreMax));

  // Single-value params (API expects single values)
  if (filters.branch?.length === 1) params.set("branch", filters.branch[0]);
  if (filters.categories?.length === 1)
    params.set("category", filters.categories[0]);
  if (filters.urgency?.length === 1)
    params.set("urgency", String(filters.urgency[0]));

  return params.toString();
}

// ============================================================
// Insights
// ============================================================

export function useInsights(filters: Partial<InsightFilters>) {
  return useQuery({
    queryKey: queryKeys.insights(filters),
    queryFn: () =>
      fetchJSON<PaginatedInsights>(
        `/api/insights?${buildInsightParams(filters)}`
      ),
    placeholderData: (prev) => prev,
  });
}

// ============================================================
// Dashboard Stats
// ============================================================

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboardStats(),
    queryFn: () => fetchJSON<DashboardStats>("/api/dashboard/stats"),
  });
}

// ============================================================
// Customer Detail
// ============================================================

export function useCustomerDetail(customerId: string | null) {
  return useQuery({
    queryKey: queryKeys.customerDetail(customerId ?? ""),
    queryFn: () =>
      fetchJSON<CustomerDetail>(`/api/customers/${customerId}`),
    enabled: !!customerId,
  });
}

// ============================================================
// Import Upload
// ============================================================

export function useImportUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: FormData) => {
      return fetchJSON<ImportJob>("/api/import/upload", {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["import", "history"] });
    },
  });
}

// ============================================================
// Import Job (polls while PROCESSING)
// ============================================================

export function useImportJob(jobId: string | null) {
  return useQuery({
    queryKey: queryKeys.importJob(jobId ?? ""),
    queryFn: () => fetchJSON<ImportJob>(`/api/import/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data as ImportJob | undefined;
      if (data?.status === "PROCESSING" || data?.status === "PENDING") {
        return 2000;
      }
      return false;
    },
  });
}

// ============================================================
// Import History
// ============================================================

export function useImportHistory() {
  return useQuery({
    queryKey: queryKeys.importHistory(),
    queryFn: () => fetchJSON<ImportJob[]>("/api/import/history"),
  });
}

// ============================================================
// Generate Insights
// ============================================================

export function useGenerateInsights() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { customerId?: string; includeAI?: boolean }) => {
      return fetchJSON<{
        message: string;
        generated: number;
        skipped: number;
      }>("/api/insights/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insights"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "stats"] });
    },
  });
}

// ============================================================
// Generate Message
// ============================================================

export function useGenerateMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      insightId?: string;
      insightIds?: string[];
      agentName?: string;
    }) => {
      return fetchJSON<MessageDraftItem | { message: string; generated: number }>(
        "/api/messages/generate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insights"] });
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
  });
}

// ============================================================
// Update Message
// ============================================================

export function useUpdateMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      bodyText,
      feedbackFlag,
      feedbackNote,
    }: {
      id: string;
      status?: string;
      bodyText?: string;
      feedbackFlag?: string;
      feedbackNote?: string;
    }) => {
      return fetchJSON<MessageDraftItem>(`/api/messages/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, bodyText, feedbackFlag, feedbackNote }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insights"] });
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
  });
}

// ============================================================
// Customer Messages
// ============================================================

export function useCustomerMessages(customerId: string | null) {
  return useQuery({
    queryKey: queryKeys.customerMessages(customerId ?? ""),
    queryFn: () =>
      fetchJSON<MessageDraftItem[]>(`/api/messages/${customerId}`),
    enabled: !!customerId,
  });
}

// ============================================================
// Tips
// ============================================================

export function useTips() {
  return useQuery({
    queryKey: queryKeys.tips(),
    queryFn: () => fetchJSON<TipsResponse>("/api/tips"),
  });
}

export function useCreateTip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      title: string;
      body: string;
      category?: string;
      triggerHint?: string;
    }) => {
      return fetchJSON<OfficeTipItem>("/api/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tips"] });
    },
  });
}

export function useUpdateTip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      title?: string;
      body?: string;
      category?: string;
      triggerHint?: string;
      isActive?: boolean;
    }) => {
      return fetchJSON<OfficeTipItem>(`/api/tips/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tips"] });
    },
  });
}

export function useDeleteTip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return fetchJSON<{ success: boolean }>(`/api/tips/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tips"] });
    },
  });
}

export function useSeedTips() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return fetchJSON<{ message: string; count: number }>("/api/tips/seed", {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tips"] });
    },
  });
}

// ============================================================
// Suggest Tips (AI)
// ============================================================

export interface SuggestedTipItem {
  title: string;
  body: string;
  category: string;
  triggerHint: string;
  reasoning: string;
}

export function useSuggestTips() {
  return useMutation({
    mutationFn: async () => {
      return fetchJSON<{ suggestions: SuggestedTipItem[] }>(
        "/api/tips/suggest",
        { method: "POST" }
      );
    },
  });
}

// ============================================================
// Knowledge Articles
// ============================================================

export interface KnowledgeArticleItem {
  id: string;
  title: string;
  content: string;
  source: string | null;
  summary: string | null;
  tipsExtracted: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExtractedTipItem {
  title: string;
  body: string;
  category: string;
  triggerHint: string;
  relevance: string;
  estimatedCustomers: string;
}

export function useKnowledgeArticles() {
  return useQuery({
    queryKey: ["knowledge"],
    queryFn: () =>
      fetchJSON<{ items: KnowledgeArticleItem[] }>("/api/knowledge"),
  });
}

export function useCreateArticle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      title: string;
      content: string;
      source?: string;
    }) => {
      return fetchJSON<KnowledgeArticleItem>("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });
}

export function useDeleteArticle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return fetchJSON<{ success: boolean }>(`/api/knowledge/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });
}

export function useExtractTips() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (articleId: string) => {
      return fetchJSON<{ tips: ExtractedTipItem[] }>(
        `/api/knowledge/${articleId}/extract`,
        { method: "POST" }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });
}

// ============================================================
// Discover Articles (AI)
// ============================================================

export interface DiscoveredArticleItem {
  title: string;
  summary: string;
  content: string;
  source: string;
  relevance: string;
}

export function useDiscoverArticles() {
  return useMutation({
    mutationFn: async (params: { topic?: string }) => {
      return fetchJSON<{ articles: DiscoveredArticleItem[] }>(
        "/api/knowledge/discover",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        }
      );
    },
  });
}

// ============================================================
// Data Patterns
// ============================================================

export function useDataPatterns() {
  return useQuery({
    queryKey: queryKeys.dataPatterns(),
    queryFn: () => fetchJSON<DataPatternsResponse>("/api/patterns"),
  });
}

export function useSuggestFromPattern() {
  return useMutation({
    mutationFn: async (params: {
      patternId: string;
      patternTitle: string;
      patternDescription: string;
      count: number;
    }) => {
      return fetchJSON<PatternSuggestion>(
        `/api/patterns/${params.patternId}/suggest`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patternTitle: params.patternTitle,
            patternDescription: params.patternDescription,
            count: params.count,
          }),
        }
      );
    },
  });
}
