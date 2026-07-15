# gonzales-db-next (AP Baseball)

Multi-organization Next.js app for Gonzales DYB, Ascension Little League, AP Fall Ball, Master Admin, and tournament-only district sites.

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| DB | PostgreSQL + Prisma 7 (`lib/prisma.ts`) |
| Styling | Tailwind CSS 4 |
| Validation | Zod (`lib/api/parseBody.ts` at trust boundaries) |
| Email | Resend via Communications module |
| Deploy | Multiple Vercel projects, one codebase, selected by `SITE_ORG` |

## Organizations (`SITE_ORG`)

| `SITE_ORG` | Role |
|------------|------|
| `gonzales` | Gonzales Diamond Baseball public site |
| `ascension` | Ascension Little League public site |
| `fallball` | AP Fall Ball |
| `master` | Cross-org admin (`admin.apbaseball.com`) |
| `ladistrict2` / `ladistrict6` | Tournament-only bracket sites |

Identity and branding: `lib/siteConfig.ts`. Per-org product flags: `lib/org/capabilities.ts`.

## Auth (three systems)

1. **Admin** — email/password, cookie `gdb_admin_session` (`lib/auth/adminSession.ts`). Module ACL: `lib/auth/adminRoles.ts` + `ensureAdminModule` in `lib/auth/ensureAdminModule.ts`.
2. **Coach Corner** — `gdb_coach_session` (`lib/auth/coachSession.ts`).
3. **Dugout / families** — Google OAuth on `RegisteredUser` (`lib/auth/registeredUserAuth.ts`).

## Local development

```bash
pnpm install
pnpm dev:gonzales    # :3000 default org
pnpm dev:ascension
pnpm dev:master
pnpm dev:fallball
pnpm dev:all         # all orgs on separate ports / .next-* dirs
```

Prisma CLI and dev servers use the **DEV** database (`.env.development.local` overrides `.env.local` via `prisma.config.ts`). See `docs/local-dev-database.md` and `CLAUDE.md`.

```bash
pnpm test
pnpm lint
pnpm exec tsc --noEmit
npx prisma migrate dev    # schema changes — DEV only
```

**Package manager:** **pnpm** only (`pnpm-lock.yaml`). Do not commit `package-lock.json`.

## Admin module map (high level)

| Area | Paths |
|------|--------|
| People hub | `/admin/people` (directory, volunteers, coaching interest) — also `/admin/users`, `/admin/volunteers` redirect here |
| Teams | `/admin/teams` |
| Scores | `/admin/scores` |
| All-Star Program | `/admin/all-star` (Vault) + stage nav to payments & cap-orders |
| Tournaments | `/admin/tournament-brackets`, alerts |
| Publishing | News, social, communications, documents |
| Ops | Reports, park alerts/info, Assignr, scheduler |

Workflow UI standard: `docs/admin-module-workflow-pattern.md`.

## Domain libraries

Business logic lives under `lib/` (e.g. `volunteers`, `tournament-brackets`, `gamechanger`, `assignr`, `communications`, `allStar`). Prefer thin `app/api/**/route.ts` handlers.

### Volunteer compliance (AAT / JDP)

- **Canonical store:** `VolunteerRequirementStatus` on a `VolunteerProfile` (per org + season).
- **Coach Corner / admin uploads** write the volunteer card only (`recordAbuseAwarenessUpload` / `updateRequirementStatus`).
- **Legacy** `RegisteredUser.abuseAwarenessTrainingCertificate*` columns are dual-read only until backfill soak; do not write them from new code. Backfill: `scripts/backfill-volunteer-aat-from-users.ts`.

## Agent / git

Canonical agent rules: **`AGENTS.md`**. Extra detail: **`CLAUDE.md`**. Default ship branch: **`preview`** (see AGENTS for preview → main promotion).

## Docs

- `docs/communications-runbook.md`
- `docs/local-dev-database.md`
- `docs/deployment-ladistrict6.md`
- `docs/admin-module-workflow-pattern.md`
