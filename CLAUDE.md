# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Database environment rule — DEV before PROD

**All database schema changes (migrations, `db push`, raw DDL) must be applied to the DEV database first and verified working on the local dev sites before the production database is touched.**

- The running local servers (ports 3000/3001/3002) use the **DEV database** (`.env.development.local`).
- `prisma.config.ts` is intentionally configured so that all Prisma CLI commands (`migrate dev`, `db push`, etc.) also target the DEV database by default.
- Do **not** apply any structural change to the prod database (`DATABASE_URL` in `.env.local`) until the dev sites are confirmed working with the change.
- When it is time to promote a schema change to production, use `DATABASE_URL="<prod-url>" npx prisma migrate deploy` explicitly — never run Prisma migrations against prod by accident.
- If you are writing a one-off script that touches the database, always load `.env.development.local` (not `.env.local`) unless you have been explicitly asked to target production.

## Next.js version warning

**Read `node_modules/next/dist/docs/` before writing Next.js code.** This project uses Next.js 16 with breaking changes from older versions. Heed deprecation notices — conventions and APIs may differ from training data.

## Commands

```bash
# Development (pick the org you want to test)
pnpm dev                    # defaults to gonzales org
pnpm dev:gonzales           # dyb.apbaseball.com
pnpm dev:ascension          # llb.apbaseball.com
pnpm dev:master             # admin.apbaseball.com

# Lint
pnpm lint

# Tests (all test files)
pnpm test

# Run a specific test file
tsx --test lib/assignr/__tests__/someFile.test.ts

# Prisma
npx prisma migrate dev      # create and apply a new migration (dev)
npx prisma migrate deploy   # apply pending migrations (prod/preview)
npx prisma generate         # regenerate client after schema change
npx prisma migrate status   # check pending migrations
npx prisma db push          # push schema without migration history (prototyping only)
```

`prisma.config.ts` at the repo root loads `.env.local` first, then `.env.development.local` (which overrides it). This mirrors Next.js dev-mode priority, so Prisma CLI commands target the **dev database** by default — matching what the running dev servers use.

To apply a migration to the **production database**, temporarily remove or rename `.env.development.local` before running `prisma migrate deploy`, then restore it. Never run `prisma migrate dev` or `prisma db push` with the production `DATABASE_URL` loaded.

There is no local node/npm on this dev box — run Prisma CLI commands from within the project directory on dev-box.

## Architecture overview

### Multi-org single codebase

The entire app runs as **three separate Vercel deployments** from one codebase, selected at build/runtime by the `SITE_ORG` env var:

| `SITE_ORG` | URL | Purpose |
|---|---|---|
| `gonzales` (default) | dyb.apbaseball.com | Gonzales Diamond Baseball public site |
| `ascension` | llb.apbaseball.com | Ascension Little League public site |
| `master` | admin.apbaseball.com | Cross-org admin dashboard |

`lib/siteConfig.ts` is the single source of org identity. All org-aware code calls `getSiteConfig()`, `getOrgId()`, or `isMasterDeployment()` from there. Brand colors are injected as CSS variables (`--org-primary`, `--org-primary-dark`, `--org-accent`) in `app/layout.tsx`.

`ContentOrgId` (`"gonzales" | "ascension"`) is distinct from `OrgId` (adds `"master"`). Use `resolveAdminTargetOrg()` on admin routes — it handles the master deployment's `?org=` switcher param automatically.

### Database

Two separate PostgreSQL databases via Prisma (`lib/prisma.ts`):

| File | Database | Used by |
|---|---|---|
| `.env.development.local` | **DEV** database | Running local dev servers (all three ports) |
| `.env.local` | **PROD** database | Vercel deployments |

`.env.development.local` overrides `.env.local` in Next.js dev mode and in Prisma CLI commands (via `prisma.config.ts`). The running dev servers on this box always connect to the dev database.

The Prisma client is a singleton with HMR-safe version checking — bump `PRISMA_SCHEMA_VERSION` in `lib/prisma.ts` whenever the schema changes to flush the dev cache.

Prisma uses the `@prisma/adapter-ppg` adapter (Prisma Postgres/pooled gateway).

### Authentication — three separate systems

1. **Admin auth** (`lib/auth/adminSession.ts`) — email+password, session token stored hashed in `AdminSession`, cookie `gdb_admin_session`. Role hierarchy (lowest→highest): `PARK_DIRECTOR → BOARD_MEMBER → ADMIN → MASTER_ADMIN`. Module access is gated by `canAccessAdminModule()` in `lib/auth/adminRoles.ts`. Some modules (`TOURNAMENT_BRACKETS`, `SPONSORS`, `NEWS_ADMIN`, etc.) are master-deployment-only.

2. **Coach Corner auth** (`lib/auth/coachSession.ts`) — separate session table, cookie `gdb_coach_session`. Used for the coach-facing portal.

3. **Dugout / public auth** (`lib/auth/registeredUserAuth.ts`) — Google OAuth via `google-auth-library`. `RegisteredUser` rows are scoped per `organizationId`. Same Google account can exist across orgs.

### Key feature modules

- **Schedule** — `lib/fetchGames.ts` → `lib/assignr/` — fetches game schedules from the Assignr API. Each org has its own `assignrLeagueId`. Games are cached with Next.js fetch tags (`ASSIGNR_GAMES_CACHE_TAG`).

- **Live scores / brackets** — `lib/gamechanger/` — reads the unauthenticated GameChanger public JSON API (`api.team-manager.gc.com/public/widgets/scoreboard/{widgetId}`). Polling logic lives in `hooks/gameChangerPollLoop.ts` (15–60s while live, stops when idle).

- **Tournament brackets** — `lib/tournament-brackets/` — full bracket engine: layout, scoring, SVG preview, PDF export, GameChanger score import. Bracket projects live in `BracketProject` Prisma model. Only accessible to `MASTER_ADMIN`.

- **All-Star vault** — `lib/allStar/` — manages All-Star cycles, candidate rosters, coach voting ballots, and final roster overrides. Per-org; ballot links use canonical host redirect (`getCanonicalBallotOriginForOrganizationId()`).

- **Dugout** — social feed per org (+ `"master"` bucket for Board Room). Posts, comments, likes, notifications. `resolveDugoutApiOrg()` routes `"master"` to the board room bucket vs content-org switcher.

- **Communications** — `lib/communications/` — email campaigns (Resend) with audience rules, approval workflow, quiet hours, and unsubscribe/suppression. Feature-flagged by `COMMUNICATIONS_MODULE_ENABLED` env var. See `docs/communications-runbook.md`.

- **Assignr integration** — `lib/assignr/` — OAuth client, game import, official assignments, schedule CSV import. Has its own test suite.

### App Router layout

- `app/` — Next.js App Router pages and API routes
- `app/admin/` — admin dashboard pages (all gated behind admin auth middleware)
- `app/api/` — API route handlers
- `lib/` — all business logic, external API clients, auth utilities
- `components/` — shared React components
- `hooks/` — client-side React hooks
- `prisma/` — schema + migrations + seed

### Git / deployment workflow

- Default branch for all agent work: **`preview`**. Do not commit directly to `main`.
- Push to `preview` → Vercel preview deployment → merge `preview` into `main` → production deploys.
- `main` pushes trigger a GitHub Action (`sync-preview-with-main.yml`) that fast-forwards `preview`.
- Each push to `preview` triggers ~3 Vercel deployments (one per org). Batch commits to avoid thrashing.
- Three demo repos (`apbaseball-demo-admin/dyb/llb`) are automatically synced from `main` via `sync-demo-repos.yml`.

### Environment variables

Required in `.env.local` for local dev:

- `DATABASE_URL` — **production** Postgres connection string (overridden by `.env.development.local` for dev work)
- `SITE_ORG` — set by Vercel per deployment; use `pnpm dev:*` scripts locally
- `ASSIGNR_SITE_ID`, `ASSIGNR_LEAGUE_ID`, `ASSIGNR_CLIENT_ID`, `ASSIGNR_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Dugout OAuth
- `RESEND_API_KEY`, `COMMUNICATIONS_EMAIL_FROM`, `COMMUNICATIONS_UNSUBSCRIBE_SECRET`
- `INITIAL_MASTER_ADMIN_EMAIL`, `INITIAL_MASTER_ADMIN_PASSWORD` — bootstrap only
