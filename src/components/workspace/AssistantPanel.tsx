import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  Bug, Code2, Copy, FlaskConical, Gauge, Loader2, MessageSquare, RotateCcw, Send, Square, Trash2, Wand2, Compass, ArrowDownToLine, Replace,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Msg = { id: string; role: "user" | "assistant"; content: string; error?: boolean };

export type EditorCtx = { path: string; language: string; content: string; selection: string } | null;

const ACTIONS = [
  { label: "Explain", icon: MessageSquare, prompt: "Explain this code: what it does, the important logic, and a short line-by-line breakdown." },
  { label: "Debug", icon: Bug, prompt: "Debug this code. Give probable cause, explanation, corrected code, reason for the fix, and suggested test cases." },
  { label: "Refactor", icon: Code2, prompt: "Refactor this code for readability, naming and structure while preserving behavior. Return the full refactored code." },
  { label: "Optimize", icon: Gauge, prompt: "Identify performance issues and suggest a more efficient implementation if justified." },
  { label: "Tests", icon: FlaskConical, prompt: "Generate relevant unit tests for this code (JUnit 5 for Java)." },
];

function lastCodeBlock(md: string) {
  const m = [...md.matchAll(/```[\w-]*\n([\s\S]*?)```/g)];
  return m.length ? (m[m.length - 1]?.[1] ?? null) : null;
}

export function AssistantPanel({
  projectId, getContext, onInsert, onReplaceSelection,
}: {
  projectId: string;
  getContext: () => EditorCtx;
  onInsert: (code: string) => void;
  onReplaceSelection: (code: string) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    supabase.from("chat_messages").select("id,role,content").eq("project_id", projectId).order("created_at").then(({ data, error }) => {
      if (!alive) return;
      if (error) toast.error("Couldn't load conversation");
      setMessages((data ?? []) as Msg[]);
      setLoadingHistory(false);
    });
    taRef.current?.focus();
    return () => { alive = false; };
  }, [projectId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send(prompt: string, withCode = true) {
    if (!prompt.trim() || busy) return;
    const ctx = getContext();
    let context = "";
    if (withCode && ctx) {
      context = `File: ${ctx.path} (${ctx.language})\n\`\`\`${ctx.language}\n${ctx.content}\n\`\`\``;
      if (ctx.selection) context += `\n\nSelected code:\n\`\`\`${ctx.language}\n${ctx.selection}\n\`\`\``;
    }
    const uid = crypto.randomUUID();
    const aid = crypto.randomUUID();
    setMessages((m) => [...m, { id: uid, role: "user", content: prompt }, { id: aid, role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/chat", {
        method: "POST",
        signal: ac.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ projectId, prompt, context }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Network error." }));
        throw new Error(err.error ?? "Request failed.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        setMessages((m) => m.map((x) => (x.id === aid ? { ...x, content: x.content + chunk } : x)));
      }
    } catch (e) {
      const aborted = (e as Error).name === "AbortError";
      setMessages((m) =>
        m.map((x) => (x.id === aid ? { ...x, error: !aborted, content: x.content || (aborted ? "_Cancelled._" : (e as Error).message) } : x)),
      );
    } finally {
      setBusy(false);
      abortRef.current = null;
      taRef.current?.focus();
    }
  }

  function retry(idx: number) {
    const prev = messages.slice(0, idx).reverse().find((m) => m.role === "user");
    if (prev) send(prev.content);
  }

  async function clear() {
    const { error } = await supabase.from("chat_messages").delete().eq("project_id", projectId);
    if (error) { toast.error("Couldn't clear conversation"); return; }
    setMessages([]);
    toast.success("Conversation cleared");
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Compass className="h-4 w-4 text-primary" /> Pilot
        </div>
        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Clear conversation" onClick={() => setConfirmClear(true)} disabled={!messages.length}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1 border-b p-2">
        {ACTIONS.map((a) => (
          <Button key={a.label} size="sm" variant="secondary" className="h-7 px-2 text-xs" disabled={busy} onClick={() => send(a.prompt)}>
            <a.icon className="h-3.5 w-3.5" /> {a.label}
          </Button>
        ))}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {loadingHistory && <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />}
        {!loadingHistory && messages.length === 0 && (
          <div className="mt-8 text-center text-sm text-muted-foreground">
            <Wand2 className="mx-auto h-6 w-6 text-primary" />
            <p className="mt-2">Ask about the open file, or describe code to generate.</p>
            <p className="mt-1 font-mono text-xs">e.g. "Create a Java method that checks if a number is prime"</p>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={m.id} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="group text-sm">
              {m.content === "" && busy ? (
                <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</div>
              ) : (
                <div className={m.error ? "rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive" : "prose-chat"}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              )}
              {m.content && !(busy && i === messages.length - 1) && (
                <div className="mt-1 flex gap-1 opacity-70 group-hover:opacity-100">
                  {!m.error && (
                    <>
                      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => { navigator.clipboard.writeText(m.content); toast.success("Copied"); }}>
                        <Copy className="h-3 w-3" /> Copy
                      </Button>
                      {lastCodeBlock(m.content) && (
                        <>
                          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => onInsert(lastCodeBlock(m.content)!)}>
                            <ArrowDownToLine className="h-3 w-3" /> Insert
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => onReplaceSelection(lastCodeBlock(m.content)!)}>
                            <Replace className="h-3 w-3" /> Replace selection
                          </Button>
                        </>
                      )}
                    </>
                  )}
                  {(m.error || i === messages.length - 1) && (
                    <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => retry(i)}>
                      <RotateCcw className="h-3 w-3" /> Retry
                    </Button>
                  )}
                </div>
              )}
            </div>
          ),
        )}
      </div>

      <form
        className="border-t p-2"
        onSubmit={(e) => { e.preventDefault(); send(input); }}
      >
        <div className="relative">
          <Textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder="Ask Pilot about your code…"
            className="min-h-[72px] resize-none pr-12 text-sm"
            maxLength={8000}
          />
          {busy ? (
            <Button type="button" size="icon" variant="secondary" className="absolute bottom-2 right-2 h-8 w-8" aria-label="Stop" onClick={() => abortRef.current?.abort()}>
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button type="submit" size="icon" className="absolute bottom-2 right-2 h-8 w-8" aria-label="Send" disabled={!input.trim()}>
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </form>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear conversation?</AlertDialogTitle>
            <AlertDialogDescription>All messages for this project will be deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={clear}>Clear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
