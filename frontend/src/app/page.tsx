"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Zap, Bot, Activity } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, StatusDot, Spinner } from "@/components/ui/misc";
import { MetricBar } from "@/components/metric-bar";
import { api, Server, EventItem } from "@/lib/api";
import { timeAgo, fmtUptime } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Summary {
  total_servers: number;
  online: number;
  warning: number;
  critical: number;
  offline: number;
  unknown: number;
  open_events: number;
  critical_events: number;
  active_automations: number;
  actions_executed: number;
  ai_endpoint: string;
  clawdbot_endpoint: string;
}

export default function DashboardPage() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}

function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [s, srv, ev] = await Promise.all([
        api<Summary>("/dashboard/summary"),
        api<Server[]>("/servers"),
        api<EventItem[]>("/events?resolved=false&limit=8"),
      ]);
      setSummary(s);
      setServers(srv);
      setEvents(ev);
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  if (loading && !summary) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const total = summary?.total_servers ?? 0;
  const online = summary?.online ?? 0;
  const warning = summary?.warning ?? 0;
  const crit = (summary?.critical ?? 0) + (summary?.offline ?? 0);
  const unknown = summary?.unknown ?? 0;

  const state =
    total === 0
      ? { word: "No servers", tone: "text-muted-foreground", bar: "bg-muted-foreground" }
      : crit > 0
      ? { word: "Critical", tone: "text-danger", bar: "bg-danger" }
      : warning > 0
      ? { word: "Degraded", tone: "text-warn", bar: "bg-warn" }
      : { word: "Operational", tone: "text-ok", bar: "bg-ok" };

  const seg = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  const segments = [
    { n: online, cls: "bg-ok" },
    { n: warning, cls: "bg-warn" },
    { n: crit, cls: "bg-danger" },
    { n: unknown, cls: "bg-muted-foreground/50" },
  ].filter((x) => x.n > 0);

  const vitals = [
    { label: "Open anomalies", value: summary?.open_events ?? 0, icon: Activity, tone: "text-danger", href: "/events" },
    { label: "Active automations", value: summary?.active_automations ?? 0, icon: Zap, tone: "text-warn", href: "/automations" },
    { label: "Auto-actions run", value: summary?.actions_executed ?? 0, icon: Bot, tone: "text-signal", href: "/automations" },
  ];

  return (
    <div className="space-y-6">
      {/* Hero: the fleet instrument */}
      <Card className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, hsl(var(--signal)), transparent 70%)" }}
        />
        <CardContent className="relative p-5 sm:p-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[11px] text-muted-foreground mb-1.5">Fleet status</div>
                <div className={cn("text-3xl sm:text-4xl font-semibold tracking-tightest", state.tone)}>
                  {state.word}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-3xl sm:text-4xl tabular-nums leading-none">
                  <span className="text-ok">{online}</span>
                  <span className="text-muted-foreground text-2xl">/{total}</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">servers online</div>
              </div>
            </div>

            {/* segmented signal bar */}
            <div className="mt-5 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-panel-2">
              {segments.length === 0 ? (
                <div className="h-full w-full" />
              ) : (
                segments.map((s, i) => (
                  <div key={i} className={cn("h-full rounded-full", s.cls)} style={{ width: `${seg(s.n)}%` }} />
                ))
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs font-mono">
              <Legend cls="bg-ok" label="online" n={online} />
              <Legend cls="bg-warn" label="warning" n={warning} />
              <Legend cls="bg-danger" label="critical" n={crit} />
              {unknown > 0 && <Legend cls="bg-muted-foreground/60" label="unknown" n={unknown} />}
            </div>
          </div>

          {/* secondary vitals */}
          <div className="grid grid-cols-3 lg:grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-border">
            {vitals.map((v) => {
              const Icon = v.icon;
              return (
                <Link
                  key={v.label}
                  href={v.href}
                  className="group flex items-center justify-between gap-3 bg-panel p-3 sm:px-4 hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className={cn("h-4 w-4 shrink-0", v.tone)} />
                    <span className="text-xs text-muted-foreground truncate hidden sm:inline">{v.label}</span>
                  </div>
                  <span className="font-mono text-xl tabular-nums">{v.value}</span>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 overflow-hidden">
          <div className="flex items-center justify-between px-4 sm:px-5 h-12 border-b border-border">
            <span className="font-semibold text-sm tracking-tight">Servers</span>
            <Link href="/servers" className="inline-flex items-center gap-1 text-xs text-signal hover:underline">
              View all <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {servers.length === 0 && (
              <p className="text-sm text-muted-foreground py-10 text-center">
                No servers yet. Add one from the Servers page.
              </p>
            )}
            {servers.slice(0, 6).map((s) => (
              <Link
                key={s.id}
                href={`/servers/${s.id}`}
                className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-accent transition-colors"
              >
                <StatusDot status={s.status} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{s.name}</div>
                  <div className="text-xs text-muted-foreground font-mono truncate">
                    {s.ip}
                    <span className="text-muted-foreground/40"> · </span>
                    up {fmtUptime(s.latest?.uptime_s)}
                  </div>
                </div>
                <div className="hidden sm:grid grid-cols-3 gap-3 w-48 shrink-0">
                  <MetricBar label="cpu" value={s.latest?.cpu_pct} />
                  <MetricBar label="mem" value={s.latest?.mem_pct} />
                  <MetricBar label="disk" value={s.latest?.disk_pct} />
                </div>
                {s.open_events > 0 && <Badge variant="critical">{s.open_events}</Badge>}
              </Link>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-4 sm:px-5 h-12 border-b border-border">
            <span className="font-semibold text-sm tracking-tight">Recent anomalies</span>
            <Link href="/events" className="text-xs text-signal hover:underline">
              All
            </Link>
          </div>
          <div className="divide-y divide-border">
            {events.length === 0 && (
              <p className="text-sm text-muted-foreground py-10 text-center">No open anomalies.</p>
            )}
            {events.map((e) => (
              <div key={e.id} className="px-4 sm:px-5 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={e.severity === "critical" ? "critical" : e.severity === "warning" ? "warning" : "muted"}>
                    {e.severity}
                  </Badge>
                  <span className="text-xs text-muted-foreground truncate">{e.server_name}</span>
                  <span className="text-[11px] text-muted-foreground font-mono ml-auto shrink-0">{timeAgo(e.ts)}</span>
                </div>
                <div className="text-sm leading-snug">{e.message}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Legend({ cls, label, n }: { cls: string; label: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className={cn("h-2 w-2 rounded-full", cls)} />
      {label}
      <span className="text-foreground tabular-nums">{n}</span>
    </span>
  );
}
