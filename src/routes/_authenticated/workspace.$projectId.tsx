import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { toast } from "sonner";
import {
  ChevronDown, ChevronRight, Files, FilePlus, FolderPlus, Folder, FileCode, Loader2, Moon, Play, Save,
  Search, Settings, Sun, Trash2, Pencil, X, FolderGit2, Bot, Terminal,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/Logo";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AssistantPanel } from "@/components/workspace/AssistantPanel";
import { currentUserId, langFor, validatePath, type FileRow } from "@/lib/workspace";
import { runCode, buildWebPreview, WEB, type RunResult } from "@/lib/runner";

export const Route = createFileRoute("/_authenticated/workspace/$projectId")({
  head: () => ({
    meta: [
      { title: "Workspace — CodePilot AI" },
      { name: "description", content: "Edit code with the CodePilot AI assistant." },
      { property: "og:title", content: "Workspace — CodePilot AI" },
      { property: "og:description", content: "Code editor with AI assistant." },
    ],
  }),
  component: Workspace,
});

type Panel = "explorer" | "search" | "settings";
type Tree = { name: string; path: string; folder: boolean; file?: FileRow; children: Tree[] };

function buildTree(files: FileRow[]): Tree[] {
  const root: Tree = { name: "", path: "", folder: true, children: [] };
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const f of sorted) {
    const parts = f.path.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const p = parts.slice(0, i + 1).join("/");
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path: p, folder: i < parts.length - 1 || f.is_folder, children: [] };
        node.children.push(child);
      }
      if (i === parts.length - 1 && !f.is_folder) child.file = f;
      node = child;
    });
  }
  const sort = (n: Tree[]) => {
    n.sort((a, b) => (a.folder === b.folder ? a.name.localeCompare(b.name) : a.folder ? -1 : 1));
    n.forEach((c) => sort(c.children));
  };
  sort(root.children);
  return root.children;
}

function Workspace() {
  const { projectId } = Route.useParams();
  const [projectName, setProjectName] = useState("");
  const [files, setFiles] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [panel, setPanel] = useState<Panel | null>("explorer");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [fontSize, setFontSize] = useState(14);
  const [dark, setDark] = useState(true);
  const [query, setQuery] = useState("");
  const [output, setOutput] = useState<RunResult | null>(null);
  const [stdin, setStdin] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [bottomTab, setBottomTab] = useState<"output" | "input" | "preview">("output");
  const [running, setRunning] = useState(false);
  const [showBottom, setShowBottom] = useState(true);
  const [mobileTab, setMobileTab] = useState<"files" | "editor" | "ai">("editor");
  const [nameDialog, setNameDialog] = useState<{ mode: "file" | "folder" | "rename"; base?: string; target?: FileRow } | null>(null);
  const [nameValue, setNameValue] = useState("");
  const [toDelete, setToDelete] = useState<FileRow | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const byId = useMemo(() => Object.fromEntries(files.map((f) => [f.id, f])), [files]);
  const activeFile = active ? byId[active] : undefined;
  const activeContent = active ? (drafts[active] ?? activeFile?.content ?? "") : "";
  const dirty = (id: string) => drafts[id] !== undefined && drafts[id] !== byId[id]?.content;

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    const fs = Number(localStorage.getItem("cp-font"));
    if (fs) setFontSize(fs);
  }, []);

  useEffect(() => {
    (async () => {
      const [{ data: p, error: pe }, { data: f, error: fe }] = await Promise.all([
        supabase.from("projects").select("name").eq("id", projectId).maybeSingle(),
        supabase.from("files").select("id,project_id,path,is_folder,content,updated_at").eq("project_id", projectId),
      ]);
      if (pe || fe || !p) {
        toast.error("Project not found");
        setLoading(false);
        return;
      }
      setProjectName(p.name);
      const rows = (f ?? []) as FileRow[];
      setFiles(rows);
      const first = rows.find((r) => !r.is_folder && r.path.endsWith(".java")) ?? rows.find((r) => !r.is_folder);
      if (first) { setOpenTabs([first.id]); setActive(first.id); }
      setLoading(false);
    })();
  }, [projectId]);

  const save = useCallback(async (id?: string) => {
    const fid = id ?? active;
    if (!fid || !dirty(fid)) return;
    setSaving(true);
    const content = drafts[fid] ?? "";
    const { data, error } = await supabase.from("files").update({ content }).eq("id", fid).select("updated_at").single();
    setSaving(false);
    if (error) { toast.error("Save failed: " + error.message); return; }
    setFiles((fs) => fs.map((f) => (f.id === fid ? { ...f, content, updated_at: data.updated_at } : f)));
    setDrafts((d) => { const n = { ...d }; delete n[fid]; return n; });
    toast.success("Saved");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, drafts, byId]);

  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveRef.current(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    const anyDirty = Object.keys(drafts).some(dirty);
    const h = (e: BeforeUnloadEvent) => { if (anyDirty) e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts]);

  function openFile(f: FileRow) {
    setOpenTabs((t) => (t.includes(f.id) ? t : [...t, f.id]));
    setActive(f.id);
    setMobileTab("editor");
  }

  function closeTab(id: string) {
    if (dirty(id) && !confirm("Discard unsaved changes?")) return;
    setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });
    setOpenTabs((t) => {
      const n = t.filter((x) => x !== id);
      if (active === id) setActive(n[n.length - 1] ?? null);
      return n;
    });
  }

  async function submitName() {
    if (!nameDialog) return;
    const base = nameDialog.base ? nameDialog.base + "/" : "";
    const v = nameValue.trim();
    if (nameDialog.mode === "rename" && nameDialog.target) {
      const t = nameDialog.target;
      const parent = t.path.includes("/") ? t.path.slice(0, t.path.lastIndexOf("/") + 1) : "";
      const np = parent + v;
      const err = validatePath(np);
      if (err) { toast.error(err); return; }
      const { error } = await supabase.from("files").update({ path: np }).eq("id", t.id);
      if (error) { toast.error(error.code === "23505" ? "A file with that name exists." : error.message); return; }
      setFiles((fs) => fs.map((f) => (f.id === t.id ? { ...f, path: np } : f)));
      setNameDialog(null);
      return;
    }
    const path = base + v;
    const err = validatePath(path);
    if (err) { toast.error(err); return; }
    const user_id = await currentUserId();
    const { data, error } = await supabase
      .from("files")
      .insert({ project_id: projectId, user_id, path, is_folder: nameDialog.mode === "folder", content: "" })
      .select("id,project_id,path,is_folder,content,updated_at")
      .single();
    if (error) { toast.error(error.code === "23505" ? "That name already exists." : error.message); return; }
    setFiles((fs) => [...fs, data as FileRow]);
    setNameDialog(null);
    if (!data.is_folder) openFile(data as FileRow);
  }

  async function deleteRow(f: FileRow) {
    const ids = files.filter((x) => x.id === f.id || (f.is_folder && x.path.startsWith(f.path + "/"))).map((x) => x.id);
    const { error } = await supabase.from("files").delete().in("id", ids);
    if (error) { toast.error(error.message); return; }
    setFiles((fs) => fs.filter((x) => !ids.includes(x.id)));
    setOpenTabs((t) => t.filter((x) => !ids.includes(x)));
    if (active && ids.includes(active)) setActive(null);
    toast.success("Deleted");
  }

  async function run() {
    if (!activeFile) return;
    setShowBottom(true);
    const lang = langFor(activeFile.path);
    if (WEB.includes(lang)) {
      const contentOf = (p: string) => {
        const f = files.find((x) => !x.is_folder && (x.path === p || x.path.endsWith("/" + p)));
        return f ? (drafts[f.id] ?? f.content) : undefined;
      };
      const htmlFile = lang === "html" ? activeFile : files.find((x) => !x.is_folder && x.path.endsWith(".html"));
      if (!htmlFile) {
        setOutput({ stdout: "", stderr: "Create an .html file that links this stylesheet to preview it.", exitCode: -1, durationMs: 0 });
        setBottomTab("output");
        return;
      }
      setPreview(buildWebPreview(drafts[htmlFile.id] ?? htmlFile.content, contentOf));
      setBottomTab("preview");
      return;
    }
    setRunning(true);
    setBottomTab("output");
    const r = await runCode(lang, activeContent, stdin);
    setOutput(r);
    setRunning(false);
  }

  function toggleTheme() {
    const n = !dark;
    setDark(n);
    document.documentElement.classList.toggle("dark", n);
    localStorage.setItem("cp-theme", n ? "dark" : "light");
  }

  const getContext = useCallback(() => {
    if (!activeFile) return null;
    const ed = editorRef.current;
    const sel = ed?.getSelection();
    const selection = sel && ed ? ed.getModel()?.getValueInRange(sel) ?? "" : "";
    return { path: activeFile.path, language: langFor(activeFile.path), content: activeContent, selection };
  }, [activeFile, activeContent]);

  function insertCode(code: string, replace: boolean) {
    const ed = editorRef.current;
    if (!ed || !activeFile) { toast.error("Open a file first."); return; }
    const sel = ed.getSelection();
    if (!sel) return;
    if (replace && sel.isEmpty()) { toast.error("Select code in the editor first."); return; }
    ed.executeEdits("pilot", [{ range: sel, text: code, forceMoveMarkers: true }]);
    ed.focus();
    toast.success(replace ? "Selection replaced" : "Code inserted");
  }

  const tree = useMemo(() => buildTree(files), [files]);
  const folderRow = (path: string) => files.find((f) => f.is_folder && f.path === path);

  function renderTree(nodes: Tree[], depth = 0) {
    return nodes.map((n) => {
      const isOpen = !collapsed[n.path];
      const row = n.file ?? folderRow(n.path);
      return (
        <div key={n.path}>
          <div
            className={`group flex cursor-pointer items-center gap-1 py-1 pr-2 text-sm hover:bg-accent ${n.file && n.file.id === active ? "bg-accent text-accent-foreground" : ""}`}
            style={{ paddingLeft: 8 + depth * 12 }}
            onClick={() => (n.folder ? setCollapsed((c) => ({ ...c, [n.path]: isOpen })) : n.file && openFile(n.file))}
          >
            {n.folder ? (isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="w-3.5" />}
            {n.folder ? <Folder className="h-3.5 w-3.5 text-primary" /> : <FileCode className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className="flex-1 truncate">{n.name}</span>
            {n.file && dirty(n.file.id) && <span className="h-1.5 w-1.5 rounded-full bg-warning" />}
            <div className="hidden gap-0.5 group-hover:flex" onClick={(e) => e.stopPropagation()}>
              {n.folder && (
                <>
                  <button aria-label="New file here" onClick={() => { setNameValue(""); setNameDialog({ mode: "file", base: n.path }); }}><FilePlus className="h-3.5 w-3.5" /></button>
                  <button aria-label="New folder here" onClick={() => { setNameValue(""); setNameDialog({ mode: "folder", base: n.path }); }}><FolderPlus className="h-3.5 w-3.5" /></button>
                </>
              )}
              {row && !row.is_folder && (
                <button aria-label="Rename" onClick={() => { setNameValue(n.name); setNameDialog({ mode: "rename", target: row }); }}><Pencil className="h-3.5 w-3.5" /></button>
              )}
              {row && <button aria-label="Delete" onClick={() => setToDelete(row)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>}
            </div>
          </div>
          {n.folder && isOpen && renderTree(n.children, depth + 1)}
        </div>
      );
    });
  }

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const searchResults = query.trim()
    ? files.filter((f) => !f.is_folder).flatMap((f) => {
        const lines = (drafts[f.id] ?? f.content).split("\n");
        return lines
          .map((l, i) => ({ f, line: i + 1, text: l }))
          .filter((x) => x.text.toLowerCase().includes(query.toLowerCase()) || x.f.path.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 20);
      }).slice(0, 100)
    : [];

  const sidePanel = (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      {panel === "explorer" && (
        <>
          <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Explorer
            <div className="flex gap-1">
              <button aria-label="New file" onClick={() => { setNameValue(""); setNameDialog({ mode: "file" }); }}><FilePlus className="h-4 w-4" /></button>
              <button aria-label="New folder" onClick={() => { setNameValue(""); setNameDialog({ mode: "folder" }); }}><FolderPlus className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {files.length === 0 ? <p className="p-3 text-sm text-muted-foreground">No files yet.</p> : renderTree(tree)}
          </div>
        </>
      )}
      {panel === "search" && (
        <div className="flex min-h-0 flex-1 flex-col p-2">
          <Input autoFocus placeholder="Search files…" value={query} onChange={(e) => setQuery(e.target.value)} className="h-8" />
          <div className="mt-2 min-h-0 flex-1 overflow-y-auto text-xs">
            {query && searchResults.length === 0 && <p className="p-2 text-muted-foreground">No matches.</p>}
            {searchResults.map((r, i) => (
              <button key={i} className="block w-full truncate rounded px-2 py-1 text-left hover:bg-accent" onClick={() => {
                openFile(r.f);
                setTimeout(() => { editorRef.current?.revealLineInCenter(r.line); editorRef.current?.setPosition({ lineNumber: r.line, column: 1 }); }, 50);
              }}>
                <span className="text-primary">{r.f.path}:{r.line}</span> <span className="font-mono text-muted-foreground">{r.text.trim()}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {panel === "settings" && (
        <div className="space-y-4 p-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Settings</p>
          <label className="block">
            Editor font size: <span className="font-mono">{fontSize}px</span>
            <input type="range" min={11} max={22} value={fontSize} className="mt-1 w-full accent-primary"
              onChange={(e) => { const v = Number(e.target.value); setFontSize(v); localStorage.setItem("cp-font", String(v)); }} />
          </label>
          <Button variant="secondary" size="sm" onClick={toggleTheme}>{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} {dark ? "Light" : "Dark"} theme</Button>
          <p className="text-xs text-muted-foreground">Tip: Ctrl/Cmd+S saves · Ctrl/Cmd+F / H search &amp; replace in editor.</p>
        </div>
      )}
    </div>
  );

  const editorArea = (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex overflow-x-auto border-b bg-activity">
        {openTabs.map((id) => {
          const f = byId[id];
          if (!f) return null;
          return (
            <div key={id} className={`group flex shrink-0 items-center gap-2 border-r px-3 py-1.5 text-xs ${id === active ? "bg-background text-foreground" : "text-muted-foreground"}`}>
              <button onClick={() => setActive(id)} className="font-mono">{f.path.split("/").pop()}</button>
              {dirty(id) ? <span className="h-2 w-2 rounded-full bg-warning" aria-label="Unsaved" /> : null}
              <button aria-label="Close tab" onClick={() => closeTab(id)} className="opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
            </div>
          );
        })}
      </div>
      <div className="min-h-0 flex-1">
        {activeFile ? (
          <Editor
            key={activeFile.id}
            path={activeFile.path}
            language={langFor(activeFile.path)}
            value={activeContent}
            theme={dark ? "vs-dark" : "light"}
            onMount={(ed) => { editorRef.current = ed; }}
            onChange={(v) => setDrafts((d) => ({ ...d, [activeFile.id]: v ?? "" }))}
            loading={<Loader2 className="h-5 w-5 animate-spin text-primary" />}
            options={{ fontSize, fontFamily: "JetBrains Mono, monospace", minimap: { enabled: false }, automaticLayout: true, folding: true, bracketPairColorization: { enabled: true }, scrollBeyondLastLine: false, tabSize: 2 }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Open a file from the explorer.</div>
        )}
      </div>
      {showBottom && (
        <div className={`${preview !== null ? "h-72" : "h-48"} flex shrink-0 flex-col border-t bg-activity`}>
          <div className="flex items-center gap-3 border-b px-3 py-1 text-xs uppercase tracking-wider text-muted-foreground">
            <button className={`flex items-center gap-1 ${bottomTab === "output" ? "text-foreground" : ""}`} onClick={() => setBottomTab("output")}><Terminal className="h-3.5 w-3.5" /> Output</button>
            <button className={bottomTab === "input" ? "text-foreground" : ""} onClick={() => setBottomTab("input")}>Input (stdin)</button>
            {preview !== null && <button className={bottomTab === "preview" ? "text-foreground" : ""} onClick={() => setBottomTab("preview")}>Preview</button>}
            <button aria-label="Hide output" className="ml-auto" onClick={() => setShowBottom(false)}><X className="h-3.5 w-3.5" /></button>
          </div>
          {bottomTab === "input" && (
            <textarea value={stdin} onChange={(e) => setStdin(e.target.value)} placeholder="Type input your program reads (e.g. for Scanner / scanf / cin), one value per line…"
              className="min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-xs outline-none" />
          )}
          {bottomTab === "preview" && preview !== null && (
            <iframe title="Web preview" sandbox="allow-scripts allow-modals" srcDoc={preview} className="min-h-0 flex-1 bg-card" />
          )}
          {bottomTab === "output" && (
            <div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs">
              {running && <span className="text-muted-foreground">Compiling and running…</span>}
              {!running && !output && <span className="text-muted-foreground">Press Run. Java, C, C++, Python, JavaScript, TypeScript and SQL compile on a remote sandbox; HTML/CSS open in Preview.</span>}
              {!running && output && (
                <>
                  {output.stdout && <pre className="whitespace-pre-wrap">{output.stdout}</pre>}
                  {output.stderr && <pre className="whitespace-pre-wrap text-destructive">{output.stderr}</pre>}
                  {!output.stdout && !output.stderr && output.exitCode === 0 && <span className="text-muted-foreground">(no output)</span>}
                  {output.exitCode !== -1 && (
                    <p className={`mt-2 ${output.exitCode === 0 ? "text-success" : "text-destructive"}`}>
                      {output.status ?? `exit ${output.exitCode}`} · {output.durationMs}ms
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const anyDirty = openTabs.some(dirty);
  const activityItems: { id: Panel; icon: typeof Files; label: string }[] = [
    { id: "explorer", icon: Files, label: "Explorer" },
    { id: "search", icon: Search, label: "Search" },
    { id: "settings", icon: Settings, label: "Settings" },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Toolbar */}
      <header className="flex h-11 shrink-0 items-center gap-3 border-b bg-activity px-3">
        <Link to="/projects" aria-label="All projects"><Logo compact /></Link>
        <span className="truncate text-sm font-medium">{projectName}</span>
        {activeFile && <span className="hidden rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground sm:inline">{langFor(activeFile.path)}</span>}
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {saving ? "Saving…" : anyDirty ? "● Unsaved changes" : "All changes saved"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => save()} disabled={!active || !dirty(active) || saving}><Save className="h-4 w-4" /><span className="hidden sm:inline">Save</span></Button>
          <Button size="sm" variant="ghost" onClick={toggleTheme} aria-label="Toggle theme">{dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
          <Button size="sm" onClick={run} disabled={!activeFile || running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run
          </Button>
        </div>
      </header>

      {/* Desktop */}
      <div className="hidden min-h-0 flex-1 md:flex">
        <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r bg-activity py-2">
          {activityItems.map((a) => (
            <button key={a.id} aria-label={a.label} title={a.label}
              className={`rounded-md p-2 ${panel === a.id ? "bg-accent text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setPanel(panel === a.id ? null : a.id)}>
              <a.icon className="h-5 w-5" />
            </button>
          ))}
          <Link to="/projects" aria-label="Projects" title="Projects" className="rounded-md p-2 text-muted-foreground hover:text-foreground"><FolderGit2 className="h-5 w-5" /></Link>
          <button aria-label="Toggle output" title="Output" className="mt-auto rounded-md p-2 text-muted-foreground hover:text-foreground" onClick={() => setShowBottom((s) => !s)}><Terminal className="h-5 w-5" /></button>
        </nav>
        {panel && <aside className="w-60 shrink-0 border-r">{sidePanel}</aside>}
        <main className="min-w-0 flex-1">{editorArea}</main>
        <aside className="w-[360px] shrink-0 border-l lg:w-[400px]">
          <AssistantPanel projectId={projectId} getContext={getContext} onInsert={(c) => insertCode(c, false)} onReplaceSelection={(c) => insertCode(c, true)} />
        </aside>
      </div>

      {/* Mobile */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        <div className="min-h-0 flex-1">
          {mobileTab === "files" && sidePanel}
          {mobileTab === "editor" && editorArea}
          {mobileTab === "ai" && <AssistantPanel projectId={projectId} getContext={getContext} onInsert={(c) => insertCode(c, false)} onReplaceSelection={(c) => insertCode(c, true)} />}
        </div>
        <nav className="grid shrink-0 grid-cols-3 border-t bg-activity">
          {([["files", Files, "Files"], ["editor", FileCode, "Editor"], ["ai", Bot, "AI"]] as const).map(([id, Icon, label]) => (
            <button key={id} onClick={() => { setMobileTab(id); if (id === "files" && !panel) setPanel("explorer"); }}
              className={`flex flex-col items-center gap-0.5 py-2 text-xs ${mobileTab === id ? "text-primary" : "text-muted-foreground"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </nav>
      </div>

      <Dialog open={!!nameDialog} onOpenChange={(o) => !o && setNameDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {nameDialog?.mode === "rename" ? "Rename file" : nameDialog?.mode === "folder" ? "New folder" : "New file"}
              {nameDialog?.base ? <span className="ml-2 font-mono text-sm text-muted-foreground">in {nameDialog.base}/</span> : null}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); submitName(); }}>
            <Input autoFocus value={nameValue} onChange={(e) => setNameValue(e.target.value)} placeholder={nameDialog?.mode === "folder" ? "utils" : "Main.java"} className="font-mono" />
            <DialogFooter className="mt-4"><Button type="submit">Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {toDelete?.path}?</AlertDialogTitle>
            <AlertDialogDescription>{toDelete?.is_folder ? "Everything inside this folder will be deleted." : "This file will be permanently deleted."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && deleteRow(toDelete)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
