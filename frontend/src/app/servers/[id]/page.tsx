"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Sparkles,
  RefreshCw,
  Cpu,
  MemoryStick,
  HardDrive,
  Gauge,
  Clock,
  Star,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusDot, Spinner } from "@/components/ui/misc";
import { MetricChart } from "@/components/metric-chart";
import { ServerChat } from "@/components/server-chat";
import { PentestPanel } from "@/components/pentest-panel";
import { api, Server, Metric, EventItem, Analysis } from "@/lib/api";
import { timeAgo, fmtUptime } from "@/lib/utils";

export default function ServerDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  return (
    <AppShell>
      <ServerDetail id={Number(id)} />
    </AppShell>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-panel-2 p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px]">{label}</span>
      </div>
      <div className="text-lg font-mono tabular-nums mt-1 leading-none">{value}</div>
    </div>
  );
}

function ServerDetail({ id }: { id: number }) {
  const [server, setServer] = useState<Server | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState("");

  async function load() {
    try {
      const [s, m, e, a] = await Promise.all([
        api<Server>(`/servers/${id}`),
        api<Metric[]>(`/servers/${id}/metrics?hours=6`),
        api<EventItem[]>(`/servers/${id}/events?limit=30`),
        api<Analysis | null>(`/servers/${id}/analysis`),
      ]);
      setServer(s);
      setMetrics(m);
      setEvents(e);
      setAnalysis(a);
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [id]);

  async function analyze() {
    setAnalyzing(true);
    setAiError("");
    try {
      const a = await api<Analysis>(`/servers/${id}/analyze`, { method: "POST" });
      setAnalysis(a);
    } catch (e: any) {
      setAiError(e.message || "AI analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  if (loading && !server) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (!server) return <p className="text-sm text-muted-foreground">Server not found.</p>;

  const l = server.latest;

  return (
    <div className="space-y-6">
      <Link href="/servers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to servers
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <StatusDot status={server.status} />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              {server.high_priority && <Star className="h-4 w-4 text-warn fill-warn shrink-0" />}
              <span className="truncate">{server.name}</span>
            </h1>
            <p className="text-muted-foreground text-sm truncate font-mono">
              {server.ip}:{server.ssh_port} {server.hostname ? `· ${server.hostname}` : ""}
            </p>
          </div>
        </div>
        <div className="sm:ml-auto flex gap-2 shrink-0 items-center">
          {server.high_priority && <Badge variant="warning">High priority</Badge>}
          <Badge
            variant={
              server.status === "online"
                ? "success"
                : server.status === "warning"
                ? "warning"
                : server.status === "unknown"
                ? "muted"
                : "critical"
            }
          >
            {server.status}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => { api(`/servers/${id}/poll`, { method: "POST" }).then(load); }}>
            <RefreshCw className="h-4 w-4" /> Poll now
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <div className="xl:col-span-2 space-y-5 min-w-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Stat icon={Cpu} label="cpu" value={l?.cpu_pct != null ? `${l.cpu_pct}%` : "—"} />
            <Stat icon={MemoryStick} label="memory" value={l?.mem_pct != null ? `${l.mem_pct}%` : "—"} />
            <Stat icon={HardDrive} label="disk" value={l?.disk_pct != null ? `${l.disk_pct}%` : "—"} />
            <Stat icon={Gauge} label="load 1m" value={l?.load1 != null ? `${l.load1}` : "—"} />
            <Stat icon={Cpu} label="cores" value={l?.cores != null ? `${l.cores}` : "—"} />
            <Stat icon={Clock} label="uptime" value={fmtUptime(l?.uptime_s)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Resource usage, last 6 hours</CardTitle>
            </CardHeader>
            <CardContent>
              <MetricChart data={metrics} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-signal" /> AI analysis
              </CardTitle>
              <Button size="sm" onClick={analyze} disabled={analyzing}>
                {analyzing ? <Spinner /> : <Sparkles className="h-4 w-4" />}
                {analysis ? "Re-analyze" : "Analyze"}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {aiError && <p className="text-sm text-danger">{aiError}</p>}
              {!analysis && !aiError && (
                <p className="text-sm text-muted-foreground">
                  Run an AI analysis to get issues, actions and solutions tailored to this server.
                </p>
              )}
              {analysis && (
                <>
                  <div className="flex items-center gap-4">
                    {analysis.health_score != null && (
                      <div className="flex items-baseline gap-2 shrink-0">
                        <div
                          className={`text-4xl font-mono font-semibold tabular-nums leading-none ${
                            analysis.health_score >= 80 ? "text-ok" : analysis.health_score >= 50 ? "text-warn" : "text-danger"
                          }`}
                        >
                          {analysis.health_score}
                        </div>
                        <div className="text-[11px] text-muted-foreground leading-tight">
                          health
                          <br />
                          score
                        </div>
                      </div>
                    )}
                    <p className="text-sm flex-1">{analysis.summary}</p>
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    {analysis.model} · {timeAgo(analysis.ts)}
                  </div>

                  {analysis.issues && analysis.issues.length > 0 && (
                    <div>
                      <div className="text-sm font-semibold mb-2 tracking-tight">Issues</div>
                      <div className="space-y-2">
                        {analysis.issues.map((iss, i) => (
                          <div key={i} className="rounded-md border border-border bg-panel-2 p-3">
                            <div className="flex items-center gap-2">
                              <Badge variant={iss.severity === "critical" ? "critical" : iss.severity === "warning" ? "warning" : "muted"}>
                                {iss.severity}
                              </Badge>
                              <span className="text-sm font-medium">{iss.title}</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1.5">{iss.detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis.actions && analysis.actions.length > 0 && (
                    <div>
                      <div className="text-sm font-semibold mb-2 tracking-tight">Recommended actions</div>
                      <div className="space-y-2">
                        {analysis.actions.map((act, i) => (
                          <div key={i} className="rounded-md border border-border bg-panel-2 p-3">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant={act.priority === "high" ? "critical" : act.priority === "medium" ? "warning" : "muted"}>
                                {act.priority}
                              </Badge>
                              <span className="text-sm">{act.action}</span>
                            </div>
                            {act.command && (
                              <code className="block text-xs bg-panel border border-border rounded px-2 py-1 mt-1.5 overflow-x-auto">
                                <span className="text-signal select-none">$ </span>
                                {act.command}
                              </code>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {analysis.solutions && analysis.solutions.length > 0 && (
                    <div>
                      <div className="text-sm font-semibold mb-2 tracking-tight">Solutions</div>
                      <div className="space-y-2">
                        {analysis.solutions.map((sol, i) => (
                          <div key={i} className="rounded-md border border-border bg-panel-2 p-3">
                            <div className="text-sm font-medium">{sol.issue}</div>
                            <p className="text-sm text-muted-foreground mt-1.5">{sol.solution}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <PentestPanel serverId={id} />

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Event history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {events.length === 0 && <p className="text-sm text-muted-foreground">No events recorded.</p>}
              {events.map((e) => (
                <div key={e.id} className="flex items-start gap-3 rounded-md border border-border bg-panel-2 p-3">
                  <Badge
                    variant={
                      e.severity === "critical"
                        ? "critical"
                        : e.severity === "warning"
                        ? "warning"
                        : e.category === "recovered"
                        ? "success"
                        : "muted"
                    }
                    className="mt-0.5 shrink-0"
                  >
                    {e.severity}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm leading-snug">{e.message}</div>
                    <div className="text-[11px] text-muted-foreground mt-1 font-mono">
                      {e.category} · {timeAgo(e.ts)} {e.resolved && "· resolved"}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-1 xl:sticky xl:top-20">
          <Card className="overflow-hidden">
            <div className="h-[70vh] xl:h-[calc(100vh-8rem)] flex flex-col">
              <ServerChat server={server} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
