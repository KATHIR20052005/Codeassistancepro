<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# AGENTS.md

- Project/file CRUD goes through the browser data client under RLS; every table row carries user_id. Why: ownership enforced by the database.
- AI chat streams from the server route `src/routes/api/chat.ts` (bearer-verified, persists both messages). Why: keeps the AI key server-side and history consistent.
- Code execution: Java/C/C++/Python/JS/TS/SQL go through `src/routes/api/run.ts` (auth-verified) to a Judge0 sandbox (JUDGE0_URL/JUDGE0_API_KEY optional, defaults to public CE); HTML/CSS render in a sandboxed iframe. Why: never run user code in the app server or fake results.
- Signed-in pages live under `src/routes/_authenticated/` (client-only gate). Why: session lives in browser storage.
