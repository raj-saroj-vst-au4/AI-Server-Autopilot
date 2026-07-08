"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Server as ServerIcon,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Zap,
  Activity,
  Cpu,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusDot, Spinner } from "@/components/ui/misc";
import { MetricBar } from "@/components/metric-bar";
import { api, Server, EventItem } from "@/lib/api";
import { timeAgo, fmtUptime } from "@/lib/utils";

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
      <div className="flex justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const stats = [
    { label: "Total Servers", value: summary?.total_servers ?? 0, icon: ServerIcon, tint: "text-primary" },
    { label: "Online", value: summary?.online ?? 0, icon: CheckCircle2, tint: "text-emerald-500" },
    { label: "Warnings", value: summary?.warning ?? 0, icon: AlertTriangle, tint: "text-amber-500" },
    { label: "Critical / Offline", value: (summary?.critical ?? 0) + (summary?.offline ?? 0), icon: XCircle, tint: "text-red-500" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Fleet health at a glance · auto-refreshing</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold tabular-nums">{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
                </div>
                <Icon className={`h-8 w-8 ${s.tint} opacity-80`} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Activity className="h-6 w-6 text-red-500" />
            <div>
              <div className="text-xl font-bold tabular-nums">{summary?.open_events ?? 0}</div>
              <div className="text-xs text-muted-foreground">Open anomalies</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Zap className="h-6 w-6 text-amber-500" />
            <div>
              <div className="text-xl font-bold tabular-nums">{summary?.active_automations ?? 0}</div>
              <div className="text-xs text-muted-foreground">Active automations</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Cpu className="h-6 w-6 text-primary" />
            <div>
              <div className="text-xl font-bold tabular-nums">{summary?.actions_executed ?? 0}</div>
              <div className="text-xs text-muted-foreground">Auto-actions run</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Servers</CardTitle>
            <Link href="/servers" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {servers.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No servers yet. Add one from the Servers page.
              </p>
            )}
            {servers.slice(0, 6).map((s) => (
              <Link
                key={s.id}
                href={`/servers/${s.id}`}
                className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors"
              >
                <StatusDot status={s.status} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{s.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {s.ip} · {s.hostname || "—"} · up {fmtUptime(s.latest?.uptime_s)}
                  </div>
                </div>
                <div className="hidden sm:grid grid-cols-3 gap-3 w-48 shrink-0">
                  <MetricBar label="CPU" value={s.latest?.cpu_pct} />
                  <MetricBar label="MEM" value={s.latest?.mem_pct} />
                  <MetricBar label="DISK" value={s.latest?.disk_pct} />
                </div>
                {s.open_events > 0 && <Badge variant="critical">{s.open_events}</Badge>}
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Recent anomalies</CardTitle>
            <Link href="/events" className="text-sm text-primary hover:underline">
              All
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {events.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">No open anomalies 🎉</p>
            )}
            {events.map((e) => (
              <div key={e.id} className="rounded-lg border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={e.severity === "critical" ? "critical" : e.severity === "warning" ? "warning" : "muted"}>
                    {e.severity}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{e.server_name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{timeAgo(e.ts)}</span>
                </div>
                <div className="text-sm">{e.message}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
