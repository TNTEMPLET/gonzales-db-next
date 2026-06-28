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

## Timezone

GameChanger’s web schedule form interprets date/time in the **browser’s timezone**, not as abstract labels. The homelab writer runs Playwright with `timezoneId: America/Chicago` and `TZ=America/Chicago` in the container so typed values match bracket PDF times (e.g. **10:00 AM on 6/28** stays local, not UTC).

gonzales-db-next computes `gcFormDate` / `gcFormTime` via `gcWebFormTime.ts`. The UTC `scheduledFor` instant is used for scoreboard event matching after save.

If games were created before this fix, times on web.gc.com may look like UTC offsets (e.g. 5:00 PM stored when you expected 10:00 AM) — correct those games manually in GC or recreate after redeploying the writer.

Example: **5:00 PM CDT on 6/27** → form entry **5:00 PM** on `06/27/26` → API `start_ts` `2026-06-27T22:00:00.000Z`.

## Deploy

```bash
cp /config/infra/range/stacks/gamechanger-writer/gc-writer.env.example \
  /config/infra/range/stacks/gamechanger-writer/gc-writer.env
# edit gc-writer.env (BW_SESSION, writer secret)
docker compose -f /config/infra/range/stacks/gamechanger-writer/docker-compose.yml up -d --build
```
