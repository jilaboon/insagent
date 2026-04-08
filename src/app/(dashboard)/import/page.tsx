"use client";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Upload } from "lucide-react";
import { useCallback, useState } from "react";
import { ImportProgress } from "./_components/import-progress";
import { ImportSummary } from "./_components/import-summary";
import { ImportHistory } from "./_components/import-history";
import { FileDropzone } from "./_components/file-dropzone";

type Stage = "upload" | "parsing" | "uploading" | "processing" | "summary";

interface CompletedJob {
  totalRows: number | null;
  newCustomers: number | null;
  updatedCustomers: number | null;
  customerCount: number;
  policyCount: number;
}

// ============================================================
// Client-side CSV parsing (handles Windows-1255 encoding)
// ============================================================

function parseCSVText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  // Simple CSV parser that handles quoted fields
  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  const headers = parseLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      // Only include non-empty values to reduce payload size
      if (values[j] && values[j].trim()) {
        row[headers[j]] = values[j].trim();
      }
    }
    rows.push(row);
  }

  return { headers, rows };
}

async function readFileAsText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();

  // Try Windows-1255 first (BAFI default), fallback to UTF-8
  try {
    const decoder = new TextDecoder("windows-1255");
    const text = decoder.decode(buffer);
    // Check if it decoded properly — Hebrew chars should be present
    if (/[\u0590-\u05FF]/.test(text)) return text;
  } catch {
    // windows-1255 not supported in this browser
  }

  // Fallback: UTF-8
  return new TextDecoder("utf-8").decode(buffer);
}

// ============================================================
// Component
// ============================================================

const CHUNK_SIZE = 200; // rows per API call — keep small to avoid Vercel payload limit

export default function ImportPage() {
  const [stage, setStage] = useState<Stage>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [completedJob, setCompletedJob] = useState<CompletedJob | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = useCallback(async () => {
    if (files.length === 0) return;
    setError(null);

    let currentJobId: string | null = null;

    try {
      // Phase 1: Read and parse files on client
      setStage("parsing");
      const allBatches: Array<{ fileName: string; headers: string[]; rows: Record<string, string>[] }> = [];
      let totalRows = 0;

      for (let f = 0; f < files.length; f++) {
        setStatusMessage(`קורא קובץ ${f + 1} מתוך ${files.length}: ${files[f].name}...`);
        setProgressPercent(Math.round(((f) / files.length) * 20));

        const text = await readFileAsText(files[f]);
        setStatusMessage(`מפענח קובץ ${files[f].name}...`);

        const { headers, rows } = parseCSVText(text);
        totalRows += rows.length;
        allBatches.push({ fileName: files[f].name, headers, rows });

        setStatusMessage(`נמצאו ${rows.length.toLocaleString("he-IL")} שורות ב-${files[f].name}`);
      }

      // Phase 2: Send to server in chunks
      setStage("uploading");
      let sentRows = 0;

      for (const batch of allBatches) {
        const chunks = [];
        for (let i = 0; i < batch.rows.length; i += CHUNK_SIZE) {
          chunks.push(batch.rows.slice(i, i + CHUNK_SIZE));
        }

        for (let c = 0; c < chunks.length; c++) {
          sentRows += chunks[c].length;
          const percent = 20 + Math.round((sentRows / totalRows) * 60);
          setProgressPercent(percent);
          setStatusMessage(
            `שולח ${sentRows.toLocaleString("he-IL")} מתוך ${totalRows.toLocaleString("he-IL")} שורות...`
          );

          const response = await fetch("/api/import/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: batch.fileName,
              headers: batch.headers,
              rows: chunks[c],
              jobId: currentJobId,
            }),
          });

          if (!response.ok) {
            const errBody = await response.json();
            throw new Error(errBody.error || "שגיאה בשליחת נתונים");
          }

          const result = (await response.json()) as { jobId: string };
          if (!currentJobId) {
            currentJobId = result.jobId;
          }
        }
      }

      // Phase 3: Server is processing — switch to polling
      setProgressPercent(80);
      setStatusMessage("השרת מעבד את הנתונים...");
      setJobId(currentJobId);
      setStage("processing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה לא צפויה");
      setStage("upload");
    }
  }, [files]);

  const handleComplete = useCallback((job: CompletedJob) => {
    setCompletedJob(job);
    setStage("summary");
    setHistoryKey((k) => k + 1);
    setProgressPercent(100);
    setStatusMessage("");
  }, []);

  const handleReset = useCallback(() => {
    setStage("upload");
    setFiles([]);
    setJobId(null);
    setCompletedJob(null);
    setProgressPercent(0);
    setStatusMessage("");
    setError(null);
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
              <Button variant="primary" onClick={handleUpload}>
                <Upload className="h-4 w-4" />
                התחל ייבוא
              </Button>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          )}
        </Card>
      )}

      {/* Parsing / Uploading stages */}
      {(stage === "parsing" || stage === "uploading") && (
        <Card padding="lg">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-surface-900">
                {stage === "parsing" ? "קורא ומפענח קבצים..." : "שולח נתונים לשרת..."}
              </h3>
              <span className="text-xs text-surface-500 number">{progressPercent}%</span>
            </div>
            <ProgressBar value={progressPercent} variant="primary" />
            <p className="text-sm text-surface-600">{statusMessage}</p>
          </div>
        </Card>
      )}

      {/* Server processing stage */}
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
