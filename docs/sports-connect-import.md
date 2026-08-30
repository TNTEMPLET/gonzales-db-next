# SportsConnect → platform import runbook

**Audience:** Master Admins and league admins loading registration data into AP Baseball sites.  
**System of record for registration/payment:** SportsConnect (APBaseball.com / Stack Sports).  
**This platform:** teams, rosters, coaches, volunteers, schedules, communications, Player Cards.

## No SportsConnect API (confirmed)

There is **no official public developer API** for SportsConnect registration/roster pulls (research 2026-07-15; Blue Sombrero legacy branding included). Leagues move data via **admin CSV/XLSX export**.

| Do | Do not |
|----|--------|
| Export reports from SC admin UI | Call a SportsConnect REST/OAuth API (none available) |
| Upload into the Import Registration Data tab | Rely on a public SC developer portal that does not exist |
| Use mapping presets + quality | Store SC admin passwords in this app by default |
| Use **n8n / droid** for file-drop assist and co-pilot | Treat third-party sports-stats APIs as SportsConnect |
| Prefer export drop + notify over UI bots | Ship unattended SC login scrape without operator approval |

**Integration model:** **export → file import**, with assisted detection, reusable mapping presets, the Smart Auto-Build wizard, and import-run audit. **Automation ladder** (n8n, droid, optional credentialed pull) is in the product plan — no public API required.

Full product plan (includes short designs for n8n + droid): [`docs/sports-connect-integration-plan.md`](./sports-connect-integration-plan.md).

---

## Recommended load order

**Primary path — Smart Auto-Build wizard:** on **Master Admin**, set the site
first (`Fall Ball`, `Gonzales`, or `Ascension`), then open **Competition &
Play → Import Registration Data** (`/admin/competition?tab=sports-connect`).
The wizard there loads Team List, Player Registration, and Coach/Volunteer
files together (upload, or pull from a synced Google Drive folder), previews
all three at once, and builds teams/rosters/coach accounts in one confirm
step — no need to know these are three separate report types that used to
have to run in a specific order. See
`components/admin/teams/SmartAutoBuildWizard.tsx` and the
`/api/admin/teams/smart-build/*` routes.

**Advanced/legacy path** — for a single report type the wizard doesn't cover,
or a one-off manual correction: Competition & Play → Teams & Rosters →
"Advanced: import one file manually" (collapsed by default). This still runs
the three original imports independently:

1. **Team list** (optional) — age groups + team names exist for the season.
2. **Player registration report** — rosters + guardian fields (this is what
   also populates the `Enrollment` source-of-truth table — see below).
3. **Coach / volunteer sheet** — coach accounts and assignments.

Either path, then **review quality** (missing guardian emails, incomplete
Player Cards, teams without coaches) and **Enrollment & KPIs**
(`/admin/competition?tab=enrollment`) for registration/revenue numbers.

### Import Registration Data tab (post-refactor)

| Section | Purpose |
|---------|---------|
| **Smart Auto-Build wizard** | Primary import flow — all three report types together |
| **Quality** | Guardian email / Player Card readiness / empty teams |
| **Google Drive Sync** | Configure automated ingestion from a Drive folder |
| **Detection & preview audit** | `SportsConnectImportRun` audit (batch links when recorded) |

The old standalone "SportsConnect Import" Ops Desk page never wrote to the
database itself — every action there was a link back to Teams — so it was
folded into this tab (`components/admin/competition/CompetitionImportTab.tsx`)
rather than kept as a separate destination.

---

## Report types

| Kind | Typical SC export | Primary path | Legacy/manual path |
|------|-------------------|---------------|---------------------|
| `TEAM_LIST` | Age Group + Team / MLB Team | Smart Auto-Build wizard | Teams → Import Team List |
| `PLAYER_REG` | Participants / registration report | Smart Auto-Build wizard (writes `Enrollment` + `TeamPlayer`) | Teams → SportsConnect Player Import |
| `COACH_VOLUNTEER` | Volunteer/coach registration | Smart Auto-Build wizard | Teams → Coach Import |

The admin **detect** route scores file headers against these profiles (`lib/sportsConnect/columnProfiles.ts`). Detection is local to our platform — it does not call SportsConnect.

---

## Player registration export tips

**Strongly include**

- Division / age group  
- Team name  
- Player name (full or first + last)  
- Parent / account / user email (needed later for parent Player Cards)

**Useful optional fields**

- Payment status, order number/date, **OrderItem Amount / Amount Paid / Balance**
  (captured into the `Enrollment` source-of-truth table — see below)
- Birth certificate status, DOB, gender  
- Jersey number/size, roster status  
- Guardian names and phones, address, waivers  

**Skipped divisions (automatic)**

- Umpire only (clinics / volunteer ump tracks — not player roster divisions)  
- All other SportsConnect division labels are imported as-is (tee ball, 3–4 / 5 year-old, etc.) 

---

## Mapping presets

Division → age group and team name maps can be **saved per org + season** as a SportsConnect mapping preset. Reuse them on the next import so Master Admins do not re-map every export.

**In UI (Teams → Player Import mapping step):**

- Detection banner scores the uploaded file headers against known SC report profiles.  
- **Load / Apply** a saved preset, or **Save preset** after adjusting division and team maps.  
- Opening a new import pre-fills from the most recently updated `PLAYER_REG` preset for the site + season when available.

Platform routes (our app, not SportsConnect):

- `GET/POST /api/admin/sports-connect/presets?org=&seasonYear=`  
- `DELETE /api/admin/sports-connect/presets/[id]?org=`  
- `POST /api/admin/sports-connect/detect` with `{ headers: string[] }`  
- `GET /api/admin/sports-connect/catalog`

---

## Quality checks

After a load, review on the Teams workflow header (**SportsConnect roster quality** panel) or Ops Desk **Quality**:

- Players missing **guardian email**  
- Players **incomplete** on Player Card readiness  
- Teams with **no coaches** or **no players**  
- Last successful player/coach import timestamps  

Route: `GET /api/admin/sports-connect/quality?org=&seasonYear=`

---

## Import run audit

Successful player and coach imports from Teams record a `SportsConnectImportRun` (status `DONE`) with batch ids when possible. Ops Desk file-plan previews record `PREVIEW` runs.

Routes:

- `GET/POST /api/admin/sports-connect/runs?org=&seasonYear=`  
- `GET/PATCH /api/admin/sports-connect/runs/[id]?org=`  
- `POST /api/admin/sports-connect/preview` — multi-file detect + load plan  

Family registration URL constant: `lib/sportsConnect/registrationUrl.ts` (used by Fall Ball `/registration` and the Import tab).

---

## Known duplicates note (fixed 2026-08-30)

Re-importing a division after SportsConnect assigns real teams (moving
players/coaches off a placeholder team like "Unallocated") used to clone
every player and coach into the new team instead of moving them, because the
existing-row lookups in `applyImportRows` (players) and
`applyCoachImportRows` (coach team links) were scoped to the exact team just
resolved for that row rather than to the division as a whole. A division's
first import (before real teams exist) and every later re-import after teams
are drafted would leave both the stale row/link and a fresh one behind.

Hit in production for the fallball org's "Tee Ball, 3-4 year-olds" division
(145 duplicate `TeamPlayer` rows, 35 stale `TeamCoachAssignment` links) —
cleaned up manually, and both lookups now match within the same
org+season+ageGroup and move the existing row/link to the new team instead
of creating a second one.

---

## Enrollment: the registration/revenue source of truth

Every `PLAYER_REG` row imported through the player-import engine
(`app/api/admin/teams/import/route.ts`) is also upserted into a durable
`Enrollment` table — demographics, team assignment, and the full financial
order line (`OrderItem Amount`/`Amount Paid`/`Balance`, order no/date/status),
plus the raw row verbatim as a JSON escape hatch. This is additive alongside
`TeamPlayer` (the roster projection) — `TeamPlayer` is unchanged and still
what rosters/coach tools read from.

View the resulting registration counts, revenue collected vs. outstanding,
fee-tier breakdown, and enrolled-vs-rostered counts at **Competition & Play →
Enrollment & KPIs** (`/admin/competition?tab=enrollment`,
`components/admin/enrollment/EnrollmentKpiHub.tsx`,
`lib/enrollment/kpi.ts`). Gated at Board Member and above (financial + PII
data). Currently starts accumulating from the next import forward — no
retroactive backfill of already-imported seasons.

---

## n8n ingest (Option D — v1)

Machine automation can drop an export without a browser session:

| Item | Value |
|------|--------|
| Route | `POST /api/admin/sports-connect/ingest` (Master Admin) |
| Auth | `Authorization: Bearer <SPORTS_CONNECT_INGEST_SECRET>` |
| Body | multipart `file` + `org` [+ `seasonYear`] **or** JSON `{ org, fileName, contentBase64 }` |
| Effect | Parse → detect → preview → optional `PREVIEW` import run + Ops Desk deep link |
| Does **not** | Write rosters / run Teams import engines |

**Env (Vercel apbaseball-admin):** `SPORTS_CONNECT_INGEST_SECRET` (required for n8n). Optional: `SPORTS_CONNECT_ADMIN_BASE_URL` for desk links.

**potions workflow:** `infra/range/stacks/n8n/exports/sc-export-landed.workflow.json`  
Webhook: `POST https://potions.duckroostdigital.com/webhook/sc-export-landed`  
Runbook: `infra/range/runbooks/n8n-potions.md` § Phase 3.

`GET /api/admin/sports-connect/ingest` (same auth) returns whether the secret is configured and documents accepted body shapes.

---

## Security

- Treat exports as **PII**. Do not commit real SC files to git.  
- Fixtures under `lib/sportsConnect/__fixtures__/` are **headers only**.  
- Never store SportsConnect passwords in this app. Do not scrape SC UIs.  
- On Master, always choose a **concrete site** before importing (never All Sites writes).  
- No SC API credentials: none exist for public use, and none should be invented via scrape.  
- n8n machine token (`SPORTS_CONNECT_INGEST_SECRET`) is **not** an SC password — scope it to admin ingest only; rotate if leaked.

---

## Related code

| Area | Path |
|------|------|
| Integration plan | `docs/sports-connect-integration-plan.md` |
| Catalog | `lib/sportsConnect/reportCatalog.ts` |
| Detector | `lib/sportsConnect/columnProfiles.ts` |
| Quality | `lib/sportsConnect/quality.ts` |
| Presets | `lib/sportsConnect/mappingPresets.ts` |
| Preview / multi-file | `lib/sportsConnect/preview.ts` |
| Ingest (n8n) | `lib/sportsConnect/ingest.ts`, `ingestAuth.ts`, `parseExportBuffer.ts` |
| Ingest route | `app/api/admin/sports-connect/ingest/route.ts` |
| Import runs | `lib/sportsConnect/importRuns.ts` |
| Registration URL | `lib/sportsConnect/registrationUrl.ts` |
| Smart Auto-Build wizard (primary import UI) | `components/admin/teams/SmartAutoBuildWizard.tsx` |
| Smart Auto-Build routes | `app/api/admin/teams/smart-build/{inspector,preview,confirm,undo}/route.ts` |
| Import Registration Data tab | `components/admin/competition/CompetitionImportTab.tsx` |
| Import tab page (legacy redirect) | `app/admin/sports-connect/page.tsx` → `/admin/competition?tab=sports-connect` |
| Player import engine (writes `TeamPlayer` + `Enrollment`) | `app/api/admin/teams/import/route.ts` |
| Coach import engine | `app/api/admin/users/import/route.ts` |
| Enrollment KPIs | `lib/enrollment/kpi.ts`, `components/admin/enrollment/EnrollmentKpiHub.tsx` |
| Public Fall Ball copy | `app/registration/page.tsx` |
| n8n workflow | `infra/range/stacks/n8n/exports/sc-export-landed.workflow.json` |

---

## Automation ladder (optional later)

No public SC API does **not** mean “no automation.” Preferred order:

| Path | Status | Notes |
|------|--------|-------|
| **Smart Auto-Build wizard** (shipped) | **Live** | Human export → upload/Drive-pull → preview all 3 report types → confirm |
| **n8n (potions) file-drop** | **Implemented (v1)** | Webhook → `POST …/ingest` → PREVIEW + desk link; import/activate on potions when secret set; **no auto roster write** |
| **Holocrons droid co-pilot** | Design ready | Checklist, quality brief, preset reminders via our APIs; **no SC password** |
| **Secure export drop ingest** | Open | Same as n8n path with optional later approve-to-import |
| **Parent account seed** | Open | After parent Player Cards product decision |
| **Official public SC API client** | **Closed** | Revisit only with vendor **private** partner docs |
| **Credentialed UI pull (scrape/login bot)** | **Not default** | Only with explicit operator approval (ToS, vaulted SC secret, brittle UI); feed files into n8n drop path |

**n8n plane:** https://potions.duckroostdigital.com (ADR-002).  
**Details:** short designs for Options D (n8n) and E (droid) in [`sports-connect-integration-plan.md`](./sports-connect-integration-plan.md).
