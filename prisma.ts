import "server-only";

import { PrismaClient } from "@prisma/client";

import { createDatabaseAdapter } from "@/lib/databaseAdapter";

declare global {
  var prisma: PrismaClient | undefined;
  var prismaSchemaVersion: string | undefined;
}

/** Bump when Prisma schema/models change so dev HMR does not reuse a stale PrismaClient. */
const PRISMA_SCHEMA_VERSION = "2026-08-28-draft-leader-v1";

function createClient() {
  const connectionString = process.env.DATABASE_URL!;
  return new PrismaClient({ adapter: createDatabaseAdapter(connectionString) });
}

const cached = global.prisma;
const cachedDelegates = cached as unknown as
  | Record<string, unknown>
  | undefined;
const hasRequiredDelegates =
  !!cached &&
  !!cachedDelegates &&
  "adminUser" in cachedDelegates &&
  "draftSession" in cachedDelegates &&
  "draftTeam" in cachedDelegates &&
  "draftPlayerPool" in cachedDelegates &&
  "draftPick" in cachedDelegates &&
  "coachPlayerProtection" in cachedDelegates;
const schemaVersionMatches =
  global.prismaSchemaVersion === PRISMA_SCHEMA_VERSION;

const prisma =
  hasRequiredDelegates && schemaVersionMatches ? cached : createClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
  global.prismaSchemaVersion = PRISMA_SCHEMA_VERSION;
}

export { prisma };
export default prisma;
