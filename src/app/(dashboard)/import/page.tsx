"use client";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Upload, Square } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { ImportSummary } from "./_components/import-summary";
import { ImportHistory } from "./_components/import-history";
import { FileDropzone } from "./_components/file-dropzone";

type Stage = "upload" | "parsing" | "uploading" | "summary";

interface ImportResult {
  totalRows: number;
  customers: number;
  created: number;
  updated: number;
}

// ============================================================
// Client-side CSV parsing (handles Windows-1255 encoding)
// ============================================================

function parseCSVText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

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
  try {
    const decoder = new TextDecoder("windows-1255");
    const text = decoder.decode(buffer);
    if (/[\u0590-\u05FF]/.test(text)) return text;
  } catch { /* fallback */ }
  return new TextDecoder("utf-8").decode(buffer);
}

// ============================================================
// Component
// ============================================================

export default function ImportPage() {
  const [stage, setStage] = useState<Stage>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [historyKey, setHistoryKey] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const abortRef = useRef(false);

  const handleStop = useCallback(() => {
    abortRef.current = true;
    setStatusMessage("עוצר...");
  }, []);

  const handleUpload = useCallback(async () => {
    if (files.length === 0) return;
    setError(null);
    abortRef.current = false;

    let totalCreated = 0;
    let totalUpdated = 0;
    let totalCustomers = 0;
    let totalRows = 0;
    let currentJobId: string | null = null;

    try {
      setStage("parsing");

      for (let f = 0; f < files.length; f++) {
        if (abortRef.current) break;

        // Parse file
        setStatusMessage(`קורא קובץ ${files[f].name}...`);
        setProgressPercent(Math.round((f / files.length) * 20));

        const text = await readFileAsText(files[f]);
        const { headers, rows } = parseCSVText(text);
        totalRows += rows.length;

        setStatusMessage(`${files[f].name}: ${rows.length.toLocaleString("he-IL")} שורות — שולח לעיבוד...`);
        setStage("uploading");
        setProgressPercent(20 + Math.round(((f) / files.length) * 70));

        if (abortRef.current) break;

        // Send entire file in one request
        const response = await fetch("/api/import/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: files[f].name,
            headers,
            rows,
            jobId: currentJobId,
          }),
        });

        if (!response.ok) {
          const errBody = await response.json();
          throw new Error(errBody.error || "שגיאה בעיבוד");
        }

        const result = (await response.json()) as {
          jobId: string;
          customers: number;
          created: number;
          updated: number;
        };

        currentJobId = result.jobId;
        totalCreated += result.created;
        totalUpdated += result.updated;
        totalCustomers += result.customers;

        setStatusMessage(
          `${files[f].name}: ${result.customers} לקוחות (${result.created} חדשים, ${result.updated} עודכנו)`
        );
        setProgressPercent(20 + Math.round(((f + 1) / files.length) * 70));
      }

      if (abortRef.current) {
        setStatusMessage("הייבוא הופסק");
        setStage("upload");
        setHistoryKey((k) => k + 1);
        return;
      }

      // Mark job complete
      if (currentJobId) {
        await fetch(`/api/import/${currentJobId}/complete`, { method: "POST" });
      }

      setProgressPercent(100);
      setImportResult({
        totalRows,
        customers: totalCustomers,
        created: totalCreated,
        updated: totalUpdated,
      });
      setStage("summary");
      setHistoryKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה לא צפויה");
      setStage("upload");
    }
  }, [files]);

  const handleReset = useCallback(() => {
    setStage("upload");
    setFiles([]);
    setImportResult(null);
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

      {/* Processing stage */}
      {(stage === "parsing" || stage === "uploading") && (
        <Card padding="lg">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-surface-900">
                {stage === "parsing" ? "קורא ומפענח קבצים..." : "מעבד נתונים..."}
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-surface-500 number">{progressPercent}%</span>
                <Button variant="danger" size="sm" onClick={handleStop}>
                  <Square className="h-3 w-3" />
                  עצור
                </Button>
              </div>
            </div>
            <ProgressBar value={progressPercent} variant="primary" />
            <p className="text-sm text-surface-600">{statusMessage}</p>
          </div>
        </Card>
      )}

      {/* Summary stage */}
      {stage === "summary" && importResult && (
        <Card>
          <CardHeader>
            <CardTitle>סיכום ייבוא</CardTitle>
            <Button variant="secondary" size="sm" onClick={handleReset}>
              ייבוא נוסף
            </Button>
          </CardHeader>
          <ImportSummary
            totalCustomers={importResult.customers}
            newCustomers={importResult.created}
            updatedCustomers={importResult.updated}
            policies={importResult.totalRows}
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
