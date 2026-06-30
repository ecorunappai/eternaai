import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Sparkles, Send, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/assistant")({
  head: () => ({ meta: [{ title: "AI Assistant — Eterna AI" }] }),
  component: Assistant,
});

const SUGGESTIONS = [
  "Draft a DMCA takedown for an Instagram reel that re-uploaded my video",
  "What's the fastest enforcement path for deepfakes on TikTok?",
  "Write a cease-and-desist letter for brand impersonation on a website",
  "Explain Section 512(c) DMCA notice requirements in plain English",
];

function Assistant() {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || busy) return;
    sendMessage({ text: input });
    setInput("");
  }

  return (
    <AppShell title="AI Assistant">
      <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-4xl flex-col">
        <div className="mb-4">
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />Ask Eterna</h1>
          <p className="text-sm text-muted-foreground">Your AI co-pilot for content protection, DMCA drafting, and enforcement strategy.</p>
        </div>

        <div className="flex-1 overflow-y-auto rounded-2xl border border-border bg-card p-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl text-primary-foreground" style={{ background: "var(--gradient-violet)" }}><Sparkles className="h-6 w-6" /></div>
              <h3 className="mt-4 font-display text-lg font-semibold">How can I help protect your work?</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-md">Ask anything about DMCA, takedowns, copyright, deepfakes, or platform enforcement.</p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2 max-w-2xl w-full">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => sendMessage({ text: s })} className="rounded-xl border border-border bg-background p-3 text-left text-sm hover:border-primary hover:bg-primary/5 transition-colors">{s}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((m) => {
                const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
                return (
                  <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
                    {m.role === "assistant" && <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-primary-foreground" style={{ background: "var(--gradient-violet)" }}><Sparkles className="h-4 w-4" /></div>}
                    <div className={`rounded-2xl px-4 py-3 max-w-[80%] text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                      <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-headings:my-2 prose-pre:bg-background/50"><ReactMarkdown>{text}</ReactMarkdown></div>
                    </div>
                  </div>
                );
              })}
              {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Thinking…</div>}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <form onSubmit={submit} className="mt-4 flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask Eterna anything…" className="flex-1 h-12 rounded-xl border border-input bg-card px-4 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" />
          <button disabled={busy || !input.trim()} className="grid h-12 w-12 place-items-center rounded-xl text-primary-foreground disabled:opacity-40" style={{ background: "var(--gradient-violet)" }}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
