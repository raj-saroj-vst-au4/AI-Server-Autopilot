"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, Plug, RefreshCw, Star } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusDot, Modal, Spinner } from "@/components/ui/misc";
import { Input } from "@/components/ui/input";
import { MetricBar } from "@/components/metric-bar";
import { ServerForm } from "@/components/server-form";
import { api, Server } from "@/lib/api";
import { timeAgo, fmtUptime } from "@/lib/utils";

export default function ServersPage() {
  return (
    <AppShell>
      <Servers />
    </AppShell>
  );
}

function Servers() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Server | undefined>();
  const [deleting, setDeleting] = useState<Server | undefined>();
  const [testResult, setTestResult] = useState<{ id: number; msg: string; ok: boolean } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    try {
      setServers(await api<Server[]>("/servers"));
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  async function test(s: Server) {
    setBusyId(s.id);
    setTestResult(null);
    try {
      const r = await api<{ ok: boolean; output?: string; error?: string }>(`/servers/${s.id}/test`, {
        method: "POST",
      });
      setTestResult({ id: s.id, ok: r.ok, msg: r.ok ? r.output || "Connected" : r.error || "Failed" });
    } catch (e: any) {
      setTestResult({ id: s.id, ok: false, msg: e.message });
    } finally {
      setBusyId(null);
    }
  }

  async function pollNow(s: Server) {
    setBusyId(s.id);
    try {
      await api(`/servers/${s.id}/poll`, { method: "POST" });
      await load();
    } catch {}
    setBusyId(null);
  }

  async function doDelete() {
    if (!deleting) return;
    await api(`/servers/${deleting.id}`, { method: "DELETE" });
    setDeleting(undefined);
    load();
  }

  const filtered = servers.filter(
    (s) =>
      s.name.toLowerCase().includes(q.toLowerCase()) ||
      s.ip.includes(q) ||
      (s.hostname || "").toLowerCase().includes(q.toLowerCase())
  );
  const priority = filtered.filter((s) => s.high_priority);
  const rest = filtered.filter((s) => !s.high_priority);

  const renderCard = (s: Server) => (
    <Card key={s.id} className={`flex flex-col ${s.high_priority ? "border-amber-500/40" : ""}`}>
      <CardContent className="p-4 flex-1">
        <div className="flex items-start gap-3">
          <div className="mt-1"><StatusDot status={s.status} /></div>
          <div className="min-w-0 flex-1">
            <Link href={`/servers/${s.id}`} className="font-semibold hover:underline flex items-center gap-1.5">
              {s.high_priority && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />}
              <span className="truncate">{s.name}</span>
            </Link>
            <div className="text-xs text-muted-foreground truncate">
              {s.ip}:{s.ssh_port} · {s.ssh_user}
            </div>
            {s.hostname && <div className="text-xs text-muted-foreground truncate">{s.hostname}</div>}
          </div>
          <Badge variant={
            s.status === "online" ? "success" :
            s.status === "warning" ? "warning" :
            s.status === "unknown" ? "muted" : "critical"
          }>
            {s.status}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4">
          <MetricBar label="CPU" value={s.latest?.cpu_pct} />
          <MetricBar label="MEM" value={s.latest?.mem_pct} />
          <MetricBar label="DISK" value={s.latest?.disk_pct} />
        </div>

        <div className="flex items-center gap-2 justify-between mt-3 text-xs text-muted-foreground">
          <span>up {fmtUptime(s.latest?.uptime_s)}</span>
          <span>seen {timeAgo(s.last_seen)}</span>
          {s.open_events > 0 && <Badge variant="critical">{s.open_events} events</Badge>}
        </div>

        {s.bmc_ip && <div className="text-xs text-muted-foreground mt-2">BMC: {s.bmc_ip}</div>}
        {s.last_error && (
          <div className="text-xs text-red-500 mt-2 line-clamp-2">{s.last_error}</div>
        )}
        {testResult?.id === s.id && (
          <div className={`text-xs mt-2 whitespace-pre-wrap ${testResult.ok ? "text-emerald-500" : "text-red-500"}`}>
            {testResult.msg}
          </div>
        )}
      </CardContent>
      <div className="border-t p-2 flex gap-1">
        <Button variant="ghost" size="sm" onClick={() => test(s)} disabled={busyId === s.id}>
          {busyId === s.id ? <Spinner /> : <Plug className="h-4 w-4" />} Test
        </Button>
        <Button variant="ghost" size="sm" onClick={() => pollNow(s)} disabled={busyId === s.id}>
          <RefreshCw className="h-4 w-4" /> Poll
        </Button>
        <div className="ml-auto flex">
          <Button variant="ghost" size="icon" onClick={() => { setEditing(s); setShowForm(true); }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setDeleting(s)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Servers</h1>
          <p className="text-muted-foreground text-sm">{servers.length} managed servers</p>
        </div>
        <div className="sm:ml-auto flex gap-2">
          <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:w-48" />
          <Button onClick={() => { setEditing(undefined); setShowForm(true); }}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      {loading && servers.length === 0 ? (
        <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
          No servers match your search.
        </CardContent></Card>
      ) : (
        <div className="space-y-8">
          {priority.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  High priority
                </h2>
                <span className="text-xs text-muted-foreground">({priority.length})</span>
                <div className="h-px flex-1 bg-border ml-2" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {priority.map(renderCard)}
              </div>
            </section>
          )}

          {rest.length > 0 && (
            <section className="space-y-3">
              {priority.length > 0 && (
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    All servers
                  </h2>
                  <span className="text-xs text-muted-foreground">({rest.length})</span>
                  <div className="h-px flex-1 bg-border ml-2" />
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {rest.map(renderCard)}
              </div>
            </section>
          )}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Edit server" : "Add server"} wide>
        <ServerForm
          server={editing}
          onDone={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(undefined)} title="Delete server">
        <p className="text-sm">
          Delete <span className="font-semibold">{deleting?.name}</span> and all its metrics, events and analyses?
        </p>
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="outline" onClick={() => setDeleting(undefined)}>Cancel</Button>
          <Button variant="destructive" onClick={doDelete}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
