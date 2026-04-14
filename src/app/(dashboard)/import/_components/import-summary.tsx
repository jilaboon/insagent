"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Users, UserPlus, RefreshCw, FileText, Sparkles } from "lucide-react";
import Link from "next/link";

interface ImportSummaryProps {
  totalCustomers: number;
  newCustomers: number;
  updatedCustomers: number;
  policies: number;
  className?: string;
}

export function ImportSummary({
  totalCustomers,
  newCustomers,
  updatedCustomers,
  policies,
  className,
}: ImportSummaryProps) {
  const stats = [
    {
      label: "סה״כ לקוחות",
      value: totalCustomers,
      icon: Users,
      color: "text-primary-600 bg-primary-50",
    },
    {
      label: "לקוחות חדשים",
      value: newCustomers,
      icon: UserPlus,
      color: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "לקוחות מעודכנים",
      value: updatedCustomers,
      icon: RefreshCw,
      color: "text-amber-600 bg-amber-50",
    },
    {
      label: "פוליסות",
      value: policies,
      icon: FileText,
      color: "text-sky-600 bg-sky-50",
    },
  ];

  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} padding="sm">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  stat.color
                )}
              >
                <stat.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-2xl font-bold text-surface-900 number">
                  {stat.value.toLocaleString("he-IL")}
                </p>
                <p className="text-xs text-surface-500">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex justify-start">
        <Link href="/insights">
          <Button variant="primary">
            <Sparkles className="h-4 w-4" />
            עבור למרכז תובנות
          </Button>
        </Link>
      </div>
    </div>
  );
}
