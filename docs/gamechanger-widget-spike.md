# GameChanger scoreboard widget spike

## Summary

The public embed SDK is display-only, but the widget iframe loads data from an **unauthenticated public JSON API** on `api.team-manager.gc.com`. That API is sufficient for live scores on bracket cards and for modal scoreboards.

## Public API

```
GET https://api.team-manager.gc.com/public/widgets/scoreboard/{widgetId}?start={ISO8601}
```

- `start`: start of local day (widget uses start-of-day); we send UTC midnight for “today” and also try yesterday when matching multi-day tournaments.
- Response includes `next_update` (ISO timestamp) for cache / poll interval hints.
- `data.events[]` fields used by this app:
  - `id` (UUID)
  - `start_ts`, `timezone`
  - `game_status`: `"live"` | `"completed"` | omitted / other (scheduled)
  - `home_team` / `away_team`: `name`, `score?`, `is_video_live?`, `has_archived_video?`
  - `sport_specific.bats.inning_details` (baseball): `{ inning, half }`
  - `sport_specific.bats.total_outs` (optional): cumulative outs; outs in current half = `total_outs % 3`
  - `sport_specific.bats.balls` / `strikes` (optional): not currently returned on the public endpoint; schema accepts them if GC adds them later

## Embed SDK (`widgets.gc.com/static/js/sdk.v1.js`)

- `GC.scoreboard.init({ target, widgetId, maxVerticalGamesVisible?, layout?, options? })`
- `GC.scoreboard.clear()` — required before closing modal or re-init
- Parent page only receives `postMessage` **RESIZE** events (iframe height), not game payloads
- `options` is passed as URL query params; per-game filter keys are **not documented** — modal shows full tournament scoreboard

## Matching bracket games → GC events

No `officialGameNumber` on GC events. Match by normalized team names (home/away either orientation) with optional `start_ts` tie-break when bracket has schedule fields.

## Polling

Server route caches responses ~15s. Client refetches on an interval derived from `next_update` (min 15s, max 60s).
