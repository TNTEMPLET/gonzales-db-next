<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Git (default for agent commits and pushes)

**Branch rule:** Default agent work ships on **`preview`** (or a user-named **`feature/*`** branch). **`main`** is updated only through the post-push preview workflow below, or when the user explicitly asks for a different promotion path.

1. **Before committing:** Be on **`preview`**. If you are on **`main`** with changes, switch (or create) **`preview`** and commit there—e.g. `git checkout preview` (create with `git checkout -b preview` if missing), then commit. Prefer **not** leaving new commits only on **`main`**.
2. **Push:** Run `git push origin preview` (or `git push origin <feature-branch>`). **Do not** run `git push origin main` unless the user explicitly asks to update **`main`** / production outside the workflow below.
3. **Push commands include Vercel verification (mandatory):** When the user asks to **commit/push**, **push**, or equivalent, that request **includes** full post-push deploy verification in the **same task**. Do **not** stop after `git push` with only a note to verify later.
   - **Always poll Vercel** after every `git push` that can trigger deploys (preview and/or production). Use token at `/config/.secrets/vercel_token` (or `VERCEL_TOKEN`) and `scripts/poll-vercel-deploys.sh`.
   - Find deployments for the pushed commit SHA (not just “latest” if a newer unrelated deploy exists).
   - Poll until each relevant deployment is **READY**. On **ERROR** or **CANCELED**, inspect build logs, fix when clear, re-push, and repeat; do not claim success.
   - **Multi-project production** (push to `main` / production aliases): poll **all** live org projects that share this repo:
     - `gonzales-db-next` → dyb.apbaseball.com  
     - `apbaseball-llb` → llb.apbaseball.com  
     - `apbaseball-fallball` → fallball.apbaseball.com  
     - `apbaseball-admin` → admin.apbaseball.com  
     (Plus district projects when the change affects them.)
   - When **READY** for a **`preview`** push, merge **`preview`** into **`main`**, push **`main`**, then **poll production** for that SHA across the org projects above.
   - Report commit SHA, per-project Ready/Error, production URLs, and whether **`main`** was promoted.
   - **`feature/*`:** push and poll preview; merge to **`main`** only if the user clearly wants production promotion (then poll production).
   - **No Vercel token available:** say so explicitly, fall back to HTTP smoke of production URLs for the change, and do not pretend deploy status was verified via Vercel API.
4. **After a `main`-only push:** GitHub Actions (`.github/workflows/sync-preview-with-main.yml`) fast-forwards **`preview`** to **`main`**. Still **poll Vercel production** for that SHA. If the sync workflow fails (e.g. `preview` has commits not on **`main`**), resolve manually with `git checkout preview && git merge main && git push origin preview`, or reset policy as the user directs.

## Vercel preview pushes

Each push to **`preview`** can trigger **multiple** Vercel preview deployments (one per linked project). Batch work into fewer commits, avoid push-per-commit loops, and do not push until the change set is ready for preview verification or the user explicitly asks. Prefer local commits and say what is ready to push; confirm before pushing when unclear.

When the user asks to **commit/push**, **push**, or equivalent, the post-push workflow in **Git** above is part of the same task: **poll Vercel until Ready**, then promote **`preview`** to **`main`** when applicable, then **poll production**. Do not end the task after `git push` alone.

### Poll helper

```bash
# After push (from repo root) — production targets for the commit:
bash scripts/poll-vercel-deploys.sh "$(git rev-parse HEAD)"
# Preview target only:
bash scripts/poll-vercel-deploys.sh --target preview "$(git rev-parse HEAD)"
```

## Prisma

Run Prisma CLI yourself when schema or migrations change (or when verifying the DB): e.g. `npx prisma migrate deploy`, `npx prisma migrate dev`, `npx prisma generate`, `npx prisma validate`, `npx prisma migrate status`, `npx prisma db push` when appropriate. **Do not** only tell the user to run these—execute them in this environment unless blocked (e.g. no `DATABASE_URL` in `.env.local`).

For local work, Prisma CLI and dev servers use the **DEV** database: `prisma.config.ts` loads `.env.local` first, then **`.env.development.local`** (which overrides it). On **dev-box**, dev is **local Postgres** (`127.0.0.1:5432`, database `apbaseball_dev`) — see `docs/local-dev-database.md`. Do not run `migrate dev` or `db push` against production. To deploy migrations to prod, use an explicit `DATABASE_URL` with `prisma migrate deploy` only after dev is verified.

**Dev-box is the live dev site:** after bracket, schema, seed, or data changes, sync to dev-box and apply DB updates there (`pnpm seed:ladistrict6-tournament`, `pnpm prisma db push` on dev-box). See `.cursor/rules/dev-box-preview.mdc`.

## Clarifying questions

When the agent needs user choices on ambiguous work, it should use **clickable options** via the `AskQuestion` tool (see `.cursor/rules/clarifying-questions.mdc`), not prose-only questions.
