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
    v == null ? "bg-muted-foreground/30" : pct >= 90 ? "bg-danger" : pct >= 75 ? "bg-warn" : "bg-ok";
  return (
    <div>
      <div className="flex justify-between items-baseline text-[11px] mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums text-foreground">{v == null ? "—" : `${v}${unit}`}</span>
      </div>
      <div className="h-1 w-full rounded-full bg-panel-2 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
