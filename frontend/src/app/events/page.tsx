"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, Spinner, Select } from "@/components/ui/misc";
import { api, EventItem } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

export default function EventsPage() {
  return (
    <AppShell>
      <Events />
    </AppShell>
  );
}

function Events() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("open");
  const [severity, setSeverity] = useState("");

  async function load() {
    const params = new URLSearchParams();
    if (status === "open") params.set("resolved", "false");
    if (status === "resolved") params.set("resolved", "true");
    if (severity) params.set("severity", severity);
    params.set("limit", "200");
    try {
      setEvents(await api<EventItem[]>(`/events?${params}`));
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [status, severity]);

  async function resolve(id: number) {
    await api(`/events/${id}/resolve`, { method: "POST" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Events</h1>
          <p className="text-muted-foreground text-sm">Anomalies and abnormal activity across the fleet</p>
        </div>
        <div className="sm:ml-auto flex gap-2">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-32">
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </Select>
          <Select value={severity} onChange={(e) => setSeverity(e.target.value)} className="w-36">
            <option value="">All severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </Select>
        </div>
      </div>

      {loading && events.length === 0 ? (
        <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {events.length === 0 && (
              <p className="text-sm text-muted-foreground py-16 text-center">No events match this filter.</p>
            )}
            {events.map((e) => (
              <div key={e.id} className="flex items-start gap-3 p-4">
                <Badge variant={
                  e.severity === "critical" ? "critical" :
                  e.severity === "warning" ? "warning" :
                  e.category === "recovered" ? "success" : "muted"
                }>
                  {e.severity}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{e.message}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    <Link href={`/servers/${e.server_id}`} className="hover:underline font-medium">
                      {e.server_name}
                    </Link>
                    {" · "}{e.category} · {timeAgo(e.ts)}
                    {e.resolved && " · resolved"}
                  </div>
                </div>
                {!e.resolved && e.severity !== "info" && (
                  <Button variant="ghost" size="sm" onClick={() => resolve(e.id)}>
                    <Check className="h-4 w-4" /> Resolve
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
