import { PrismaClient } from "@prisma/client";
import { PrismaPostgresAdapter } from "@prisma/adapter-ppg";

declare global {
  var prisma: PrismaClient | undefined;
  var prismaSchemaVersion: string | undefined;
}

const PRISMA_SCHEMA_VERSION = "2026-04-20-dugout-pin-fields-v1";

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
  "dugoutNotificationCursor" in cachedDelegates;
const schemaVersionMatches =
  global.prismaSchemaVersion === PRISMA_SCHEMA_VERSION;

const prisma =
  hasRequiredDelegates && schemaVersionMatches ? cached : createClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
  global.prismaSchemaVersion = PRISMA_SCHEMA_VERSION;
}

export default prisma;
