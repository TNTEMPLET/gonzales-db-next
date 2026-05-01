<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Git (default for agent commits and pushes)

**Branch rule:** The user merges to **`main`** only when they say so. Until then, all agent work ships on **`preview`** (or a **`feature/*`** branch they name—still push that branch, not **`main`**).

1. **Before committing:** Be on **`preview`**. If you are on **`main`** with changes, switch (or create) **`preview`** and commit there—e.g. `git checkout preview` (create with `git checkout -b preview` if missing), then commit. Prefer **not** leaving new commits only on **`main`**.
2. **Push:** Run `git push origin preview` (or `git push origin <feature-branch>`). **Do not** run `git push origin main` unless the user explicitly asks to update **`main`** / production / merge from preview.
3. **Merge:** Do not merge **`preview`** into **`main`** unless the user gives explicit approval after a good preview build.

## Prisma

Run Prisma CLI yourself when schema or migrations change (or when verifying the DB): e.g. `npx prisma migrate deploy`, `npx prisma migrate dev`, `npx prisma generate`, `npx prisma validate`, `npx prisma migrate status`, `npx prisma db push` when appropriate. **Do not** only tell the user to run these—execute them in this environment unless blocked (e.g. no `DATABASE_URL`).
