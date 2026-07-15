import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaPostgresAdapter } from "@prisma/adapter-ppg";
import pg from "pg";

/**
 * Dual adapters are intentional (Phase 8):
 * - `@prisma/adapter-ppg` — Prisma-hosted Postgres gateway (`db.prisma.io` / prod)
 * - `@prisma/adapter-pg` — local / standard Postgres (dev-box `127.0.0.1`)
 *
 * Do not remove either without confirming both connection shapes still work.
 */
/** Prisma Postgres hosted gateway (production / remote dev on db.prisma.io). */
export function isPrismaHostedPostgres(connectionString: string) {
  return /db\.prisma\.io|prisma-data\.net/i.test(connectionString);
}

/** Local Postgres on dev-box, or Prisma Postgres gateway in prod. */
export function createDatabaseAdapter(connectionString: string) {
  if (isPrismaHostedPostgres(connectionString)) {
    return new PrismaPostgresAdapter({ connectionString });
  }
  return new PrismaPg(new pg.Pool({ connectionString }));
}
