import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Judge0 language ids
const LANG_IDS: Record<string, number> = {
  java: 62, c: 50, cpp: 54, python: 71, javascript: 63, typescript: 74, sql: 82,
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export const Route = createFileRoute("/api/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return json(401, { error: "Please sign in again." });
        const url = process.env["SUPABASE_URL"]!;
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
        const sb = createClient<Database>(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { fetch: (i, init) => { const h = new Headers(init?.headers); h.set("apikey", key); return fetch(i, { ...init, headers: h }); } },
        });
        const { data: u } = await sb.auth.getUser(token);
        if (!u.user) return json(401, { error: "Please sign in again." });

        let body: { language?: string; code?: string; stdin?: string };
        try { body = await request.json(); } catch { return json(400, { error: "Invalid request." }); }
        const id = LANG_IDS[body.language ?? ""];
        if (!id) return json(400, { error: `Running ${body.language} isn't supported.` });
        const code = String(body.code ?? "");
        if (code.length > 100000) return json(400, { error: "Code is too large." });
        const stdin = String(body.stdin ?? "").slice(0, 20000);

        const base = process.env["JUDGE0_URL"] ?? "https://ce.judge0.com";
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        const jkey = process.env["JUDGE0_API_KEY"];
        if (jkey) { headers["X-RapidAPI-Key"] = jkey; headers["X-Auth-Token"] = jkey; }

        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 30000);
        try {
          const res = await fetch(`${base}/submissions?base64_encoded=false&wait=true`, {
            method: "POST", headers, signal: ac.signal,
            body: JSON.stringify({ language_id: id, source_code: code, stdin, cpu_time_limit: 5, memory_limit: 256000 }),
          });
          if (res.status === 429) return json(429, { error: "The compiler service is busy. Please retry in a moment." });
          if (!res.ok) return json(502, { error: `Compiler service error (${res.status}).` });
          const r = (await res.json()) as {
            stdout: string | null; stderr: string | null; compile_output: string | null; message: string | null;
            time: string | null; status: { id: number; description: string };
          };
          const cap = (s: string | null) => (s ?? "").slice(0, 20000);
          return json(200, {
            stdout: cap(r.stdout),
            stderr: cap(r.compile_output) + cap(r.stderr) + (r.message && r.status.id !== 3 ? r.message : ""),
            status: r.status.description,
            exitCode: r.status.id === 3 ? 0 : 1,
            durationMs: r.time ? Math.round(parseFloat(r.time) * 1000) : 0,
          });
        } catch (e) {
          return json(504, { error: (e as Error).name === "AbortError" ? "Execution timed out." : "Couldn't reach the compiler service." });
        } finally {
          clearTimeout(timer);
        }
      },
    },
  },
});
