// Runs JavaScript inside an isolated Web Worker (no DOM, no app state access),
// with a hard timeout and output limit. Other languages are reported as unsupported.
export type RunResult = { stdout: string; stderr: string; exitCode: number; durationMs: number; supported: boolean };

const TIMEOUT_MS = 5000;
const MAX_OUT = 20000;

export function runCode(language: string, code: string): Promise<RunResult> {
  if (language !== "javascript") {
    return Promise.resolve({
      stdout: "",
      stderr: `Running ${language} isn't supported yet. Only JavaScript runs in the sandboxed browser runner.`,
      exitCode: -1,
      durationMs: 0,
      supported: false,
    });
  }
  const workerSrc = `
    let out = "", err = "";
    const fmt = (a) => a.map(x => typeof x === "string" ? x : (()=>{try{return JSON.stringify(x)}catch{return String(x)}})()).join(" ");
    console.log = (...a) => { out += fmt(a) + "\\n"; };
    console.info = console.log;
    console.warn = (...a) => { err += fmt(a) + "\\n"; };
    console.error = console.warn;
    self.fetch = undefined; self.XMLHttpRequest = undefined; self.importScripts = undefined;
    self.onmessage = async (e) => {
      let code = 0;
      try { await (async () => { eval(e.data); })(); }
      catch (x) { err += (x && x.stack ? x.stack : String(x)) + "\\n"; code = 1; }
      postMessage({ out, err, code });
    };`;
  const url = URL.createObjectURL(new Blob([workerSrc], { type: "text/javascript" }));
  const worker = new Worker(url);
  const start = performance.now();
  return new Promise((resolve) => {
    const finish = (r: Omit<RunResult, "durationMs" | "supported">) => {
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({
        stdout: r.stdout.slice(0, MAX_OUT),
        stderr: r.stderr.slice(0, MAX_OUT),
        exitCode: r.exitCode,
        durationMs: Math.round(performance.now() - start),
        supported: true,
      });
    };
    const t = setTimeout(() => finish({ stdout: "", stderr: `Timed out after ${TIMEOUT_MS / 1000}s.`, exitCode: 124 }), TIMEOUT_MS);
    worker.onmessage = (e) => {
      clearTimeout(t);
      finish({ stdout: e.data.out, stderr: e.data.err, exitCode: e.data.code });
    };
    worker.postMessage(code);
  });
}
