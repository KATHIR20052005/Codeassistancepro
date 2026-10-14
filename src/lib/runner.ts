import { supabase } from "@/integrations/supabase/client";

export type RunResult = { stdout: string; stderr: string; exitCode: number; durationMs: number; status?: string };

export const RUNNABLE = ["java", "c", "cpp", "python", "javascript", "typescript", "sql"];
export const WEB = ["html", "css"];

// Compiles and runs code on a remote sandboxed compiler (Judge0) via our server.
export async function runCode(language: string, code: string, stdin: string): Promise<RunResult> {
  if (!RUNNABLE.includes(language)) {
    return { stdout: "", stderr: `Running ${language} isn't supported.`, exitCode: -1, durationMs: 0 };
  }
  const { data } = await supabase.auth.getSession();
  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      body: JSON.stringify({ language, code, stdin }),
    });
    const j = await res.json();
    if (!res.ok) return { stdout: "", stderr: j.error ?? "Run failed.", exitCode: -1, durationMs: 0 };
    return j as RunResult;
  } catch {
    return { stdout: "", stderr: "Network error — couldn't reach the server.", exitCode: -1, durationMs: 0 };
  }
}

// Builds a self-contained page from an HTML file, inlining linked project CSS/JS files.
export function buildWebPreview(html: string, getFile: (name: string) => string | undefined) {
  const norm = (p: string) => p.replace(/^\.\//, "").replace(/^\//, "");
  const find = (p: string) => getFile(norm(p)) ?? getFile(norm(p).split("/").pop()!);
  return html
    .replace(/<link[^>]*href=["']([^"']+\.css)["'][^>]*>/gi, (m, href) => {
      const c = find(href);
      return c !== undefined ? `<style>${c}</style>` : m;
    })
    .replace(/<script([^>]*)src=["']([^"']+\.js)["']([^>]*)><\/script>/gi, (m, a, src, b) => {
      const c = find(src);
      return c !== undefined ? `<script${a}${b}>${c.replace(/<\/script>/gi, "<\\/script>")}</script>` : m;
    });
}
