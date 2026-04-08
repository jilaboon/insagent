export interface MessageDraftItem {
  id: string;
  customerId: string;
  customerName: string;
  insightId: string | null;
  insightTitle: string | null;
  body: string;
  tone: string | null;
  purpose: string | null;
  status: "DRAFT" | "APPROVED" | "SENT" | "SKIPPED";
  generatedBy: string;
  createdAt: string;
  updatedAt: string;
}
