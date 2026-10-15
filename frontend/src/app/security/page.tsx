"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EngineControl } from "@/components/engine-control";
import { LlmControl } from "@/components/llm-control";
import { Card } from "@/components/ui/card";
import { Badge, Spinner } from "@/components/ui/misc";
import { api, PentestScan } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

export default function SecurityPage() {
  return (
    <AppShell>
      <Security />
    </AppShell>
  );
}

const SEV_ORDER = ["critical", "high", "medium", "low", "info"] as const;

function sevVariant(sev: string): "critical" | "warning" | "muted" | "default" {
  if (sev === "critical" || sev === "high") return "critical";
  if (sev === "medium") return "warning";
  if (sev === "low") return "default";
  return "muted";
}

function statusVariant(status: string): "success" | "warning" | "critical" | "muted" {
  if (status === "done") return "success";
  if (status === "failed") return "critical";
  if (status === "running" || status === "queued") return "warning";
  return "muted";
}

function Security() {
  const [scans, setScans] = useState<PentestScan[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setScans(await api<PentestScan[]>(`/pentest/scans?limit=100`));
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Security</h1>
        <p className="text-muted-foreground text-sm">On-demand penetration testing across the fleet</p>
      </div>

      {/* Pick, start and stop the scanning engine and the local LLM on demand */}
      <div className="grid gap-4 lg:grid-cols-2">
        <EngineControl onRunning={load} />
        <LlmControl />
      </div>

      <div>
        <div className="flex items-center gap-2.5 mb-3">
          <h2 className="text-sm font-semibold tracking-tight">Scan history</h2>
          <span className="text-xs text-muted-foreground font-mono">{scans.length}</span>
          <div className="h-px flex-1 bg-border ml-1" />
        </div>

        {loading && scans.length === 0 ? (
          <div className="flex justify-center py-24">
            <Spinner className="h-8 w-8" />
          </div>
        ) : (
          <Card className="overflow-hidden">
            <div className="divide-y divide-border">
              {scans.length === 0 && (
                <p className="text-sm text-muted-foreground py-16 text-center">
                  No scans yet. Open a server and run a scan from its Security panel.
                </p>
              )}
              {scans.map((s) => {
                const counts = s.finding_counts;
                const shown = counts ? SEV_ORDER.filter((x) => (counts[x] || 0) > 0) : [];
                const running = s.status === "running" || s.status === "queued";
                return (
                  <div key={s.id} className="flex items-start gap-3 p-4">
                    <Badge variant={statusVariant(s.status)} className="gap-1 shrink-0 mt-0.5">
                      {running && <Spinner className="h-3 w-3" />}
                      {s.status}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm leading-snug">
                        <span className="font-medium">{s.profile}</span>{" "}
                        <span className="text-muted-foreground">scan</span>{" "}
                        {s.summary || (running ? "in progress…" : "")}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
                        {s.server_id ? (
                          <Link href={`/servers/${s.server_id}`} className="font-medium text-foreground/80 hover:text-signal transition-colors">
                            {s.server_name || s.target}
                          </Link>
                        ) : (
                          <span className="font-medium text-foreground/80">{s.server_name || s.target}</span>
                        )}
                        <span className="font-mono text-muted-foreground/70">{s.target}</span>
                        <span>by {s.triggered_by || "—"}</span>
                        <span className="font-mono ml-auto">{timeAgo(s.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap justify-end shrink-0 max-w-[40%]">
                      {s.status === "done" && shown.length === 0 && <Badge variant="success">clean</Badge>}
                      {shown.map((x) => (
                        <Badge key={x} variant={sevVariant(x)}>
                          {counts![x]} {x}
                        </Badge>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
