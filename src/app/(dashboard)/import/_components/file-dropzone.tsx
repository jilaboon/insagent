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
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 transition-colors",
          isDragging
            ? "border-primary-400 bg-primary-50"
            : "border-surface-300 bg-surface-50 hover:border-surface-400 hover:bg-surface-100"
        )}
      >
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl transition-colors",
            isDragging ? "bg-primary-100" : "bg-surface-200"
          )}
        >
          <Upload
            className={cn(
              "h-6 w-6",
              isDragging ? "text-primary-600" : "text-surface-500"
            )}
          />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-surface-700">
            גררו קבצי CSV לכאן
          </p>
          <p className="mt-1 text-xs text-surface-500">או בחרו קובץ</p>
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
              className="flex items-center gap-3 rounded-lg border border-surface-200 bg-white px-4 py-3"
            >
              <FileText className="h-4 w-4 shrink-0 text-primary-600" />
              <span className="flex-1 truncate text-sm text-surface-700 ltr-text">
                {file.name}
              </span>
              <span className="text-xs text-surface-400 number">
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
                className="text-surface-400 hover:text-red-500 transition-colors"
                aria-label="הסרת קובץ"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-surface-500 hover:text-surface-700 transition-colors"
          >
            נקה הכל
          </button>
        </div>
      )}
    </div>
  );
}
