"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Square, Cpu, CircleCheck, CircleOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, Spinner } from "@/components/ui/misc";
import { api, ApiError, LlmStatus } from "@/lib/api";

// Live status + start/stop for the LLM container (runs on another fleet host).
export function LlmControl() {
  const [st, setSt] = useState<LlmStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    try {
      setSt(await api<LlmStatus>("/llm/status"));
    } catch {}
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loading = !!st && st.container_running === true && !st.reachable;
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(load, loading || busy ? 3000 : 12000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, busy]);

  async function act(path: string, label: string) {
    setBusy(true);
    setErr("");
    try {
      setSt(await api<LlmStatus>(`/llm/${path}`, { method: "POST" }));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : `Failed to ${label} the LLM`);
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

  const state = st.reachable ? "online" : loading ? "loading" : st.container_running === false ? "stopped" : "unknown";
  const icon =
    state === "online" ? <CircleCheck className="h-5 w-5 text-ok" /> :
    state === "loading" ? <Spinner className="h-5 w-5" /> :
    state === "stopped" ? <CircleOff className="h-5 w-5 text-muted-foreground" /> :
    <Cpu className="h-5 w-5 text-warn" />;
  const stateLabel =
    state === "online" ? "Online" :
    state === "loading" ? "Loading model" :
    state === "stopped" ? "Stopped" : "Host unreachable";
  const up = st.reachable || st.container_running === true;

  return (
    <Card className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-sm flex items-center gap-2">
          Local LLM
          <span className="text-muted-foreground font-normal">{stateLabel}</span>
          {state === "online" && <Badge variant="success">serving</Badge>}
        </div>
        <div className="text-muted-foreground text-xs mt-0.5 font-mono truncate">
          {st.model || st.container} on {st.host_name || st.host}
        </div>
      </div>
      <div className="shrink-0">
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
