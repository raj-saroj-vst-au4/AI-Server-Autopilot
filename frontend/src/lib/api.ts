// API client. In the browser we call same-origin /api/* which Next rewrites to the backend.
const TOKEN_KEY = "autopilot_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new ApiError(401, "Unauthorized");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {}
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---- typed endpoints ----
export type ServerStatus = "online" | "warning" | "critical" | "offline" | "unknown";

export interface Metric {
  ts: string;
  cpu_pct: number | null;
  mem_pct: number | null;
  disk_pct: number | null;
  load1: number | null;
  load5: number | null;
  load15: number | null;
  uptime_s: number | null;
  cores: number | null;
}

export interface Server {
  id: number;
  name: string;
  ip: string;
  ssh_port: number;
  ssh_user: string;
  bmc_ip: string | null;
  bmc_user: string | null;
  description: string | null;
  high_priority: boolean;
  status: ServerStatus;
  hostname: string | null;
  last_seen: string | null;
  last_error: string | null;
  has_ssh_password: boolean;
  has_ssh_key: boolean;
  has_bmc_password: boolean;
  open_events: number;
  latest: Metric | null;
}

export interface EventItem {
  id: number;
  server_id: number;
  server_name?: string;
  ts: string;
  severity: "info" | "warning" | "critical";
  category: string;
  message: string;
  details: Record<string, any> | null;
  resolved: boolean;
  resolved_at: string | null;
}

export interface Analysis {
  id: number;
  server_id: number;
  ts: string;
  model: string | null;
  summary: string | null;
  health_score: number | null;
  issues: { title: string; severity: string; detail: string }[] | null;
  actions: { action: string; priority: string; command: string | null }[] | null;
  solutions: { issue: string; solution: string }[] | null;
}

export interface AutoAction {
  id: number;
  name: string;
  description: string | null;
  trigger_category: string;
  server_id: number | null;
  server_name?: string | null;
  command: string;
  enabled: boolean;
  require_ai: boolean;
  cooldown_minutes: number;
  last_run_at: string | null;
  created_at: string;
}

export interface ActionRun {
  id: number;
  auto_action_id: number;
  action_name?: string | null;
  server_id: number | null;
  server_name: string | null;
  event_id: number | null;
  ts: string;
  decided_by: string;
  ai_reason: string | null;
  status: string;
  exit_code: number | null;
  output: string | null;
}

export interface ChatSession {
  id: number;
  title: string;
  created_at: string;
}

export interface ChatMessage {
  id: number;
  role: string;
  content: string;
  tool_calls: any[] | null;
  tool_name: string | null;
  ts: string;
}
