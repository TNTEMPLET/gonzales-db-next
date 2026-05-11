<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Git (default for agent commits and pushes)

**Branch rule:** The user merges to **`main`** only when they say so. Until then, all agent work ships on **`preview`** (or a **`feature/*`** branch they name—still push that branch, not **`main`**).

1. **Before committing:** Be on **`preview`**. If you are on **`main`** with changes, switch (or create) **`preview`** and commit there—e.g. `git checkout preview` (create with `git checkout -b preview` if missing), then commit. Prefer **not** leaving new commits only on **`main`**.
2. **Push:** Run `git push origin preview` (or `git push origin <feature-branch>`). **Do not** run `git push origin main` unless the user explicitly asks to update **`main`** / production / merge from preview.
3. **Merge:** Do not merge **`preview`** into **`main`** unless the user gives explicit approval after a good preview build.
4. **After a `main`-only push:** GitHub Actions (`.github/workflows/sync-preview-with-main.yml`) fast-forwards **`preview`** to **`main`**. If that workflow fails (e.g. `preview` has commits not on **`main`**), resolve manually with `git checkout preview && git merge main && git push origin preview`, or reset policy as the user directs.

## Vercel preview pushes

Each push to **`preview`** can trigger **about three** Vercel preview deployments. Batch work into fewer commits, avoid push-per-commit loops, and do not push until the change set is ready for preview verification or the user explicitly asks. Prefer local commits and say what is ready to push; confirm before pushing when unclear.

## Prisma

Run Prisma CLI yourself when schema or migrations change (or when verifying the DB): e.g. `npx prisma migrate deploy`, `npx prisma migrate dev`, `npx prisma generate`, `npx prisma validate`, `npx prisma migrate status`, `npx prisma db push` when appropriate. **Do not** only tell the user to run these—execute them in this environment unless blocked (e.g. no `DATABASE_URL` in `.env.local`).

For local work in this repo, Prisma must use the `DATABASE_URL` from repo-root **`.env.local`** (same database as production). `prisma.config.ts` loads that file for the CLI. If a command still cannot see `DATABASE_URL`, run from the repo root with `node --env-file=.env.local` before invoking Prisma.
