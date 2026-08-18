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
export function createDatabaseAdapter(connectionString: string) {
  return new PrismaPg(new pg.Pool({ connectionString }));
}
