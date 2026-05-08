# Demo environments (isolated from production)

This project now supports three isolated demo repos:

- `TNTEMPLET/apbaseball-demo-admin`
- `TNTEMPLET/apbaseball-demo-dyb`
- `TNTEMPLET/apbaseball-demo-llb`

## Sync model

- Source of truth for code: `TNTEMPLET/gonzales-db-next` (`main`)
- Automatic code sync to demo repos: `.github/workflows/sync-demo-repos.yml`
- **Secrets** (one per demo repo — GitHub **Deploy keys** with write access): `DEMO_SYNC_SSH_KEY_ADMIN`, `DEMO_SYNC_SSH_KEY_DYB`, `DEMO_SYNC_SSH_KEY_LLB`. Omit any secret to skip that mirror; other demos still sync.

This keeps frontend/backend code current in demo while allowing each demo deployment to use a separate database and environment values.

## Production sites vs demo (same app, different Vercel projects)

Production org sites (`gonzales-db-next`, `apbaseball-admin`, `apbaseball-llb`) can all point at **this** GitHub repo with **Production branch `main`**. Demo repos above are **separate** GitHub repos; they only affect `apbaseball-demo-*` Vercel projects.

If **only one** production project rebuilds on a `main` push while others stay stale, that is a **Vercel ↔ GitHub** integration quirk (Hobby limits or webhook fan-out), not the demo sync workflow. Try on each stuck project: **Settings → Git → Disconnect**, then **Connect** the same repo again, confirm **Production Branch** is `main`. Demo mirroring does not replace production Git builds for admin/LLB.

## Vercel project mapping

Create three Vercel projects and connect each to its demo repo:

- `apbaseball-demo-admin`  -> repo `apbaseball-demo-admin`
- `apbaseball-demo-dyb`    -> repo `apbaseball-demo-dyb`
- `apbaseball-demo-llb`    -> repo `apbaseball-demo-llb`

Set project environment variables:

- Admin demo: `SITE_ORG=master`
- DYB demo: `SITE_ORG=gonzales`
- LLB demo: `SITE_ORG=ascension`

## Database isolation

Each Vercel demo project must use demo-only DB credentials:

- `DATABASE_URL`
- `DIRECT_DATABASE_URL` (if used)
- any auth/session/secret keys that should not share production values

Never reuse production `DATABASE_URL` in demo.

## Suggested demo domains

- `demo-admin.apbaseball.com`
- `demo-dyb.apbaseball.com`
- `demo-llb.apbaseball.com`

Add these in each Vercel project under **Settings -> Domains**, then add CNAME records in DNS pointing to `cname.vercel-dns.com`.

## First-time demo DB bootstrap

Run once per demo project (using demo env values):

```bash
npm run prisma:deploy
npm run prisma:seed
```

Then use curated seed/demo data only.
