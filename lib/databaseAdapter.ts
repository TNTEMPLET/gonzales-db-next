import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

/**
 * `@prisma/adapter-ppg` (PrismaPostgresAdapter) was previously used for the
 * hosted Prisma Postgres gateway (db.prisma.io / prisma-data.net), but it
 * throws `TypeError: e.map is not a function` on any model with a native
 * Postgres array column (String[] — e.g. SurveyQuestion.matrixTopics,
 * .options). Verified directly against the production database: the ppg
 * adapter fails on that query, and PrismaPg + pg.Pool succeeds against the
 * exact same host/data. Standard pg.Pool connects to db.prisma.io fine (the
 * seed scripts have done so directly all along), so there's no connectivity
 * reason to keep the ppg-specific path — just use one adapter for every
 * PostgreSQL connection string.
 */
/**
 * `max: 1` caps how many connections a single pool (one per warm serverless
 * instance) can open. node-postgres defaults to 10, and with 6 deployments
 * all sharing one Postgres role's connection limit, a burst of concurrent
 * instances at the cap can exhaust it outright — this took the site down on
 * 2026-08-28 ("too many connections for role 'prisma_migration'") and again
 * on 2026-08-31 under live-draft-night traffic, both times at `max: 3`.
 * Lower is safer for a shared, capacity-limited role; raise only alongside a
 * verified higher connection limit on the database itself.
 */
export function createDatabaseAdapter(connectionString: string) {
  return new PrismaPg(new pg.Pool({ connectionString, max: 1 }));
}
