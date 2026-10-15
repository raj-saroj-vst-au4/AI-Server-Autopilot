"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Square, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, Spinner, Select } from "@/components/ui/misc";
import { api, ApiError, EngineStatus } from "@/lib/api";

// Global pentest-engine control: pick the active engine (PentAGI / HexStrike),
// start/stop its containers on demand, with a live loader while it comes up.
export function EngineControl({ onRunning }: { onRunning?: () => void }) {
  const [st, setSt] = useState<EngineStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasRunning = useRef(false);

  async function load() {
    try {
      const s = await api<EngineStatus>("/pentest/engine");
      setSt(s);
      if (s.reachable && !wasRunning.current) onRunning?.();
      wasRunning.current = s.reachable;
    } catch {}
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    const fast = st?.state === "starting";
    timer.current = setInterval(load, fast ? 2500 : 9000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.state]);

  async function switchProvider(provider: string) {
    setErr("");
    try {
      await api("/pentest/engine/provider", { method: "POST", body: JSON.stringify({ provider }) });
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to switch engine");
    }
  }

  async function act(path: string, label: string) {
    setBusy(true);
    setErr("");
    try {
      await api(`/pentest/engine/${path}`, { method: "POST" });
      await load();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : `Failed to ${label} engine`);
    } finally {
      setBusy(false);
    }
  }

  if (!st) {
    return (
      <Card className="flex items-center justify-center py-5">
        <Spinner />
      </Card>
    );
  }

  if (!st.enabled) {
    return (
      <Card className="flex items-center gap-3 p-4">
        <ShieldX className="h-5 w-5 text-muted-foreground shrink-0" />
        <div className="text-sm">
          <div className="font-medium">Scanning engine disabled</div>
          <div className="text-muted-foreground text-xs mt-0.5">
            Set <code className="bg-panel-2 border border-border rounded px-1 py-0.5 text-[11px]">PENTEST_ENABLED=true</code> to enable it.
          </div>
        </div>
      </Card>
    );
  }

  const state = st.state;
  const icon =
    state === "running" ? <ShieldCheck className="h-5 w-5 text-ok" /> :
    state === "starting" ? <Spinner className="h-5 w-5" /> :
    state === "error" ? <ShieldAlert className="h-5 w-5 text-danger" /> :
    <ShieldX className="h-5 w-5 text-muted-foreground" />;
  const stateLabel =
    state === "running" ? "Online" :
    state === "starting" ? `Starting ${st.containers_running}/${st.containers_total} containers` :
    state === "error" ? "Error" : "Stopped";
  const up = state === "running" || state === "starting";

  return (
    <Card className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-sm flex items-center gap-2">
          {st.label} engine
          <span className="text-muted-foreground font-normal">{stateLabel}</span>
          {state === "running" && <Badge variant="success">reachable</Badge>}
        </div>
        <div className="text-muted-foreground text-xs mt-0.5 font-mono truncate">
          {st.containers_running}/{st.containers_total} containers running
          {st.error ? ` — ${st.error}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Select
          value={st.provider}
          onChange={(e) => switchProvider(e.target.value)}
          className="h-9 max-w-[170px] text-sm"
          disabled={up || busy}
          title="Active engine"
        >
          {st.engines.map((e) => (
            <option key={e.key} value={e.key}>
              {e.label}
            </option>
          ))}
        </Select>
        {up ? (
          <Button size="sm" variant="outline" onClick={() => act("stop", "stop")} disabled={busy}>
            {busy ? <Spinner /> : <Square className="h-4 w-4" />} Stop
          </Button>
        ) : (
          <Button size="sm" onClick={() => act("start", "start")} disabled={busy}>
            {busy ? <Spinner /> : <Play className="h-4 w-4" />} Start
          </Button>
        )}
      </div>
      {err && <p className="text-sm text-danger w-full sm:w-auto">{err}</p>}
    </Card>
  );
}
