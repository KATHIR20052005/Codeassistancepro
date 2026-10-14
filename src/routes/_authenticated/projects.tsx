import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FolderGit2, Loader2, LogOut, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/Logo";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { currentUserId, starterFiles } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Projects — CodeJunior" },
      { name: "description", content: "Your CodeJunior coding projects." },
      { property: "og:title", content: "Projects — CodeJunior" },
      { property: "og:description", content: "Manage your coding projects." },
    ],
  }),
  component: Projects,
});

type Project = { id: string; name: string; updated_at: string };

function Projects() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const [dialog, setDialog] = useState<{ mode: "create" | "rename"; project?: Project } | null>(null);
  const [name, setName] = useState("");
  const [toDelete, setToDelete] = useState<Project | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id,name,updated_at").order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Project[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const n = name.trim();
      if (!n || n.length > 100) throw new Error("Name must be 1–100 characters.");
      if (dialog?.mode === "rename" && dialog.project) {
        const { error } = await supabase.from("projects").update({ name: n }).eq("id", dialog.project.id);
        if (error) throw error;
        return dialog.project.id;
      }
      const user_id = await currentUserId();
      const { data, error } = await supabase.from("projects").insert({ name: n, user_id }).select("id").single();
      if (error) throw error;
      const { error: fe } = await supabase.from("files").insert(starterFiles(n).map((f) => ({ ...f, project_id: data.id, user_id })));
      if (fe) throw fe;
      return data.id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      const wasCreate = dialog?.mode === "create";
      setDialog(null);
      toast.success(wasCreate ? "Project created" : "Project renamed");
      if (wasCreate) navigate({ to: "/workspace/$projectId", params: { projectId: id } });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project deleted");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background bg-hero">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link to="/"><Logo /></Link>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="hidden sm:inline">{user.email}</span>
          <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="h-4 w-4" /> Sign out</Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 pb-16">
        <div className="mt-6 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
            <p className="text-sm text-muted-foreground">Pick up where you left off.</p>
          </div>
          <Button onClick={() => { setName(""); setDialog({ mode: "create" }); }}>
            <Plus className="h-4 w-4" /> New project
          </Button>
        </div>

        {isLoading && <div className="mt-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
        {error && <p className="mt-10 text-destructive">Couldn't load projects: {(error as Error).message}</p>}
        {data && data.length === 0 && (
          <div className="mt-12 rounded-xl border border-dashed p-12 text-center">
            <FolderGit2 className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-3 font-medium">No projects yet</p>
            <p className="text-sm text-muted-foreground">Create one to open the workspace.</p>
          </div>
        )}
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.map((p) => (
            <div key={p.id} className="group rounded-lg border bg-card p-5 transition hover:border-primary/50">
              <Link to="/workspace/$projectId" params={{ projectId: p.id }} className="block">
                <FolderGit2 className="h-5 w-5 text-primary" />
                <h3 className="mt-3 truncate font-semibold">{p.name}</h3>
                <p className="mt-1 font-mono text-xs text-muted-foreground">updated {new Date(p.updated_at).toLocaleString()}</p>
              </Link>
              <div className="mt-4 flex gap-1">
                <Button size="sm" variant="ghost" aria-label="Rename project" onClick={() => { setName(p.name); setDialog({ mode: "rename", project: p }); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" aria-label="Delete project" onClick={() => setToDelete(p)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </main>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog?.mode === "rename" ? "Rename project" : "New project"}</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="my-awesome-app" maxLength={100} />
            <DialogFooter className="mt-4">
              <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{toDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>All files and AI conversations in this project will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && del.mutate(toDelete.id)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
