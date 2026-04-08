export interface ImportJobItem {
  id: string;
  fileName: string;
  fileType: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "PARTIAL";
  totalRows: number | null;
  importedRows: number | null;
  failedRows: number | null;
  newCustomers: number | null;
  updatedCustomers: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ImportProgress {
  jobId: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "PARTIAL";
  totalRows: number;
  importedRows: number;
  failedRows: number;
  newCustomers: number;
  updatedCustomers: number;
  currentPhase: string;
}
