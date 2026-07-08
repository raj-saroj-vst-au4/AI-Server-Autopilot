"use client";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { Metric } from "@/lib/api";

export function MetricChart({ data }: { data: Metric[] }) {
  const points = data.map((m) => ({
    t: new Date((m.ts.endsWith("Z") ? m.ts : m.ts + "Z")).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    CPU: m.cpu_pct,
    MEM: m.mem_pct,
    DISK: m.disk_pct,
  }));

  if (points.length === 0) {
    return <div className="text-sm text-muted-foreground py-10 text-center">No metric history yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={points} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="t" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} minTickGap={40} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Line type="monotone" dataKey="CPU" stroke="#3b82f6" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="MEM" stroke="#f59e0b" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="DISK" stroke="#10b981" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
