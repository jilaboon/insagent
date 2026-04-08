"use client";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload } from "lucide-react";
import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileDropzone } from "./_components/file-dropzone";
import { ImportProgress } from "./_components/import-progress";
import { ImportSummary } from "./_components/import-summary";
import { ImportHistory } from "./_components/import-history";

type Stage = "upload" | "processing" | "summary";

interface UploadResult {
  jobId: string;
  message: string;
  fileCount: number;
  fileTypes: string[];
}

interface CompletedJob {
  totalRows: number | null;
  newCustomers: number | null;
  updatedCustomers: number | null;
  customerCount: number;
  policyCount: number;
}

export default function ImportPage() {
  const [stage, setStage] = useState<Stage>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [completedJob, setCompletedJob] = useState<CompletedJob | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const uploadMutation = useMutation({
    mutationFn: async (filesToUpload: File[]) => {
      const formData = new FormData();
      for (const file of filesToUpload) {
        formData.append("files", file);
      }
      const res = await fetch("/api/import/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "שגיאה בהעלאה");
      }
      return res.json() as Promise<UploadResult>;
    },
    onSuccess: (data) => {
      setJobId(data.jobId);
      setStage("processing");
    },
  });

  const handleUpload = useCallback(() => {
    if (files.length === 0) return;
    uploadMutation.mutate(files);
  }, [files, uploadMutation]);

  const handleComplete = useCallback((job: CompletedJob) => {
    setCompletedJob(job);
    setStage("summary");
    setHistoryKey((k) => k + 1);
  }, []);

  const handleReset = useCallback(() => {
    setStage("upload");
    setFiles([]);
    setJobId(null);
    setCompletedJob(null);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-surface-900">מרכז יבוא נתונים</h1>
        <p className="text-sm text-surface-500">
          העלו קובצי CSV לייבוא נתוני לקוחות ופוליסות
        </p>
      </div>

      {/* Upload stage */}
      {stage === "upload" && (
        <Card>
          <FileDropzone onChange={setFiles} />

          {files.length > 0 && (
            <div className="mt-4 flex items-center gap-3">
              <Button
                variant="primary"
                onClick={handleUpload}
                disabled={uploadMutation.isPending}
              >
                <Upload className="h-4 w-4" />
                {uploadMutation.isPending ? "מעלה..." : "התחל ייבוא"}
              </Button>
              {uploadMutation.isError && (
                <p className="text-xs text-red-600">
                  {uploadMutation.error.message}
                </p>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Processing stage */}
      {stage === "processing" && jobId && (
        <ImportProgress jobId={jobId} onComplete={handleComplete} />
      )}

      {/* Summary stage */}
      {stage === "summary" && completedJob && (
        <Card>
          <CardHeader>
            <CardTitle>סיכום ייבוא</CardTitle>
            <Button variant="secondary" size="sm" onClick={handleReset}>
              ייבוא נוסף
            </Button>
          </CardHeader>
          <ImportSummary
            totalCustomers={completedJob.customerCount}
            newCustomers={completedJob.newCustomers ?? 0}
            updatedCustomers={completedJob.updatedCustomers ?? 0}
            policies={completedJob.policyCount}
          />
        </Card>
      )}

      {/* Import history */}
      <Card>
        <CardHeader>
          <CardTitle>היסטוריית ייבוא</CardTitle>
        </CardHeader>
        <ImportHistory refreshKey={historyKey} />
      </Card>
    </div>
  );
}
