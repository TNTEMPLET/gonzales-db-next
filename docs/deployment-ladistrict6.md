# Louisiana DYB District 6 — Vercel deployment

Tournament-only site at **https://district6.apbaseball.com**, mirroring the `ladistrict2` / district2.apbaseball.com pattern.

## Vercel project setup

1. In the Vercel dashboard (AP Baseball team), **Add New Project** → import `TNTEMPLET/gonzales-db-next` (or duplicate the `district2` project settings).
2. Set environment variables (copy from `district2` / `gonzales` production):
   - `SITE_ORG` = **`ladistrict6`** (required — selects org in `lib/siteConfig.ts`)
   - `DATABASE_URL` — same shared Postgres as other orgs
   - Any other shared secrets (Blob, etc.) as needed
3. **Domains:** add `district6.apbaseball.com` (CNAME to Vercel, same as district2.apbaseball.com).
4. Deploy from `main` after merge from `preview`.

## Local dev

```bash
pnpm dev:ladistrict6
# or all orgs including District 6 on port 3004:
pnpm dev:all
```

Browse: http://localhost:3004/tournaments

## Seed brackets + Gonzales promo (production DB)

After deploy, from a machine with production `DATABASE_URL`:

```bash
pnpm seed:ladistrict6-tournament
```

This creates/updates:

- `2026 Louisiana DYB District 6 Tournament — 10U` (READY)
- `2026 Louisiana DYB District 6 Tournament — 9U` (READY)
- Gonzales news post slug `2026-dyb-district-6-tournament` linking to district6/tournaments

Admin review: https://admin.apbaseball.com/admin/tournament-brackets?org=ladistrict6

## Gonzales flyer (when ready)

1. Master admin → News (Gonzales org) → edit **2026 Louisiana DYB District 6 Tournament**
2. Upload flyer image
3. Enable **Homepage rotator** if desired
4. Keep link to https://district6.apbaseball.com/tournaments in the body
