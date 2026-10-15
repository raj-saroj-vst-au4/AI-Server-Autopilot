"use client";
import { useEffect, useRef, useState } from "react";
import { Bot, Send, Plus, Trash2, User, Menu } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Spinner, Select } from "@/components/ui/misc";
import { api, ChatSession, ChatMessage, ChatModel } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function ChatPage() {
  return (
    <AppShell>
      <Chat />
    </AppShell>
  );
}

const SUGGESTIONS = [
  "List all servers and their status",
  "Check uptime of all servers",
  "Create user 'deploy' on web-prod-01",
  "Set disk quota 5GB for user alice on db-01",
];

function Chat() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [models, setModels] = useState<ChatModel[]>([]);
  const [model, setModel] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  function chooseModel(id: string) {
    setModel(id);
    try {
      localStorage.setItem("clawdbot_model", id);
    } catch {}
  }

  async function loadSessions() {
    const s = await api<ChatSession[]>("/chat/sessions");
    setSessions(s);
    if (!activeId && s.length > 0) setActiveId(s[0].id);
    return s;
  }

  async function newSession() {
    const s = await api<ChatSession>("/chat/sessions", { method: "POST" });
    await loadSessions();
    setActiveId(s.id);
    setMessages([]);
    setDrawerOpen(false);
  }

  async function loadMessages(id: number) {
    setMessages(await api<ChatMessage[]>(`/chat/sessions/${id}/messages`));
  }

  async function deleteSession(id: number) {
    await api(`/chat/sessions/${id}`, { method: "DELETE" });
    const s = await loadSessions();
    if (activeId === id) {
      setActiveId(s[0]?.id ?? null);
      setMessages([]);
    }
  }

  useEffect(() => {
    loadSessions();
    api<ChatModel[]>("/chat/models")
      .then((ms) => {
        setModels(ms);
        let saved: string | null = null;
        try {
          saved = localStorage.getItem("clawdbot_model");
        } catch {}
        const def = ms.find((m) => m.default)?.id || ms[0]?.id || "";
        setModel(saved && ms.some((m) => m.id === saved) ? saved : def);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeId) loadMessages(activeId);
  }, [activeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setError("");
    let sid = activeId;
    if (!sid) {
      const s = await api<ChatSession>("/chat/sessions", { method: "POST" });
      sid = s.id;
      setActiveId(sid);
      await loadSessions();
    }
    setInput("");
    setMessages((m) => [
      ...m,
      { id: Date.now(), role: "user", content, tool_calls: null, tool_name: null, ts: new Date().toISOString() },
    ]);
    setSending(true);
    try {
      const replies = await api<ChatMessage[]>(`/chat/sessions/${sid}/send`, {
        method: "POST",
        body: JSON.stringify({ content, model: model || undefined }),
      });
      setMessages((m) => [...m, ...replies]);
      loadSessions();
    } catch (e: any) {
      setError(e.message || "Clawdbot is unavailable right now.");
    } finally {
      setSending(false);
    }
  }

  const SessionList = (
    <div className="flex flex-col h-full bg-panel-2">
      <div className="p-3 border-b border-border">
        <Button className="w-full" onClick={newSession}>
          <Plus className="h-4 w-4" /> New chat
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={cn(
              "group flex items-center gap-2 rounded-md px-2.5 py-2 text-sm cursor-pointer transition-colors",
              activeId === s.id ? "bg-signal/10 text-signal" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
            onClick={() => {
              setActiveId(s.id);
              setDrawerOpen(false);
            }}
          >
            <Bot className="h-4 w-4 shrink-0" />
            <span className="truncate flex-1">{s.title}</span>
            <button
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-danger transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                deleteSession(s.id);
              }}
              aria-label="Delete chat"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-4">
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border border-border rounded-lg overflow-hidden">
        {SessionList}
      </aside>

      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-ground/80 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="relative w-64 border-r border-border z-50">{SessionList}</aside>
        </div>
      )}

      <div className="flex-1 flex flex-col border border-border rounded-lg bg-panel min-w-0 overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-border p-3">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawerOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-signal/40 bg-signal/10 text-signal shrink-0">
            <Bot className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="font-semibold text-sm tracking-tight">Clawdbot</div>
            <div className="text-xs text-muted-foreground">Fleet-wide operator</div>
          </div>
          {models.length > 0 && (
            <Select
              value={model}
              onChange={(e) => chooseModel(e.target.value)}
              className="ml-auto max-w-[190px] h-8 text-xs"
              title="Model"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !sending && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4">
              <span className="h-12 w-12 rounded-md border border-signal/40 bg-signal/10 flex items-center justify-center">
                <Bot className="h-6 w-6 text-signal" />
              </span>
              <div>
                <div className="font-semibold tracking-tight">How can I help you run the fleet?</div>
                <div className="text-sm text-muted-foreground mt-0.5">I execute real actions on your servers.</div>
              </div>
              <div className="grid sm:grid-cols-2 gap-2 w-full max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-sm rounded-md border border-border bg-panel-2 p-3 hover:border-signal/50 hover:bg-accent transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
              <span
                className={cn(
                  "h-8 w-8 rounded-md flex items-center justify-center shrink-0",
                  m.role === "user" ? "bg-signal text-primary-foreground" : "border border-border bg-panel-2"
                )}
              >
                {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </span>
              <div
                className={cn(
                  "rounded-lg px-4 py-2.5 max-w-[85%] text-sm whitespace-pre-wrap break-words",
                  m.role === "user" ? "bg-signal text-primary-foreground" : "bg-panel-2 border border-border"
                )}
              >
                {m.content}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex gap-3">
              <span className="h-8 w-8 rounded-md border border-border bg-panel-2 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4" />
              </span>
              <div className="rounded-lg px-4 py-3 bg-panel-2 border border-border flex items-center gap-2">
                <Spinner /> <span className="text-sm text-muted-foreground">Working…</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error && <div className="px-4 py-2 text-sm text-danger border-t border-border">{error}</div>}

        <div className="border-t border-border p-3">
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Message Clawdbot…"
              rows={1}
              className="flex-1 resize-none rounded-md border border-input bg-panel-2 px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-signal focus-visible:ring-1 focus-visible:ring-signal max-h-32"
            />
            <Button type="submit" size="icon" disabled={sending || !input.trim()} aria-label="Send message">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
