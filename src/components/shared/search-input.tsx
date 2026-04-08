"use client";

import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface SearchInputProps {
  value: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}

export function SearchInput({
  value,
  onSearch,
  placeholder = "חיפוש...",
  debounceMs = 300,
  className,
}: SearchInputProps) {
  const [internal, setInternal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external value changes
  useEffect(() => {
    setInternal(value);
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setInternal(next);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onSearch(next);
      }, debounceMs);
    },
    [onSearch, debounceMs]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className={cn("relative", className)}>
      <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400 pointer-events-none" />
      <input
        type="text"
        value={internal}
        onChange={handleChange}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-lg border border-surface-300 bg-white py-2 pr-9 pl-3 text-sm text-surface-900 text-right placeholder:text-surface-400 transition-colors",
          "focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
        )}
      />
    </div>
  );
}
