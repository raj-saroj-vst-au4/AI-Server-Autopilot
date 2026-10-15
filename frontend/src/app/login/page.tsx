"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Radar } from "lucide-react";
import { api, setToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Spinner } from "@/components/ui/misc";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api<{ token: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setToken(res.token);
      router.replace("/");
    } catch (err: any) {
      setError(err.message || "Those credentials didn't work. Check and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      <div
        className="pointer-events-none absolute left-1/2 top-1/3 h-[480px] w-[480px] -translate-x-1/2 rounded-full opacity-[0.12] blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(var(--signal)), transparent 70%)" }}
      />
      <div className="relative w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-md border border-signal/40 bg-signal/10 text-signal">
            <Radar className="h-6 w-6" />
          </span>
          <div className="leading-tight">
            <div className="text-lg font-semibold tracking-tight">Autopilot</div>
            <div className="text-xs text-muted-foreground font-mono">fleet console</div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-panel p-6">
          <h1 className="text-base font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-muted-foreground mt-1 mb-5">Access the operations console.</p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Username</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
            </div>
            <div>
              <Label>Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Spinner /> : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Live telemetry, auto-remediation, and on-demand security scans.
        </p>
      </div>
    </div>
  );
}
