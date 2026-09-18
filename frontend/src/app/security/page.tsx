"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, Spinner } from "@/components/ui/misc";
import { api, PentestHealth, PentestScan } from "@/lib/api";
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
  const [health, setHealth] = useState<PentestHealth | null>(null);
  const [scans, setScans] = useState<PentestScan[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [h, s] = await Promise.all([
        api<PentestHealth>(`/pentest/health`),
        api<PentestScan[]>(`/pentest/scans?limit=100`),
      ]);
      setHealth(h);
      setScans(s);
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
        <h1 className="text-2xl font-bold tracking-tight">Security</h1>
        <p className="text-muted-foreground text-sm">
          On-demand penetration testing across the fleet, powered by HexStrike AI
        </p>
      </div>

      {/* Engine status */}
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          {!health?.enabled ? (
            <>
              <ShieldX className="h-5 w-5 text-muted-foreground" />
              <div className="text-sm">
                <div className="font-medium">Pentesting disabled</div>
                <div className="text-muted-foreground text-xs">
                  Set PENTEST_ENABLED=true and configure HEXSTRIKE_BASE_URL to enable.
                </div>
              </div>
            </>
          ) : health.reachable ? (
            <>
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
              <div className="text-sm">
                <div className="font-medium">HexStrike engine online — v{health.version}</div>
                <div className="text-muted-foreground text-xs">
                  {health.total_tools_available}/{health.total_tools_count} tools available ·{" "}
                  {health.base_url}
                  {health.allow_aggressive && " · aggressive scans enabled"}
                </div>
              </div>
            </>
          ) : (
            <>
              <ShieldAlert className="h-5 w-5 text-red-500" />
              <div className="text-sm">
                <div className="font-medium">Engine unreachable</div>
                <div className="text-muted-foreground text-xs">
                  {health.base_url}
                  {health.error ? ` — ${health.error}` : ""}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {loading && scans.length === 0 ? (
        <div className="flex justify-center py-20">
          <Spinner className="h-8 w-8" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {scans.length === 0 && (
              <p className="text-sm text-muted-foreground py-16 text-center">
                No scans have been run yet. Open a server and run a scan from its Security panel.
              </p>
            )}
            {scans.map((s) => {
              const counts = s.finding_counts;
              const shown = counts ? SEV_ORDER.filter((x) => (counts[x] || 0) > 0) : [];
              const running = s.status === "running" || s.status === "queued";
              return (
                <div key={s.id} className="flex items-start gap-3 p-4">
                  <Badge variant={statusVariant(s.status)} className="gap-1 shrink-0">
                    {running && <Spinner className="h-3 w-3" />}
                    {s.status}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      <span className="font-medium">{s.profile}</span> scan —{" "}
                      {s.summary || (running ? "running…" : "—")}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {s.server_id ? (
                        <Link
                          href={`/servers/${s.server_id}`}
                          className="hover:underline font-medium"
                        >
                          {s.server_name || s.target}
                        </Link>
                      ) : (
                        <span className="font-medium">{s.server_name || s.target}</span>
                      )}
                      {" · "}
                      {s.target} · by {s.triggered_by || "—"} · {timeAgo(s.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap justify-end shrink-0">
                    {s.status === "done" && shown.length === 0 && (
                      <Badge variant="success">clean</Badge>
                    )}
                    {shown.map((x) => (
                      <Badge key={x} variant={sevVariant(x)}>
                        {counts![x]} {x}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
