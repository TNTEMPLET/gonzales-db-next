# Sports Connect integration plan

**Owner:** CTO (integration architecture)  
**Execute:** Huyang / Grok Build (`vibe-fullstack`)  
**Surface:** `Gonzales-db-next` — Master Admin primary  
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

**Implications for this platform:**

1. Integration is and remains **export → file import** (assisted), not live sync.  
2. Do **not** plan on `lib/sportsConnect/client.ts` or SC OAuth unless the **vendor later provides a private partner API in writing**.  
3. Do **not** scrape SC UIs or store SC admin passwords.  
4. Unrelated third-party “sports data” APIs (scores/stats vendors) are **not** SportsConnect and must not be used as a substitute.

This supersedes earlier Phase 3 wording that treated “official SC API” as an equal option. **Option B is closed** until a vendor contract changes the facts.

---

## Product shape (shipped)

SportsConnect remains **registration / payment system of record**.  
This platform is the **ops hub** after export: teams, rosters, coaches, volunteers, schedules, communications, Player Cards.

### Phases

| Phase | Status | Deliverable |
|-------|--------|-------------|
| **0** Catalog + column detect + runbook | **Done** | `lib/sportsConnect/*`, fixtures, unit tests, `docs/sports-connect-import.md` |
| **1** Mapping presets + quality | **Done** | Prisma presets/runs, Teams preset UI, quality panel |
| **2** Ops Desk + audit runs | **Done** | `/admin/sports-connect`, multi-file plan, run history, dashboard card |
| **3** Deeper automation | **Open — pick A or C only** | See below |

### Phase 3 options (revised)

| Option | Status | When | Work |
|--------|--------|------|------|
| **A. Secure export drop** | **Viable** | SC can email/SFTP/S3 a nightly CSV | Ingest worker + idempotent import using saved presets; still no SC API |
| **B. Official SC API** | **Closed (no public API)** | Only if vendor later grants a **private** partner API with docs | Would add client modeled on Assignr; **not planned** without written vendor access |
| **C. Parent account seed** | **Viable later** | Parent Player Cards portal product decision | Optional `RegisteredUser` from guardian emails (invite-only); no passwords in CSV |

**Default next step after Phase 2:** stay on assisted upload; consider **A** if operators want unattended loads, or **C** when parent portal is approved. **Do not block on B.**

---

## Non-goals (standing)

- Scraping SportsConnect / apbaseball.com registration UIs  
- Replacing SportsConnect registration or payment collection  
- Depending on a public SC developer API that does not exist  
- Auto-creating parent accounts without an explicit product decision  

---

## Operator runbook

Day-to-day steps, report kinds, presets, quality, and platform API routes:  
**[`docs/sports-connect-import.md`](./sports-connect-import.md)**

---

## Success metrics

| Metric | Target |
|--------|--------|
| Places Master goes to load SC data | **1 desk** (`/admin/sports-connect`) |
| Re-map divisions every import | **0** when preset exists |
| SC public API dependency | **None** (confirmed) |
| Missing guardian email visibility | Pre- and post-import |
