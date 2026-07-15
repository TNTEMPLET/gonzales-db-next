# SportsConnect → platform import runbook

**Audience:** Master Admins and league admins loading registration data into AP Baseball sites.  
**System of record for registration/payment:** SportsConnect (APBaseball.com).  
**This platform:** teams, rosters, coaches, volunteers, schedules, communications, Player Cards.

There is **no live SportsConnect API** in this product. Integration is **export → file import**, with assisted detection and reusable mapping presets.

---

## Recommended load order

1. **Team list** (optional) — age groups + team names exist for the season.  
2. **Player registration report** — rosters + guardian fields.  
3. **Coach / volunteer sheet** — coach accounts and assignments.  
4. **Review quality** — missing guardian emails, incomplete Player Cards, teams without coaches.

On **Master Admin**, set the site first (`Fall Ball`, `Gonzales`, or `Ascension`), then open **Teams**.

---

## Report types

| Kind | Typical SC export | Platform job |
|------|-------------------|--------------|
| `TEAM_LIST` | Age Group + Team / MLB Team | Teams → Import Team List |
| `PLAYER_REG` | Participants / registration report | Teams → SportsConnect Player Import |
| `COACH_VOLUNTEER` | Volunteer/coach registration | Teams → Coach Import |

The admin **detect** API scores file headers against these profiles (`lib/sportsConnect/columnProfiles.ts`).

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

- Umpire  
- Little League tee ball (Modified tee ball is kept)  
- 3–4 year-old / 5 year-old programs  

---

## Mapping presets

Division → age group and team name maps can be **saved per org + season** as a SportsConnect mapping preset. Reuse them on the next import so Master Admins do not re-map every export.

**In UI (Teams → Player Import mapping step):**

- Detection banner scores the uploaded file headers against known SC report profiles.  
- **Load / Apply** a saved preset, or **Save preset** after adjusting division and team maps.  
- Opening a new import pre-fills from the most recently updated `PLAYER_REG` preset for the site + season when available.

API:

- `GET/POST /api/admin/sports-connect/presets?org=&seasonYear=`  
- `DELETE /api/admin/sports-connect/presets/[id]?org=`  
- `POST /api/admin/sports-connect/detect` with `{ headers: string[] }`  
- `GET /api/admin/sports-connect/catalog`

---

## Quality checks

After a load, review on the Teams workflow header (**SportsConnect roster quality** panel):

- Players missing **guardian email**  
- Players **incomplete** on Player Card readiness  
- Teams with **no coaches** or **no players**  
- Last successful player/coach import timestamps  

API: `GET /api/admin/sports-connect/quality?org=&seasonYear=`

---

## Security

- Treat exports as **PII**. Do not commit real SC files to git.  
- Fixtures under `lib/sportsConnect/__fixtures__/` are **headers only**.  
- Never store SportsConnect passwords in this app. Do not scrape SC UIs.  
- On Master, always choose a **concrete site** before importing (never All Sites writes).

---

## Related code

| Area | Path |
|------|------|
| Catalog | `lib/sportsConnect/reportCatalog.ts` |
| Detector | `lib/sportsConnect/columnProfiles.ts` |
| Quality | `lib/sportsConnect/quality.ts` |
| Presets | `lib/sportsConnect/mappingPresets.ts` |
| Player import engine | `app/api/admin/teams/import/route.ts` |
| Coach import engine | `app/api/admin/users/import/route.ts` |
| Public Fall Ball copy | `app/registration/page.tsx` |
