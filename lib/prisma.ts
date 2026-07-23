import "server-only";

import { PrismaClient } from "@prisma/client";

import { createDatabaseAdapter } from "@/lib/databaseAdapter";

declare global {
  var prisma: PrismaClient | undefined;
  var prismaSchemaVersion: string | undefined;
}

/** Bump when Prisma schema/models change so dev HMR does not reuse a stale PrismaClient. */
const PRISMA_SCHEMA_VERSION = "2026-07-23-merch-draft-paypal-order-v1";

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
  "dugoutComment" in cachedDelegates &&
  "dugoutNotificationCursor" in cachedDelegates &&
  "allStarVaultAccess" in cachedDelegates &&
  "bracketProject" in cachedDelegates &&
  "tournamentRosterIntakeLink" in cachedDelegates &&
  "coachingInterestSubmission" in cachedDelegates &&
  "scheduleSeason" in cachedDelegates &&
  "scheduleDraftGame" in cachedDelegates &&
  "scheduleExportBatch" in cachedDelegates &&
  "tournamentIncomeTransaction" in cachedDelegates &&
  "gameChangerScoreboardConnection" in cachedDelegates &&
  "orgAlert" in cachedDelegates;
const schemaVersionMatches =
  global.prismaSchemaVersion === PRISMA_SCHEMA_VERSION;

const prisma =
  hasRequiredDelegates && schemaVersionMatches ? cached : createClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
  global.prismaSchemaVersion = PRISMA_SCHEMA_VERSION;
}

export default prisma;
