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
| All-Star Program | `/admin/all-star` (Vault) + stage nav to payments, cap-orders & shirt-orders |
| Tournaments | `/admin/tournament-brackets`, alerts |
| Publishing | News, social, communications, documents |
| Ops | Reports, park alerts/info, Assignr, scheduler |

### Public merch shop (catalog + PayPal)

| Path | Purpose |
|------|---------|
| `/shop` | Public catalog — product cards link out to PayPal NCP checkout |
| `/admin/shop` | Admin view of catalog + shortcuts to order desks |
| Catalog source | `lib/merch/catalog.ts` (v1 code-configured; no cart) |

Add a product: create a PayPal payment link, append a `MerchProduct` in `catalog.ts` with matching `priceCents` / org, set `fulfillment` to `shirt-orders` or `cap-orders`. Families buy on PayPal; board fulfills from the order desk.

### Cap & shirt PayPal orders

| Path | Purpose |
|------|---------|
| `/admin/cap-orders` | Parent All-Star cap orders (sync, fulfill, CSV) |
| `/admin/shirt-orders` | Championship / merchandise shirt orders (sync, fulfill, CSV + size tally) |
| `POST /api/webhooks/paypal-caps` | Live ingest for caps |
| `POST /api/webhooks/paypal-shirts` | Live ingest for shirts |

Env (master / admin + org sites that run the webhook):

| Variable | Caps default | Shirts default |
|----------|--------------|----------------|
| Item keyword Gonzales | `PAYPAL_CAP_ITEM_GONZALES` | `PAYPAL_SHIRT_ITEM_GONZALES` |
| Item keyword Ascension | `PAYPAL_CAP_ITEM_ASCENSION` | `PAYPAL_SHIRT_ITEM_ASCENSION` |
| Unit price (cents) | `PAYPAL_CAP_PRICE_CENTS` (`2000`) | `PAYPAL_SHIRT_PRICE_CENTS` (`1500` = $15) |
| Webhook id | `PAYPAL_WEBHOOK_ID_CAPS` → `PAYPAL_WEBHOOK_ID` | `PAYPAL_WEBHOOK_ID_SHIRTS` → caps id → `PAYPAL_WEBHOOK_ID` |

**Active shirt buttons:**

| Org | Item name | PayPal NCP | Price |
|-----|-----------|------------|-------|
| Gonzales DYB | `Gonzales 11U DYB - State Champs Shirt` | https://www.paypal.com/ncp/payment/Z5HW3TUQFBYWE | $15 |
| Ascension LLB | `7-8U, AP LL - State Champs Shirt` | https://www.paypal.com/ncp/payment/CFDJ5F97YVCF8 | $15 |
| Ascension LLB | `10U, AP LL - State Champs Shirt` | https://www.paypal.com/ncp/payment/CFQP6QBDF7C7N | $15 |
| Ascension LLB | `11U, AP LL - State Champs Shirt` | https://www.paypal.com/ncp/payment/4XAXPZ9YN4FDA | $15 |

All: qty up to 10, required memos player name + size(s). Org is inferred from item title (`DYB` / `AP LL`).

When shirt keywords are empty, sync/webhook match item names containing `shirt` or `state champ`. Recommended env:

```
PAYPAL_SHIRT_ITEM_GONZALES=state champs shirt
PAYPAL_SHIRT_ITEM_ASCENSION=ap ll
PAYPAL_SHIRT_PRICE_CENTS=1500
```

Workflow UI standard: `docs/admin-module-workflow-pattern.md`.

## Domain libraries

Business logic lives under `lib/` (e.g. `volunteers`, `tournament-brackets`, `gamechanger`, `assignr`, `communications`, `allStar`). Prefer thin `app/api/**/route.ts` handlers.

### Scores vs schedule vs brackets

See `docs/scores-and-schedule.md` for which admin console to use (Scores hub, Assignr, scheduler, brackets).

### Spreadsheet libraries

- Prefer **`xlsx`** for read/write.
- Use **`xlsx-js-style`** only where cell styling is required (e.g. styled All-Star payment exports).

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
