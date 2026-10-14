import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const SYSTEM = `You are CodePilot AI, an expert coding assistant inside a browser IDE.
- Answer in concise Markdown. Put code in fenced blocks with a language tag.
- When fixing or generating code, give one complete code block the user can insert.
- For debugging: probable cause, explanation, corrected code, reason for the fix, suggested test cases.
- For Java tests prefer JUnit 5.
- Never claim you executed or tested code.`;

const MAX_PROMPT = 8000;
const MAX_CONTEXT = 60000;
const MODEL = "openai/gpt-6-astra";

function json(status: number, error: string) {
  return new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return json(401, "Please sign in again.");
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return json(500, "AI is not configured on the server.");

        const url = process.env["SUPABASE_URL"]!;
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
        const sb = createClient<Database>(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            headers: { Authorization: `Bearer ${token}` },
            fetch: (input, init) => {
              const h = new Headers(init?.headers);
              h.set("apikey", key);
              return fetch(input, { ...init, headers: h });
            },
          },
        });
        const { data: userData, error: userErr } = await sb.auth.getUser(token);
        if (userErr || !userData.user) return json(401, "Please sign in again.");
        const userId = userData.user.id;

        let body: { projectId?: string; prompt?: string; context?: string };
        try { body = await request.json(); } catch { return json(400, "Invalid request."); }
        const prompt = (body.prompt ?? "").trim();
        const context = (body.context ?? "").slice(0, MAX_CONTEXT);
        if (!body.projectId || !prompt) return json(400, "Message is required.");
        if (prompt.length > MAX_PROMPT) return json(400, `Message is too long (max ${MAX_PROMPT} characters).`);

        const { data: project } = await sb.from("projects").select("id").eq("id", body.projectId).maybeSingle();
        if (!project) return json(404, "Project not found.");

        const { data: history } = await sb
          .from("chat_messages").select("role,content").eq("project_id", project.id)
          .order("created_at", { ascending: false }).limit(16);

        const { error: insErr } = await sb.from("chat_messages").insert({ project_id: project.id, user_id: userId, role: "user", content: prompt });
        if (insErr) return json(500, "Couldn't save your message.");

        const input = [
          ...(history ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
          { role: "user" as const, content: context ? `${prompt}\n\n---\nEditor context:\n${context}` : prompt },
        ];

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
          method: "POST",
          signal: request.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "Lovable-API-Key": apiKey,
            "X-Lovable-AIG-SDK": "fetch",
          },
          body: JSON.stringify({ model: MODEL, instructions: SYSTEM, input, stream: true, store: false, reasoning: { effort: "low" } }),
        });

        if (!upstream.ok || !upstream.body) {
          const msg =
            upstream.status === 429 ? "Rate limit reached. Please wait a moment and retry."
            : upstream.status === 402 ? "AI credits are exhausted for this workspace."
            : upstream.status === 401 ? "AI credentials are invalid."
            : upstream.status === 404 ? "The AI model is unavailable."
            : `AI request failed (${upstream.status}).`;
          console.error("AI gateway error", upstream.status);
          return json(upstream.status >= 400 ? upstream.status : 502, msg);
        }

        const enc = new TextEncoder();
        const dec = new TextDecoder();
        let full = "";
        const stream = new ReadableStream({
          async start(controller) {
            const reader = upstream.body!.getReader();
            let buf = "";
            let failed = false;
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += dec.decode(value, { stream: true });
                const lines = buf.split("\n");
                buf = lines.pop() ?? "";
                for (const line of lines) {
                  if (!line.startsWith("data:")) continue;
                  const d = line.slice(5).trim();
                  if (!d || d === "[DONE]") continue;
                  try {
                    const ev = JSON.parse(d);
                    if (ev.type === "response.output_text.delta" && ev.delta) {
                      full += ev.delta;
                      controller.enqueue(enc.encode(ev.delta));
                    } else if (ev.type === "response.failed" || ev.type === "error") {
                      failed = true;
                    }
                  } catch { /* partial */ }
                }
              }
              if (failed && !full) controller.enqueue(enc.encode("\n\n_The AI request failed. Please retry._"));
            } catch (e) {
              if ((e as Error).name !== "AbortError") console.error("stream error", e);
            } finally {
              if (full) {
                const { error } = await sb.from("chat_messages").insert({ project_id: project.id, user_id: userId, role: "assistant", content: full });
                if (error) console.error("save assistant failed", error.message);
              }
              controller.close();
            }
          },
        });
        const headers = new Headers({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" });
        const run = upstream.headers.get("X-Lovable-AIG-Run-ID");
        if (run) headers.set("X-Lovable-AIG-Run-ID", run);
        return new Response(stream, { headers });
      },
    },
  },
});
