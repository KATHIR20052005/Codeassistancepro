import { createFileRoute, Link } from "@tanstack/react-router";
import { Bug, Code2, FlaskConical, Gauge, MessageSquare, Wand2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CodeJunior — Intelligent Coding Workspace" },
      { name: "description", content: "Write, explain, debug and refactor code with a real AI assistant inside a browser IDE." },
      { property: "og:title", content: "CodeJunior — Intelligent Coding Workspace" },
      { property: "og:description", content: "A browser IDE with projects, a Monaco editor and an AI coding assistant." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: MessageSquare, title: "Explain", text: "Understand any file line by line." },
  { icon: Bug, title: "Debug", text: "Find the cause and get a corrected version." },
  { icon: Wand2, title: "Generate", text: "Describe it, insert it into the editor." },
  { icon: Code2, title: "Refactor", text: "Cleaner names and structure, same behavior." },
  { icon: Gauge, title: "Optimize", text: "Spot performance issues in your code." },
  { icon: FlaskConical, title: "Unit tests", text: "JUnit 5, Jest and more on demand." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background bg-hero">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <Button asChild variant="outline" size="sm">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-16">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">// intelligent coding workspace</p>
        <h1 className="mt-4 max-w-3xl text-5xl font-bold leading-tight tracking-tight md:text-6xl">
          Your editor, with a pair programmer built in.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted-foreground">
          Projects, files and a full code editor in your browser — plus an AI assistant that reads your code and answers in context.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg" className="shadow-glow">
            <Link to="/auth">Start coding free</Link>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <Link to="/projects">Open workspace</Link>
          </Button>
        </div>

        <div className="mt-16 overflow-hidden rounded-xl border bg-card shadow-glow">
          <div className="flex items-center gap-2 border-b bg-activity px-4 py-2 font-mono text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
            <span className="h-2.5 w-2.5 rounded-full bg-warning" />
            <span className="h-2.5 w-2.5 rounded-full bg-success" />
            <span className="ml-3">PrimeCheck.java</span>
          </div>
          <div className="grid md:grid-cols-[1fr_320px]">
            <pre className="overflow-x-auto p-5 font-mono text-sm leading-6">
              <code>
                <span className="text-primary">public class</span> PrimeCheck {"{"}
                {"\n"}  <span className="text-primary">static boolean</span> isPrime(<span className="text-primary">int</span> n) {"{"}
                {"\n"}    <span className="text-primary">if</span> (n {"<"} 2) <span className="text-primary">return false</span>;
                {"\n"}    <span className="text-primary">for</span> (<span className="text-primary">int</span> i = 2; i * i {"<="} n; i++)
                {"\n"}      <span className="text-primary">if</span> (n % i == 0) <span className="text-primary">return false</span>;
                {"\n"}    <span className="text-primary">return true</span>;
                {"\n"}  {"}"}
                {"\n"}{"}"}
              </code>
            </pre>
            <div className="border-t bg-panel p-5 text-sm md:border-l md:border-t-0">
              <p className="font-mono text-xs text-primary">assistant</p>
              <p className="mt-2 text-muted-foreground">
                Checking divisors only up to √n keeps this at O(√n). Want JUnit 5 tests for edge cases like 0, 1 and 2?
              </p>
            </div>
          </div>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-lg border bg-card p-5">
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
