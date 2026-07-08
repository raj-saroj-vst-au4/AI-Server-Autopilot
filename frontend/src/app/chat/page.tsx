"use client";
import { useEffect, useRef, useState } from "react";
import { Bot, Send, Plus, Trash2, User, Menu } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { api, ChatSession, ChatMessage } from "@/lib/api";
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
  const endRef = useRef<HTMLDivElement>(null);

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
        body: JSON.stringify({ content }),
      });
      setMessages((m) => [...m, ...replies]);
      loadSessions();
    } catch (e: any) {
      setError(e.message || "Clawdbot is unavailable");
    } finally {
      setSending(false);
    }
  }

  const SessionList = (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <Button className="w-full" onClick={newSession}>
          <Plus className="h-4 w-4" /> New chat
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={cn(
              "group flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer",
              activeId === s.id ? "bg-accent" : "hover:bg-accent/50"
            )}
            onClick={() => { setActiveId(s.id); setDrawerOpen(false); }}
          >
            <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate flex-1">{s.title}</span>
            <button
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
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
      {/* Session sidebar (desktop) */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border rounded-lg bg-card">
        {SessionList}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <aside className="relative w-64 bg-card border-r z-50">{SessionList}</aside>
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 flex flex-col border rounded-lg bg-card min-w-0">
        <div className="flex items-center gap-2 border-b p-3">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawerOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <Bot className="h-5 w-5 text-primary" />
          <div>
            <div className="font-semibold text-sm">Clawdbot</div>
            <div className="text-xs text-muted-foreground">Ask me to manage your servers</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !sending && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <div>
                <div className="font-semibold">How can I help you operate the fleet?</div>
                <div className="text-sm text-muted-foreground">I can run real actions on your servers.</div>
              </div>
              <div className="grid sm:grid-cols-2 gap-2 w-full max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-sm rounded-lg border p-3 hover:bg-accent transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
              )}>
                {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div className={cn(
                "rounded-2xl px-4 py-2.5 max-w-[85%] text-sm whitespace-pre-wrap break-words",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
              )}>
                {m.content}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-2xl px-4 py-3 bg-muted flex items-center gap-2">
                <Spinner /> <span className="text-sm text-muted-foreground">Working…</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error && <div className="px-4 py-2 text-sm text-destructive border-t">{error}</div>}

        <div className="border-t p-3">
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex gap-2 items-end"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder="Message Clawdbot… (e.g. shut down all servers)"
              rows={1}
              className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-h-32"
            />
            <Button type="submit" size="icon" disabled={sending || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
