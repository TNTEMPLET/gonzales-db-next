# Fix Fall Ball production form (DATABASE_URL)

## Symptom

Submitting **https://fallball.apbaseball.com/coaching-interest** shows:

`Failed to execute 'json' on 'Response': Unexpected end of JSON input`

or (after client fix):

`database unavailable` / HTTP 500 with a JSON error body.

Other sites (dyb.apbaseball.com, admin) reach the DB; **apbaseball-fallball** does not.

Root cause from API logs / sibling routes:

`Can't reach database server at base` → **Vercel project `apbaseball-fallball` has a missing or invalid `DATABASE_URL`.**

LAN dev (`http://192.168.100.156:3005`) works because it uses local Postgres.

## Fix (operator — ~2 minutes)

1. Open [Vercel](https://vercel.com) → team **tntemplets-projects**.
2. Open project **gonzales-db-next** (or any **working** AP Baseball production project) → **Settings → Environment Variables**.
3. Copy **Production** `DATABASE_URL` (and `DIRECT_DATABASE_URL` / `SHADOW_DATABASE_URL` if present).
4. Open project **apbaseball-fallball** → **Settings → Environment Variables**.
5. Set the same `DATABASE_URL` for **Production** (and Preview if you want previews to write).
6. Confirm `SITE_ORG` = **`fallball`**.
7. **Deployments → … → Redeploy** the latest Production deployment (clear cache optional).

## Verify

```bash
curl -sS -X POST 'https://fallball.apbaseball.com/api/coaching-interest' \
  -H 'Content-Type: application/json' \
  -d '{"firstName":"Test","lastName":"User","email":"you+test@example.com","cellPhone":"2255551212","interestedDivision":"10U","rolePreference":"EITHER","hasCoachedBefore":false}'
```

Expect: `{"data":{"id":"...","status":"NEW"}}` and HTTP 200.

Then submit once in the browser at `/coaching-interest`.

## Code hardening (already shipped)

- Form parses `response.text()` so empty bodies no longer throw raw `json` SyntaxError.
- API returns non-empty JSON on DB failure and checks `DATABASE_URL`.
