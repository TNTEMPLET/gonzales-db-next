# Local dev Postgres (stark-lab / dev-box CT 106)

Shared PostgreSQL 15 for all development projects on dev-box.

## Connection

| Item | Value |
|------|--------|
| Host | `127.0.0.1` (from the dev box). From another machine, use `<dev-box LAN IP>`. |
| Port | `5432` |
| User | `devplatform` |
| Password | see password manager / `.env.development.local` |

## Databases

| Database | Project |
|----------|---------|
| `apbaseball_dev` | gonzales-db-next (all four SITE_ORG dev servers) |
| `apbaseball_dev_shadow` | Prisma migrate shadow (gonzales-db-next) |
| `duckroost_dev` | duckroost-digital and future apps |

## Project setup

1. Copy `.env.development.local.example` → `.env.development.local`
2. `.env.local` is a local-only URL file. Vercel uses its own env vars. Preview uses the staging database. Do not store a production URL here.
3. Dev servers and `pnpm prisma migrate dev` use `.env.development.local` automatically

## Workflow

```
Local dev (apbaseball_dev)
  → prisma migrate dev / schema changes
  → verify on dev sites (ports 3000–3003)
  → PR into preview → CI → Trent merges into preview
  → GitHub Action migrate-staging
  → Trent tests staging
  → Trent merges preview into main with a merge commit (never squash)
  → GitHub Action migrate-prod
```

Prod migrations should run before or together with the production deploy. Vercel can mark the `main` deployment Ready before `migrate-prod` is approved, so code that depends on a new schema can break in that window. Keep schema changes backward-compatible (expand, then contract in a later migration), or approve `migrate-prod` before the new code serves traffic.

Never run `migrate dev`, `migrate deploy`, or `db push` against staging or production from a workstation. Those databases are migrated only by `.github/workflows/db-migrate.yml`.

## Refresh dev data from remote Prisma dev

```bash
export $(grep -v '^#' .env.development.local.remote-backup | xargs)  # old prisma.io dev URL
/usr/lib/postgresql/17/bin/pg_dump "$DATABASE_URL" --no-owner --no-acl -Fc -f /tmp/dev.dump
# Password: see password manager / .env.development.local
pg_restore -h 127.0.0.1 -U devplatform -d apbaseball_dev \
  --clean --if-exists --no-owner --no-acl /tmp/dev.dump
```

(`prisma_postgres` extension warnings on restore are safe to ignore.)

## Service management (on dev-box as root via Proxmox)

`arrakis` is the pve1 SSH alias.

```bash
ssh arrakis 'pct exec 106 -- systemctl status postgresql'
```

Installed: `postgresql-15` server, `postgresql-client-17` for pg_dump against Prisma Postgres 17.
