"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Server,
  AlertTriangle,
  Bot,
  Zap,
  Menu,
  LogOut,
  ShieldAlert,
  Radar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, clearToken, getToken } from "@/lib/api";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/servers", label: "Servers", icon: Server },
  { href: "/events", label: "Events", icon: AlertTriangle },
  { href: "/automations", label: "Automations", icon: Zap },
  { href: "/security", label: "Security", icon: ShieldAlert },
  { href: "/chat", label: "Clawdbot", icon: Bot },
];

interface FleetVitals {
  total_servers: number;
  online: number;
  warning: number;
  critical: number;
  offline: number;
  open_events: number;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [vitals, setVitals] = useState<FleetVitals | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
    } else {
      setReady(true);
    }
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const load = () =>
      api<FleetVitals>("/dashboard/summary")
        .then((v) => alive && setVitals(v))
        .catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [ready]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (!ready) return null;

  function logout() {
    clearToken();
    router.replace("/login");
  }

  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const section = nav.find((n) => active(n.href))?.label ?? "Dashboard";

  const crit = (vitals?.critical ?? 0) + (vitals?.offline ?? 0);
  const warn = vitals?.warning ?? 0;

  const SidebarContent = (
    <div className="flex h-full flex-col bg-panel-2">
      <Link href="/" className="flex items-center gap-2.5 px-5 h-16 border-b border-border">
        <span className="flex h-8 w-8 items-center justify-center rounded-md border border-signal/40 bg-signal/10 text-signal">
          <Radar className="h-[18px] w-[18px]" />
        </span>
        <span className="leading-tight">
          <span className="block font-semibold text-[15px] tracking-tight">Autopilot</span>
          <span className="block text-[11px] text-muted-foreground font-mono">fleet console</span>
        </span>
      </Link>

      <nav className="flex-1 space-y-0.5 p-3">
        {nav.map((item) => {
          const on = active(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                on
                  ? "bg-signal/10 text-signal"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {on && <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-signal" />}
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Live fleet readout — the console pulse, on every page */}
      <div className="mx-3 mb-3 rounded-md border border-border bg-panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] text-muted-foreground">Fleet</span>
          <span className="font-mono text-sm tabular-nums">
            <span className="text-ok">{vitals?.online ?? 0}</span>
            <span className="text-muted-foreground">/{vitals?.total_servers ?? 0}</span>
          </span>
        </div>
        <div className="mt-2 flex gap-3 text-[11px] font-mono">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-warn" /> {warn}
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-danger" /> {crit}
          </span>
          <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
            <AlertTriangle className="h-3 w-3" /> {vitals?.open_events ?? 0}
          </span>
        </div>
      </div>

      <div className="border-t border-border p-3">
        <Button variant="ghost" className="w-full justify-start" onClick={logout}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex">
      <aside className="hidden md:flex w-60 flex-col border-r border-border fixed inset-y-0 left-0">
        {SidebarContent}
      </aside>

      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-ground/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="relative w-64 border-r border-border z-50">{SidebarContent}</aside>
        </div>
      )}

      <div className="flex-1 md:ml-60 flex flex-col min-w-0">
        <header className="h-16 border-b border-border bg-ground/80 backdrop-blur sticky top-0 z-30 flex items-center gap-2 px-4 sm:px-6">
          <Button variant="ghost" size="icon" className="md:hidden -ml-2" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold tracking-tight">{section}</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-signal" />
              </span>
              live
            </span>
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
