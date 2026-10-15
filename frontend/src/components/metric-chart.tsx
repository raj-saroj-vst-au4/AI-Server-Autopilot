"use client";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Legend } from "recharts";
import { Metric } from "@/lib/api";

// Trace palette: cyan signal (CPU) is the hero line; amber + green are secondary.
const TRACE = { CPU: "#22B8E6", MEM: "#E6B13E", DISK: "#3FCF8E" };

export function MetricChart({ data }: { data: Metric[] }) {
  const points = data.map((m) => ({
    t: new Date(m.ts.endsWith("Z") ? m.ts : m.ts + "Z").toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    CPU: m.cpu_pct,
    MEM: m.mem_pct,
    DISK: m.disk_pct,
  }));

  if (points.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-12 text-center font-mono">
        awaiting first sample…
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="t"
          tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "hsl(var(--muted-foreground))" }}
          minTickGap={40}
          axisLine={{ stroke: "hsl(var(--border))" }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "hsl(var(--muted-foreground))" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--panel))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
            fontSize: 12,
            fontFamily: "var(--font-mono)",
          }}
          labelStyle={{ color: "hsl(var(--muted-foreground))" }}
          cursor={{ stroke: "hsl(var(--signal))", strokeWidth: 1, strokeDasharray: "3 3" }}
        />
        <Legend
          iconType="plainline"
          wrapperStyle={{ fontSize: 11, fontFamily: "var(--font-mono)", paddingTop: 4 }}
        />
        <Line type="monotone" dataKey="CPU" stroke={TRACE.CPU} dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="MEM" stroke={TRACE.MEM} dot={false} strokeWidth={1.75} />
        <Line type="monotone" dataKey="DISK" stroke={TRACE.DISK} dot={false} strokeWidth={1.75} />
      </LineChart>
    </ResponsiveContainer>
  );
}
