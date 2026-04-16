import { PrismaClient } from "@prisma/client";

import { createSqliteAdapter } from "@/lib/prismaAdapter";

declare global {
  var prisma: PrismaClient | undefined;
}

function createClient() {
  return new PrismaClient({ adapter: createSqliteAdapter() });
}

const cached = global.prisma;
const hasAdminDelegates =
  cached && "adminUser" in (cached as unknown as Record<string, unknown>);

const prisma = hasAdminDelegates ? cached : createClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

export default prisma;
