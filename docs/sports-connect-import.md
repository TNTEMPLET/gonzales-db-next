# SportsConnect → platform import runbook

**Audience:** Master Admins and league admins loading registration data into AP Baseball sites.  
**System of record for registration/payment:** SportsConnect (APBaseball.com / Stack Sports).  
**This platform:** teams, rosters, coaches, volunteers, schedules, communications, Player Cards.

## No SportsConnect API (confirmed)

There is **no official public developer API** for SportsConnect registration/roster pulls (research 2026-07-15; Blue Sombrero legacy branding included). Leagues move data via **admin CSV/XLSX export**.

| Do | Do not |
|----|--------|
| Export reports from SC admin UI | Call a SportsConnect REST/OAuth API (none available) |
| Upload into Ops Desk / Teams | Rely on a public SC developer portal that does not exist |
| Use mapping presets + quality | Store SC admin passwords in this app by default |
| Use **n8n / droid** for file-drop assist and co-pilot | Treat third-party sports-stats APIs as SportsConnect |
| Prefer export drop + notify over UI bots | Ship unattended SC login scrape without operator approval |

**Integration model:** **export → file import**, with assisted detection, reusable mapping presets, Ops Desk checklist, and import-run audit. **Automation ladder** (n8n, droid, optional credentialed pull) is in the product plan — no public API required.

Full product plan (includes short designs for n8n + droid): [`docs/sports-connect-integration-plan.md`](./sports-connect-integration-plan.md).

---

## Recommended load order

1. **Team list** (optional) — age groups + team names exist for the season.  
2. **Player registration report** — rosters + guardian fields.  
3. **Coach / volunteer sheet** — coach accounts and assignments.  
4. **Review quality** — missing guardian emails, incomplete Player Cards, teams without coaches.

On **Master Admin**, set the site first (`Fall Ball`, `Gonzales`, or `Ascension`), then open **Sports Connect Ops Desk** (`/admin/sports-connect`) or **Teams**.

### Ops Desk (Phase 2 — shipped)

| Section | Purpose |
|---------|---------|
| **Setup** | Season, family registration URL, preset summary, deep links |
| **Checklist** | Team list → players → coaches → quality with status |
| **File plan** | Multi-file upload → detect → assign to load-order steps |
| **Quality** | Guardian email / Player Card readiness / empty teams |
| **History** | `SportsConnectImportRun` audit (batch links when recorded) |

Dashboard card: **Sports Connect Ops Desk** (Master + Fall Ball).

---

## Report types

| Kind | Typical SC export | Platform job |
|------|-------------------|--------------|
| `TEAM_LIST` | Age Group + Team / MLB Team | Teams → Import Team List |
| `PLAYER_REG` | Participants / registration report | Teams → SportsConnect Player Import |
| `COACH_VOLUNTEER` | Volunteer/coach registration | Teams → Coach Import |

The admin **detect** route scores file headers against these profiles (`lib/sportsConnect/columnProfiles.ts`). Detection is local to our platform — it does not call SportsConnect.

---

## Player registration export tips

**Strongly include**

- Division / age group  
- Team name  
- Player name (full or first + last)  
- Parent / account / user email (needed later for parent Player Cards)

**Useful optional fields**

- Payment status, order number/date  
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

Family registration URL constant: `lib/sportsConnect/registrationUrl.ts` (used by Fall Ball `/registration` and the Ops Desk).

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
| Ops Desk UI | `components/admin/AdminSportsConnectDesk.tsx` |
| Ops Desk page | `app/admin/sports-connect/page.tsx` |
| Player import engine | `app/api/admin/teams/import/route.ts` |
| Coach import engine | `app/api/admin/users/import/route.ts` |
| Public Fall Ball copy | `app/registration/page.tsx` |
| n8n workflow | `infra/range/stacks/n8n/exports/sc-export-landed.workflow.json` |

---

## Automation ladder (optional later)

No public SC API does **not** mean “no automation.” Preferred order:

| Path | Status | Notes |
|------|--------|-------|
| **Ops Desk + Teams** (shipped) | **Live** | Human export → upload → map → import |
| **n8n (potions) file-drop** | **Implemented (v1)** | Webhook → `POST …/ingest` → PREVIEW + desk link; import/activate on potions when secret set; **no auto roster write** |
| **Holocrons droid co-pilot** | Design ready | Checklist, quality brief, preset reminders via our APIs; **no SC password** |
| **Secure export drop ingest** | Open | Same as n8n path with optional later approve-to-import |
| **Parent account seed** | Open | After parent Player Cards product decision |
| **Official public SC API client** | **Closed** | Revisit only with vendor **private** partner docs |
| **Credentialed UI pull (scrape/login bot)** | **Not default** | Only with explicit operator approval (ToS, vaulted SC secret, brittle UI); feed files into n8n drop path |

**n8n plane:** https://potions.duckroostdigital.com (ADR-002).  
**Details:** short designs for Options D (n8n) and E (droid) in [`sports-connect-integration-plan.md`](./sports-connect-integration-plan.md).
