import { cn } from "@/lib/utils";

export function MetricBar({
  label,
  value,
  unit = "%",
}: {
  label: string;
  value: number | null | undefined;
  unit?: string;
}) {
  const v = value ?? null;
  const pct = v == null ? 0 : Math.min(100, Math.max(0, v));
  const color =
    v == null
      ? "bg-slate-300"
      : pct >= 90
      ? "bg-red-500"
      : pct >= 75
      ? "bg-amber-500"
      : "bg-emerald-500";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{v == null ? "—" : `${v}${unit}`}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
