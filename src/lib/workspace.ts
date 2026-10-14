import { supabase } from "@/integrations/supabase/client";

export type FileRow = {
  id: string;
  project_id: string;
  path: string;
  is_folder: boolean;
  content: string;
  updated_at: string;
};

export const LANGS: Record<string, string> = {
  java: "java", js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
  html: "html", css: "css", json: "json", xml: "xml", sql: "sql", md: "markdown", py: "python", c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp",
};

export function langFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return LANGS[ext] ?? "plaintext";
}

export const PATH_RE = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/;

export function validatePath(p: string): string | null {
  if (!p) return "Name is required.";
  if (!PATH_RE.test(p) || p.split("/").some((s) => s === "." || s === "..")) return "Use letters, numbers, dots, dashes and underscores only.";
  if (p.length > 300) return "Path too long.";
  return null;
}

export async function currentUserId() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

export function starterFiles(name: string) {
  return [
    { path: "src", is_folder: true, content: "" },
    {
      path: "src/Main.java",
      is_folder: false,
      content: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from ${name.replace(/"/g, "")}!");\n    }\n}\n`,
    },
    { path: "src/app.js", is_folder: false, content: `function greet(name) {\n  return "Hello, " + name;\n}\n\nconsole.log(greet("CodeJunior"));\n` },
    { path: "README.md", is_folder: false, content: `# ${name}\n\nCreated with CodeJunior.\n` },
  ];
}
