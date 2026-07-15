# Sports Connect integration plan

**Owner:** CTO (integration architecture)  
**Execute:** Huyang / Grok Build (app); n8n on **potions** (orchestration); optional Holocrons droid assist  
**Surface:** `Gonzales-db-next` — Master Admin primary  
**Related:** ADR-002 (n8n orchestration plane), `docs/sports-connect-import.md`  
**Updated:** 2026-07-15  

---

## Decision: no official public SportsConnect API

**Research finding (2026-07-15):** SportsConnect (Stack Sports; formerly Blue Sombrero) does **not** offer a documented, self-serve public developer API for pulling registration or roster data.

| Product layer | Finding |
|---------------|---------|
| **SportsConnect** admin SaaS | Registration, payments, rosters, reporting in-product. No public developer portal / OAuth / roster pull API found. |
| **Blue Sombrero** | Prior branding; legacy registration domains still appear. No separate public “User API” for roster export found. |
| **Stack Sports** | Parent company. No public SC-specific data API documented for league integrations. |
| **How leagues move data** | **CSV / spreadsheet export** from the SC admin UI (same pattern used by GameChanger and other tools). |

**What that means (and what it does not):**

| Fact | Implication |
|------|-------------|
| No public SC REST/OAuth API | Do **not** plan `lib/sportsConnect/client.ts` against a fictional public API |
| Leagues already use **files** | Our core path is **export → file → Ops Desk / Teams** (shipped) |
| Automation can still exist | **n8n**, **droids**, and **export drops** are valid — they do not require a public SC API |
| UI login bots | Possible but **not default**; require explicit operator approval (ToS, secrets, brittleness) |

Unrelated third-party “sports data” APIs (scores/stats vendors) are **not** SportsConnect and must not be used as a substitute.

---

## Product shape (shipped + automation ladder)

SportsConnect remains **registration / payment system of record**.  
This platform is the **ops hub** after export: teams, rosters, coaches, volunteers, schedules, communications, Player Cards.

```
SportsConnect (export or drop)
        │
        ▼
┌──────────────────────────────────────────────┐
│  Optional: n8n (potions)  ·  Holocrons droid │
│  detect · notify · stage · never invent API  │
└──────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────┐
│  Master Admin · Sports Connect Ops Desk      │
│  checklist · presets · quality · run history │
└──────────────────────────────────────────────┘
        │
        ▼
  Teams / People import engines (existing)
```

### Phases

| Phase | Status | Deliverable |
|-------|--------|-------------|
| **0** Catalog + column detect + runbook | **Done** | `lib/sportsConnect/*`, fixtures, tests, import runbook |
| **1** Mapping presets + quality | **Done** | Prisma presets/runs, Teams preset UI, quality panel |
| **2** Ops Desk + audit runs | **Done** | `/admin/sports-connect`, multi-file plan, history, dashboard card |
| **3** Deeper automation | **Partial** | **D (n8n) v1 shipped**; A / C / E open; B closed |

### Phase 3 options (revised)

| Option | Status | When | Work |
|--------|--------|------|------|
| **A. Secure export drop** | **Preferred unattended path** | CSV lands in email / Drive / S3 / LAN folder | Ingest + detect + notify; optional staged import; still no SC API |
| **B. Official SC API** | **Closed (no public API)** | Only if vendor grants a **private** partner API in writing | Client modeled on Assignr; **not planned** without written access |
| **C. Parent account seed** | **Viable later** | Parent Player Cards portal product decision | Invite-only `RegisteredUser` from guardian emails |
| **D. n8n orchestration** | **Implemented (v1)** | Want glue without new app services | potions `sc-export-landed` → `POST …/ingest` → PREVIEW + notify stub |
| **E. Holocrons droid assist** | **Viable now (design below)** | Want operator co-pilot or (later) approved pull | Desk co-pilot default; credentialed SC pull only with explicit approval |
| **F. Credentialed UI pull (scrape/login bot)** | **Not default** | Operator accepts ToS + fragility + vaulted SC secrets | Browser automation via n8n/Playwright or droid; isolated secrets; audit |

**Default next step after Phase 2:** **D (n8n file-drop)** is implemented on the platform + workflow export (import/activate on potions when secret is set). Prefer **E (droid co-pilot)** next before any login bot. **Do not block on B.**

### Non-goals (standing)

- Replacing SportsConnect registration or payment collection  
- Depending on a public SC developer API that does not exist  
- Auto-creating parent accounts without product approval  
- Shipping unattended SC login scrape as the default integration without operator sign-off  

**Scrape is not “impossible”** — it is **out of default scope**. Prefer file drop + n8n + droid assist.

---

## Short design: Option D — n8n (potions)

**Owner:** CTO architecture; **COO** for potions deploy/secrets; Huyang for any new platform ingest routes.  
**Plane:** n8n at **https://potions.duckroostdigital.com** (ADR-002).  
**SoR for rosters:** still `Gonzales-db-next` import engines — n8n does **not** become the roster database.

### Goal

Reduce Master Admin busywork when exports already exist as files: detect report kind, attach quality estimates, notify, optionally stage for import — **without** SC UI login.

### Architecture

```
[Export source]
  human download  OR  SC email  OR  Drive/S3/LAN drop folder
        │
        ▼
  n8n workflow: sc-export-landed  (potions webhook)
        │  1. Accept file (JSON contentBase64 or binary)
        │  2. POST /api/admin/sports-connect/ingest
        │     Authorization: Bearer SPORTS_CONNECT_INGEST_SECRET
        │  3. Platform: parse → detect → preview → PREVIEW run
        │  4. Summarize (no full PII rows in n8n logs)
        │  5. Notify Master (email stub → wire SMTP)
        │  6. Deep link: admin.apbaseball.com/admin/sports-connect?org=…
        ▼
  Master confirms maps in Ops Desk / Teams → existing import engines write DB
```

**v1 rule:** n8n **does not auto-commit** roster writes. Preview + notify only.  
**v2 (optional):** after explicit Master toggle / webhook “approve”, n8n calls Teams import start/chunk/complete with saved presets — still human-gated.

### Shipped pieces (2026-07-15)

| Piece | Location |
|-------|----------|
| Machine auth | `lib/sportsConnect/ingestAuth.ts` — env `SPORTS_CONNECT_INGEST_SECRET` |
| Parse buffer | `lib/sportsConnect/parseExportBuffer.ts` (CSV/XLSX, 15MB cap, sample rows) |
| Ingest core | `lib/sportsConnect/ingest.ts` — preview + `recordImportRunSafe(PREVIEW)` |
| HTTP route | `POST/GET /api/admin/sports-connect/ingest` |
| n8n workflow | `infra/range/stacks/n8n/exports/sc-export-landed.workflow.json` |
| potions runbook | `infra/range/runbooks/n8n-potions.md` § Phase 3 |

### Workflow (`sc-export-landed`)

| Node | Responsibility |
|------|----------------|
| Trigger | Webhook `POST /webhook/sc-export-landed` (IMAP/Drive/LAN can call this later) |
| Normalize | Require concrete `org` + `contentBase64` or binary; strip unsafe file names |
| Call platform | `POST …/sports-connect/ingest` with Bearer machine secret |
| Summarize | reportKind, confidence, missing guardian estimate, desk URL, run id — **no row dump** |
| Notify | Subject stub: `[SC] {org} {kind} export ready…` + Ops Desk URL; wire Send Email in potions |

### Auth & secrets

| Secret | Where | Notes |
|--------|-------|-------|
| `SPORTS_CONNECT_INGEST_SECRET` | Vercel **apbaseball-admin** + potions env | Bearer token for n8n; constant-time compare |
| Optional `SPORTS_CONNECT_ADMIN_BASE_URL` | Vercel admin | Ops Desk deep-link host (default `https://admin.apbaseball.com`) |
| Drop-folder / Drive / IMAP | potions credentials | PII — restrict who can open n8n |
| SC admin password | **Not required for Option D** | Only if Option F is later approved |

### Request contract

**Auth:** `Authorization: Bearer <SPORTS_CONNECT_INGEST_SECRET>` (or Master admin session with TEAMS for manual test).

**Multipart:** fields `file`, `org` (required), `seasonYear` (optional).

**JSON:** `{ org, seasonYear?, fileName, contentBase64, recordPreviewRun? }`.

`org` must be `fallball` | `gonzales` | `ascension` (never All Sites). Response includes `preview`, optional `run`, `deskUrl`, `message`. `writesRosters` is always false.

### Operator activate checklist

1. Generate secret: `openssl rand -hex 32`.  
2. Set on Vercel **apbaseball-admin** → redeploy/admin env pick-up.  
3. Set same secret on potions (`/srv/stack/.env` or n8n env) → restart n8n if needed.  
4. Import `sc-export-landed.workflow.json` (see n8n exports README).  
5. Smoke webhook with header-only fixture; confirm PREVIEW run in Ops Desk History.  
6. Wire Send Email after Notify stub; then activate workflow.

### Verification (D)

1. `GET …/ingest` with Bearer → `configured: true`.  
2. Webhook or direct ingest with synthetic fixture → correct `reportKind`.  
3. Master gets notify (once SMTP wired) with working Ops Desk link.  
4. No roster rows created until Master imports in Teams.  
5. Execution logs redacted / short retention for PII.

---

## Short design: Option E — Holocrons droid assist

**Owner:** CTO for agent scope; **COO** if a long-running droid app is deployed; Grok Build for prompts/skills.  
**Default mode:** **co-pilot** (no SC login).  
**Escalation mode:** credentialed pull = Option F, only with operator approval.

### Goal

Give Master Admins a conversational assistant that knows the SC load path, report catalog, presets, and quality KPIs — without replacing Ops Desk.

### Modes

| Mode | Description | Credentials |
|------|-------------|-------------|
| **E1. Desk co-pilot (default)** | Answers “what do I export?”, “load order?”, “why quality failed?”; can call **our** catalog/quality/presets/runs APIs read-only | Admin session / Holocrons tools only — **no SC password** |
| **E2. Import coach** | Walks multi-file plan language; reminds to save presets; links Teams undo | Same as E1 |
| **E3. Credentialed pull (optional later)** | Browser/session automation downloads SC reports into drop folder, then hands off to n8n Option D | SC admin secret in vault; **explicit approval**; treat as Option F |

### Architecture (E1–E2)

```
Operator (chat / 42 / Grok Build)
        │
        ▼
  Holocrons agent (SC assist skill)
        │  read docs/sports-connect-import.md
        │  GET catalog / quality / presets / runs
        │  never invent SC API calls
        ▼
  Reply: checklist step + deep links + quality summary
```

Suggested skill path (when implemented):  
`.cursor/skills/` or droid skill **sports-connect-assist** — load catalog order, non-goals (no public API, no default scrape), point to Ops Desk.

### Suggested agent behaviors

1. **Route by intent:** “import fall ball players” → Ops Desk checklist + required columns.  
2. **Quality brief:** `GET quality?org=fallball&seasonYear=…` → plain-language gaps (guardian email, teams without coaches).  
3. **Preset reminder:** if no preset for season, prompt Master to save after first map.  
4. **Handoff to n8n:** if drop-folder workflow is live, say “file already staged — open History / email from potions.”  
5. **Refuse scrape by default:** if asked to “log into SportsConnect and pull,” explain E3/F requires operator approval and vaulted secrets.

### Verification (E)

1. Agent cites correct load order from catalog.  
2. Quality brief matches Ops Desk panel for same org/season.  
3. Agent does not propose storing SC passwords or calling non-existent public APIs.  
4. Logs under `droids/.../logs/` when operator confirms a session.

---

## Short design: Option F — credentialed UI pull (not default)

Only if Master explicitly accepts:

- Stack/SC terms risk  
- UI breakage  
- SC admin secret in potions/vault  
- PII in automation logs  

Then: Playwright/n8n browser flow logs in → downloads known reports → writes to **same drop folder as Option D** → n8n preview/notify path. **Never** write SC password into Gonzales-db-next env or git. Prefer **human MFA** or short-lived sessions over long-lived unattended login when possible.

---

## Ownership

| Role | Responsibility |
|------|----------------|
| **CTO** | Approve automation ladder; no-public-API rule; secrets policy for F |
| **COO** | potions/n8n deploy, vault access, change lifecycle for unattended jobs |
| **Huyang / Grok Build** | Ops Desk, ingest routes, presets, tests |
| **Holocrons droid** | E1/E2 co-pilot skill; E3 only if approved |
| **Master Admin** | Exports (or approves drop path); confirms imports; never All Sites writes |

---

## Operator runbook

Day-to-day SC load steps: **[`docs/sports-connect-import.md`](./sports-connect-import.md)**

---

## Success metrics

| Metric | Target |
|--------|--------|
| Places Master goes to load SC data | **1 desk** (`/admin/sports-connect`) |
| Re-map divisions every import | **0** when preset exists |
| SC public API dependency | **None** (confirmed) |
| Unattended path | File drop + n8n preferred over scrape |
| Missing guardian email visibility | Pre- and post-import |
| Droid default | Co-pilot (E1), not login bot |
