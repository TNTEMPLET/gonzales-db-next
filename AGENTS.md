<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Git (default for agent commits and pushes)

**Branch rule:** Do agent work on a **`feature/*`** branch in its **own git worktree**. Do not commit on a shared checkout. Open a pull request into **`preview`**. Agents never merge any pull request. Agents never push **`preview`** or **`main`**, and never merge **`preview`** into **`main`**.

1. **Branch:** From current `origin/preview`, create `feature/<short-name>` in a separate worktree. Commit only on that branch.
2. **Pull request:** Open the PR into **`preview`** and wait for CI (`.github/workflows/ci.yml`). Agents stop here. Do not merge the pull request.
3. **Trent merges into preview:** Trent reviews and merges that feature PR into **`preview`**. That merge runs `.github/workflows/db-migrate.yml` job `migrate-staging`, which applies migrations to the staging database. Do not `git push origin preview`.
4. **Trent tests** the staging deployment.
5. **Production:** **Trent** merges **`preview`** into **`main`** with a **merge commit** (never squash). That push runs job `migrate-prod`, which applies migrations to production. Agents do not merge to **`main`**, do not push **`main`**, and do not run `prisma migrate deploy` against staging or production. Prod migrations should run before or together with the production deploy. Vercel can mark the `main` deployment Ready before the `migrate-prod` environment is approved, so new code can go live while the database is still on the previous schema. Keep schema changes backward-compatible (expand, then contract in a later migration), or approve `migrate-prod` before the new code serves traffic.
6. **Hotfix already on main:** `.github/workflows/sync-preview-with-main.yml` fast-forwards **`preview`** to **`main`**. Do not push **`main`** or **`preview`** to repair that yourself.

Vercel uses its own environment variables. Preview deployments use the staging database. Production deployments use the production database. A Ready preview is not permission to promote.

## Vercel

Each push to **`preview`** can trigger several Vercel preview deployments (one per linked project). Batch work into fewer commits. Push the feature branch, not **`preview`** or **`main`**.

### Poll helper

Read-only. Do not promote from the result.

```bash
bash scripts/poll-vercel-deploys.sh --target preview "$(git rev-parse HEAD)"
```

## Prisma

For local schema work, run Prisma against the **DEV** database: `npx prisma migrate dev`, `npx prisma generate`, `npx prisma validate`. `prisma.config.ts` loads `.env.local`, then **`.env.development.local`** (which overrides it), except in CI where those files are ignored. On **dev-box**, dev is local Postgres (`127.0.0.1:5432`, database `apbaseball_dev`) — see `docs/local-dev-database.md`.

Staging and production schema changes ship only through `.github/workflows/db-migrate.yml` after the merges above. Do not point `migrate deploy`, `migrate dev`, `migrate reset`, or `db push` at staging or production.

`pnpm build` does not touch the database. The build-time sync runs only when `PRISMA_SYNC_ON_BUILD=1`.

**Dev-box is the live dev site:** after bracket, schema, seed, or data changes, sync to dev-box and apply DB updates there (`pnpm seed:ladistrict6-tournament`, `pnpm prisma db push` on dev-box). See `.cursor/rules/dev-box-preview.mdc`.

## Clarifying questions

When the agent needs user choices on ambiguous work, it must use the **native selectable UI** (`ask_user_question` in Grok, `AskQuestion` in Cursor). Never fall back to lettered Markdown (`1A`). See `.cursor/rules/clarifying-questions.mdc`.
