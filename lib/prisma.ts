import { PrismaClient } from "@prisma/client";
import { PrismaPostgresAdapter } from "@prisma/adapter-ppg";

declare global {
  var prisma: PrismaClient | undefined;
  var prismaSchemaVersion: string | undefined;
}

/** Bump when Prisma schema/models change so dev HMR does not reuse a stale PrismaClient. */
const PRISMA_SCHEMA_VERSION = "2026-05-08-all-star-vault-limited-admin-v1";

function createClient() {
  const adapter = new PrismaPostgresAdapter({
    connectionString: process.env.DATABASE_URL!,
  });
  return new PrismaClient({ adapter });
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
  "allStarVaultAccess" in cachedDelegates;
const schemaVersionMatches =
  global.prismaSchemaVersion === PRISMA_SCHEMA_VERSION;

const prisma =
  hasRequiredDelegates && schemaVersionMatches ? cached : createClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
  global.prismaSchemaVersion = PRISMA_SCHEMA_VERSION;
}

export default prisma;
