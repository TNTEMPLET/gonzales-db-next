import { PrismaClient } from "@prisma/client";
import { PrismaPostgresAdapter } from "@prisma/adapter-ppg";

declare global {
  var prisma: PrismaClient | undefined;
}

function createClient() {
  const adapter = new PrismaPostgresAdapter({
    connectionString: process.env.DATABASE_URL!,
  });
  return new PrismaClient({ adapter });
}

const cached = global.prisma;
const hasAdminDelegates =
  cached && "adminUser" in (cached as unknown as Record<string, unknown>);

const prisma = hasAdminDelegates ? cached : createClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

export default prisma;
