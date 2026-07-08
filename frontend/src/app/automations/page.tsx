"use client";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Zap, Bot, History } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, Modal, Spinner, Switch, Select } from "@/components/ui/misc";
import { Input, Label, Textarea } from "@/components/ui/input";
import { api, AutoAction, ActionRun, Server } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

const TRIGGERS = [
  { value: "any", label: "Any anomaly" },
  { value: "cpu_high", label: "High CPU" },
  { value: "mem_high", label: "High memory" },
  { value: "disk_high", label: "Disk full" },
  { value: "load_high", label: "High load" },
  { value: "unreachable", label: "Unreachable" },
];

export default function AutomationsPage() {
  return (
    <AppShell>
      <Automations />
    </AppShell>
  );
}

function Automations() {
  const [actions, setActions] = useState<AutoAction[]>([]);
  const [runs, setRuns] = useState<ActionRun[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AutoAction | undefined>();
  const [deleting, setDeleting] = useState<AutoAction | undefined>();

  async function load() {
    try {
      const [a, r, s] = await Promise.all([
        api<AutoAction[]>("/automations"),
        api<ActionRun[]>("/automations/runs?limit=50"),
        api<Server[]>("/servers"),
      ]);
      setActions(a);
      setRuns(r);
      setServers(s);
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  async function toggle(a: AutoAction) {
    await api(`/automations/${a.id}`, { method: "PUT", body: JSON.stringify({ enabled: !a.enabled }) });
    load();
  }

  async function doDelete() {
    if (!deleting) return;
    await api(`/automations/${deleting.id}`, { method: "DELETE" });
    setDeleting(undefined);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Automations</h1>
          <p className="text-muted-foreground text-sm">
            Actions the system runs automatically when anomalies fire
          </p>
        </div>
        <Button className="sm:ml-auto" onClick={() => { setEditing(undefined); setShowForm(true); }}>
          <Plus className="h-4 w-4" /> New automation
        </Button>
      </div>

      {loading && actions.length === 0 ? (
        <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {actions.length === 0 && (
            <Card className="lg:col-span-2">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No automations defined. Create one to let the system remediate issues without you.
              </CardContent>
            </Card>
          )}
          {actions.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {a.require_ai ? <Bot className="h-5 w-5 text-primary" /> : <Zap className="h-5 w-5 text-amber-500" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{a.name}</div>
                    {a.description && <div className="text-xs text-muted-foreground">{a.description}</div>}
                  </div>
                  <Switch checked={a.enabled} onCheckedChange={() => toggle(a)} />
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  <Badge variant="outline">{TRIGGERS.find((t) => t.value === a.trigger_category)?.label || a.trigger_category}</Badge>
                  <Badge variant="muted">{a.server_name || "All servers"}</Badge>
                  {a.require_ai && <Badge variant="default">AI-gated</Badge>}
                  <Badge variant="muted">cooldown {a.cooldown_minutes}m</Badge>
                </div>
                <code className="block text-xs bg-muted rounded px-2 py-1.5 mt-3 overflow-x-auto font-mono">
                  {a.command}
                </code>
                <div className="flex items-center mt-3">
                  <span className="text-xs text-muted-foreground">
                    {a.last_run_at ? `last run ${timeAgo(a.last_run_at)}` : "never run"}
                  </span>
                  <div className="ml-auto flex">
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(a); setShowForm(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleting(a)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <History className="h-4 w-4" />
          <CardTitle className="text-base">Execution history</CardTitle>
        </CardHeader>
        <CardContent className="p-0 divide-y">
          {runs.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">No automations have run yet.</p>
          )}
          {runs.map((r) => (
            <div key={r.id} className="p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={r.status === "ok" ? "success" : r.status === "skipped" ? "muted" : "critical"}>
                  {r.status}
                </Badge>
                <span className="text-sm font-medium">{r.action_name}</span>
                <span className="text-xs text-muted-foreground">on {r.server_name}</span>
                <Badge variant={r.decided_by === "ai" ? "default" : "outline"}>{r.decided_by}</Badge>
                <span className="text-xs text-muted-foreground ml-auto">{timeAgo(r.ts)}</span>
              </div>
              {r.ai_reason && <div className="text-xs text-muted-foreground mt-1 italic">AI: {r.ai_reason}</div>}
              {r.output && (
                <pre className="text-xs bg-muted rounded px-2 py-1.5 mt-2 overflow-x-auto whitespace-pre-wrap max-h-32">
                  {r.output}
                </pre>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Edit automation" : "New automation"} wide>
        <AutomationForm
          action={editing}
          servers={servers}
          onDone={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(undefined)} title="Delete automation">
        <p className="text-sm">Delete <span className="font-semibold">{deleting?.name}</span>?</p>
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="outline" onClick={() => setDeleting(undefined)}>Cancel</Button>
          <Button variant="destructive" onClick={doDelete}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}

function AutomationForm({
  action,
  servers,
  onDone,
  onCancel,
}: {
  action?: AutoAction;
  servers: Server[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const editing = !!action;
  const [form, setForm] = useState({
    name: action?.name || "",
    description: action?.description || "",
    trigger_category: action?.trigger_category || "any",
    server_id: action?.server_id ? String(action.server_id) : "",
    command: action?.command || "",
    enabled: action?.enabled ?? true,
    require_ai: action?.require_ai ?? false,
    cooldown_minutes: action?.cooldown_minutes ?? 30,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function set(k: string, v: any) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const payload: any = {
        name: form.name,
        description: form.description || null,
        trigger_category: form.trigger_category,
        server_id: form.server_id ? Number(form.server_id) : null,
        command: form.command,
        enabled: form.enabled,
        require_ai: form.require_ai,
        cooldown_minutes: Number(form.cooldown_minutes),
      };
      if (editing) {
        if (!form.server_id) payload.clear_server = true;
        await api(`/automations/${action!.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await api("/automations", { method: "POST", body: JSON.stringify(payload) });
      }
      onDone();
    } catch (e: any) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label>Name</Label>
        <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Clear tmp on disk full" />
      </div>
      <div>
        <Label>Description</Label>
        <Input value={form.description} onChange={(e) => set("description", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Trigger</Label>
          <Select value={form.trigger_category} onChange={(e) => set("trigger_category", e.target.value)}>
            {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
        </div>
        <div>
          <Label>Server</Label>
          <Select value={form.server_id} onChange={(e) => set("server_id", e.target.value)}>
            <option value="">All servers</option>
            {servers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
      </div>
      <div>
        <Label>Command (runs over SSH on the affected server)</Label>
        <Textarea value={form.command} onChange={(e) => set("command", e.target.value)}
          placeholder="systemctl restart nginx" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Cooldown (minutes)</Label>
          <Input type="number" value={form.cooldown_minutes} onChange={(e) => set("cooldown_minutes", e.target.value)} />
        </div>
        <div className="flex items-end gap-6 pb-1">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} /> Enabled
          </label>
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm rounded-lg border p-3">
        <Switch checked={form.require_ai} onCheckedChange={(v) => set("require_ai", v)} />
        <span>
          <span className="font-medium">Require AI approval</span>
          <span className="block text-xs text-muted-foreground">
            The local AI reviews each event and decides whether it's safe to run this action.
            Off = run immediately on any matching anomaly.
          </span>
        </span>
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2 justify-end pt-1">
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving || !form.name || !form.command}>
          {saving ? <Spinner /> : editing ? "Save" : "Create"}
        </Button>
      </div>
    </div>
  );
}
