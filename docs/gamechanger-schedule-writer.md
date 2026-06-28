# GameChanger Schedule Writer

Homelab service that creates H2H games on `web.gc.com` for the Schedule Manager cron.

## Stack

- Compose: `/config/infra/range/stacks/gamechanger-writer/docker-compose.yml`
- Service code: `/config/gonzales-db-next/services/gamechanger-schedule-writer`
- Default port: `8105` (`/health`, POST create)

## Credentials

Gringotts item defaults to `SRF - Trent` (AP Baseball folder). Set `GRINGOTTS_GC_VAULT_ITEM` if the vault label differs.

The container needs a valid `BW_SESSION` (or host unlock workflow) and `BW_SERVER_URL`.

## Vercel env (ladistrict2)

```env
GAMECHANGER_SCHEDULE_WRITER_ENABLED=true
GAMECHANGER_SCHEDULE_WRITER_ENDPOINT=https://<tunnel-or-lan-host>:8105
GAMECHANGER_SCHEDULE_WRITER_SECRET=<shared-secret>
SCHEDULE_MANAGER_CRON_LIVE=true
```

Per bracket in admin: enable **Schedule Manager**.

Schedule Manager creates **every unlocked game where both teams are known** (no feeder placeholders like `W3` / `L4`). Later-round games stay skipped until bracket results fill in those slots.

When a GameChanger game goes **final**, the bracket GC sync cron (`/api/cron/bracket-gamechanger-sync`, every 10 minutes) imports the score if needed and then runs Schedule Manager **LIVE** to create all ready next-round games for that bracket. The same LIVE run happens when an admin polls GameChanger live sync in the bracket editor.

## Request contract

POST body from gonzales-db-next:

```json
{
  "action": "createGame",
  "game": {
    "widgetId": "...",
    "gcOrganizationId": "nyKveVgqszKT",
    "gcFormDate": "06/27/26",
    "gcFormTime": "5:00 PM",
    "scheduledFor": "2026-06-27T22:00:00.000Z",
    "homeTeam": "10U Eastbank",
    "awayTeam": "10U Ascension LL",
    "field": "F1",
    "durationLabel": "2 hr"
  }
}
```

Response: `{ "eventId": "<uuid>" }`

## Timezone hardening

GameChanger’s web schedule form interprets date/time in the **browser’s timezone**, not as abstract labels. The homelab writer runs Playwright with `timezoneId: America/Chicago` and `TZ=America/Chicago` in the container so typed values match bracket PDF times (e.g. **10:00 AM on 6/28** stays local, not UTC).

gonzales-db-next computes `gcFormDate` / `gcFormTime` via `gcWebFormTime.ts` (bracket Central labels, no offset). The UTC `scheduledFor` instant is used for scoreboard event matching after save.

**Writer guards (fail the request instead of saving a bad game):**

- Assert Playwright browser timezone is `America/Chicago` and container `TZ` matches.
- Reject requests when `scheduledFor` does not match `gcFormDate` + `gcFormTime` (catches +5h offset mistakes upstream).
- After save, re-fetch the scoreboard event and assert `start_ts` equals `scheduledFor`.
- Assert `location.name` matches `field` / `venue` when provided.

Example: **12:00 PM CDT on 6/28** → form entry **12:00 PM** on `06/28/26` → API `start_ts` `2026-06-28T17:00:00.000Z`.

## Location / field

The schedule form uses `#location-field` (Google Places typeahead), not a plain text fill. For tournament field labels like `F3`, the writer types the label and selects the **Add "F3"** typeahead row (custom location, no address). Existing org locations (e.g. `TBD`) can be picked from the dropdown.

After save, the writer verifies `location.name` on the scoreboard event matches the requested `field` or `venue`.

## Deploy

```bash
cp /config/infra/range/stacks/gamechanger-writer/gc-writer.env.example \
  /config/infra/range/stacks/gamechanger-writer/gc-writer.env
# edit gc-writer.env (BW_SESSION, writer secret)
docker compose -f /config/infra/range/stacks/gamechanger-writer/docker-compose.yml up -d --build
```
