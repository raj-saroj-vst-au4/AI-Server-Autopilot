"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "success" | "warning" | "critical" | "muted" | "outline";
}) {
  const variants: Record<string, string> = {
    default: "bg-signal/15 text-signal",
    success: "bg-ok/15 text-ok",
    warning: "bg-warn/15 text-warn",
    critical: "bg-danger/15 text-danger",
    muted: "bg-muted text-muted-foreground",
    outline: "border border-border text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    online: "bg-ok",
    warning: "bg-warn",
    critical: "bg-danger",
    offline: "bg-danger",
    unknown: "bg-muted-foreground",
  };
  const alert = status === "warning" || status === "critical" || status === "offline";
  return (
    <span className="relative flex h-2.5 w-2.5">
      {alert && (
        <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", colors[status])} />
      )}
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", colors[status] || colors.unknown)} />
    </span>
  );
}

export function Switch({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ground",
        checked ? "bg-signal" : "bg-input"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ground/80 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className={cn(
          "bg-panel w-full rounded-t-xl sm:rounded-lg border border-border max-h-[92vh] overflow-y-auto",
          wide ? "sm:max-w-2xl" : "sm:max-w-md"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-4 sticky top-0 bg-panel z-10">
          <h2 className="font-semibold tracking-tight">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-panel-2 px-3 py-1 text-sm focus-visible:outline-none focus-visible:border-signal focus-visible:ring-1 focus-visible:ring-signal disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-spin rounded-full border-2 border-muted border-t-signal h-4 w-4", className)}
    />
  );
}
