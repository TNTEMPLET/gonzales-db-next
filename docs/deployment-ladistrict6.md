# Louisiana DYB District 6 — Vercel deployment

Tournament-only site at **https://district6.apbaseball.com**, mirroring the `ladistrict2` / district2.apbaseball.com pattern.

## Status (2026-06-14)

| Item | Status |
|------|--------|
| Code on `main` | Done (`64d5db3`) |
| Brackets seeded (READY) | Done — 10U + 9U in production DB |
| Gonzales promo news | Live — [dyb.apbaseball.com/news/2026-dyb-district-6-tournament](https://dyb.apbaseball.com/news/2026-dyb-district-6-tournament) |
| Vercel project + DNS | **Manual step** — see below |

## Vercel project setup (one-time)

1. In the Vercel dashboard (AP Baseball team), **duplicate the District 2 project** (or Add New → import `TNTEMPLET/gonzales-db-next`).
2. Set environment variables (copy from `district2` production):
   - `SITE_ORG` = **`ladistrict6`** (only value that differs from District 2)
   - `DATABASE_URL` — same shared Postgres as other orgs
   - Copy remaining env vars from District 2 (Blob, etc.)
3. **Domains:** add `district6.apbaseball.com` in Vercel → Domains.
4. **DNS** (wherever `apbaseball.com` is managed): add a CNAME for `district6` pointing to Vercel (same target as `district2` → `9fdc94dce8e78e30.vercel-dns-016.com` or use Vercel’s suggested CNAME).
5. Deploy from `main` (already contains District 6 org config).

After DNS propagates, verify: https://district6.apbaseball.com/tournaments

## Local dev

```bash
pnpm dev:ladistrict6
# or all orgs including District 6 on port 3004:
pnpm dev:all
```

Browse: http://localhost:3004/tournaments

## Seed brackets + Gonzales promo (production DB)

Already run on production (2026-06-14). Re-run anytime to refresh:

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
