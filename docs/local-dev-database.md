# Local dev Postgres (stark-lab / dev-box CT 106)

Shared PostgreSQL 15 for all development projects on dev-box.

## Connection

| Item | Value |
|------|--------|
| Host | `127.0.0.1` (from dev-box) or `192.168.100.156` (LAN, if enabled) |
| Port | `5432` |
| User | `devplatform` |
| Password | `devplatform-local-2026` (change via `ALTER USER` if needed) |

## Databases

| Database | Project |
|----------|---------|
| `apbaseball_dev` | gonzales-db-next (all four SITE_ORG dev servers) |
| `apbaseball_dev_shadow` | Prisma migrate shadow (gonzales-db-next) |
| `duckroost_dev` | duckroost-digital and future apps |

## Project setup

1. Copy `.env.development.local.example` → `.env.development.local`
2. Keep production `DATABASE_URL` in `.env.local` (Prisma Postgres / prod gateway)
3. Dev servers and `pnpm prisma migrate dev` use `.env.development.local` automatically

## Workflow

```
Local dev (apbaseball_dev)
  → prisma migrate dev / schema changes
  → verify on dev sites (ports 3000–3003)
  → promote to production:

DATABASE_URL="<prod-url-from-env.local>" pnpm prisma migrate deploy
```

Never run `migrate dev` or `db push` with production `DATABASE_URL` loaded.

## Refresh dev data from remote Prisma dev

```bash
export $(grep -v '^#' .env.development.local.remote-backup | xargs)  # old prisma.io dev URL
/usr/lib/postgresql/17/bin/pg_dump "$DATABASE_URL" --no-owner --no-acl -Fc -f /tmp/dev.dump
PGPASSWORD=devplatform-local-2026 pg_restore -h 127.0.0.1 -U devplatform -d apbaseball_dev \
  --clean --if-exists --no-owner --no-acl /tmp/dev.dump
```

(`prisma_postgres` extension warnings on restore are safe to ignore.)

## Service management (on dev-box as root via Proxmox)

```bash
ssh arrakis 'pct exec 106 -- systemctl status postgresql'
```

Installed: `postgresql-15` server, `postgresql-client-17` for pg_dump against Prisma Postgres 17.
