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

## Request contract

POST body from gonzales-db-next:

```json
{
  "action": "createGame",
  "game": {
    "widgetId": "...",
    "gcOrganizationId": "nyKveVgqszKT",
    "gcFormDate": "06/27/26",
    "gcFormTime": "10:00 PM",
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

The writer types **UTC** date/time into the GC web form. gonzales-db-next computes `gcFormDate` / `gcFormTime` from bracket schedule (America/Chicago) via `gcWebFormTime.ts`.

Example: **5:00 PM CDT** → form entry **10:00 PM** on `06/27/26`.

## Deploy

```bash
cp /config/infra/range/stacks/gamechanger-writer/gc-writer.env.example \
  /config/infra/range/stacks/gamechanger-writer/gc-writer.env
# edit gc-writer.env (BW_SESSION, writer secret)
docker compose -f /config/infra/range/stacks/gamechanger-writer/docker-compose.yml up -d --build
```
