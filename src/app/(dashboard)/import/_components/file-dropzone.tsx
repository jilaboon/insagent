"use client";

import { cn } from "@/lib/utils";
import { Upload, FileText, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface FileDropzoneProps {
  onChange: (files: File[]) => void;
  className?: string;
}

export function FileDropzone({ onChange, className }: FileDropzoneProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming) return;
      const csvFiles = Array.from(incoming).filter(
        (f) => f.name.endsWith(".csv") || f.type === "text/csv"
      );
      if (csvFiles.length === 0) return;
      setFiles(csvFiles);
      onChange(csvFiles);
    },
    [onChange]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleClear = useCallback(() => {
    setFiles([]);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  return (
    <div className={cn("space-y-3", className)}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          // Prism dropzone: dashed violet border on a glass panel.
          // On drag-over, fills with a chromatic aurora glow and the
          // border tightens to solid violet.
          "relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[20px] border-2 border-dashed px-6 py-12 backdrop-blur-xl transition-all duration-300",
          isDragging
            ? "border-violet-400/80 bg-violet-500/10"
            : "border-white/70 bg-white/45 hover:border-violet-300/60 hover:bg-white/60"
        )}
        style={{
          boxShadow: isDragging
            ? "0 0 0 1px rgba(167,139,250,0.5), 0 20px 50px -18px rgba(167,139,250,0.45)"
            : "0 1px 0 rgba(255,255,255,0.8) inset, 0 6px 18px -8px rgba(80,70,180,0.15)",
        }}
      >
        {/* Aurora glow — only visible during drag-over */}
        {isDragging && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit]"
            style={{
              background:
                "radial-gradient(60% 80% at 50% 50%, rgba(167,139,250,0.35), transparent 70%), " +
                "conic-gradient(from 120deg at 50% 50%, rgba(240,171,252,0.2), rgba(129,140,248,0.2), rgba(34,211,238,0.18), rgba(167,139,250,0.2), rgba(240,171,252,0.2))",
              filter: "blur(18px)",
              opacity: 0.7,
            }}
          />
        )}
        <div
          className={cn(
            "relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/70 backdrop-blur-md transition-colors",
            isDragging ? "bg-violet-500/15" : "bg-white/55"
          )}
        >
          <Upload
            className={cn(
              "h-6 w-6 transition-colors",
              isDragging ? "text-violet-700" : "text-violet-600"
            )}
          />
        </div>
        <div className="relative text-center">
          <p className="text-sm font-medium text-surface-800">
            גררו קבצי CSV לכאן
          </p>
          <p className="mt-1 text-xs text-surface-600">או בחרו קובץ</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="flex items-center gap-3 rounded-lg border border-white/65 bg-white/60 px-4 py-3 backdrop-blur-md"
            >
              <FileText className="h-4 w-4 shrink-0 text-violet-600" />
              <span className="flex-1 truncate text-sm text-surface-800 ltr-text">
                {file.name}
              </span>
              <span className="text-xs text-surface-500 number">
                {(file.size / 1024).toFixed(0)} KB
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const next = files.filter((_, idx) => idx !== i);
                  setFiles(next);
                  onChange(next);
                  if (next.length === 0 && inputRef.current)
                    inputRef.current.value = "";
                }}
                className="text-surface-500 hover:text-rose-500 transition-colors"
                aria-label="הסרת קובץ"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-surface-600 hover:text-surface-800 transition-colors"
          >
            נקה הכל
          </button>
        </div>
      )}
    </div>
  );
}
