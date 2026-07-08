"use client";
import { useEffect, useRef, useState } from "react";
import { Bot, Send, User, Wrench } from "lucide-react";
import { api, Server } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge, Spinner } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
  actions?: string[];
}

export function ServerChat({ server }: { server: Server }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const suggestions = [
    "Check uptime",
    "Show disk usage",
    "Restart nginx",
    "Create user deploy",
    "Reboot this server",
  ];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setError("");
    setInput("");
    const history = [...messages, { role: "user" as const, content }];
    setMessages(history);
    setSending(true);
    try {
      const res = await api<{ reply: string; actions: string[] }>(
        `/servers/${server.id}/chat`,
        {
          method: "POST",
          body: JSON.stringify({
            messages: history.map((m) => ({ role: m.role, content: m.content })),
          }),
        }
      );
      setMessages((m) => [...m, { role: "assistant", content: res.reply, actions: res.actions }]);
    } catch (e: any) {
      setError(e.message || "Assistant unavailable");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 border-b p-3">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm leading-tight">Server Assistant</div>
          <div className="text-xs text-muted-foreground truncate">
            Acting on {server.name}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 && !sending && (
          <div className="text-center py-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Ask me to run tasks on <span className="font-medium text-foreground">{server.name}</span>.
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs rounded-full border px-3 py-1.5 hover:bg-accent transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn("flex gap-2.5", m.role === "user" && "flex-row-reverse")}>
            <div className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
              m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
            )}>
              {m.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            </div>
            <div className="max-w-[85%] space-y-1.5">
              <div className={cn(
                "rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
              )}>
                {m.content}
              </div>
              {m.actions && m.actions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {m.actions.map((a, j) => (
                    <Badge key={j} variant="outline" className="gap-1">
                      <Wrench className="h-3 w-3" /> {a}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex gap-2.5">
            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Bot className="h-3.5 w-3.5" />
            </div>
            <div className="rounded-2xl px-3.5 py-2.5 bg-muted flex items-center gap-2">
              <Spinner /> <span className="text-xs text-muted-foreground">Working…</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && <div className="px-3 py-2 text-xs text-destructive border-t">{error}</div>}

      <div className="border-t p-3">
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder={`Ask about ${server.name}…`}
            rows={1}
            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-h-28"
          />
          <Button type="submit" size="icon" disabled={sending || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
