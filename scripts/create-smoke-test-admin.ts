/**
 * Creates or resets the dev smoke-test master admin.
 * Usage (dev-box, dev database):
 *   node --env-file=.env.local --env-file=.env.development.local \
 *     pnpm exec tsx scripts/create-smoke-test-admin.ts
 */
import bcrypt from "bcryptjs";
import { PrismaClient, AdminRole } from "@prisma/client";
import { createDatabaseAdapter } from "../lib/databaseAdapter";

export const SMOKE_TEST_ADMIN_EMAIL = "smoke-test@apbaseball.com";
export const SMOKE_TEST_ADMIN_PASSWORD = "SmokeTest-Dev-2026!";

async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      console.log(`attempt ${i} failed, retrying...`);
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw last;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const prisma = new PrismaClient({
    adapter: createDatabaseAdapter(connectionString),
  });

  const passwordHash = await bcrypt.hash(SMOKE_TEST_ADMIN_PASSWORD, 12);

  const admin = await withRetry(() =>
    prisma.adminUser.upsert({
      where: { email: SMOKE_TEST_ADMIN_EMAIL },
      create: {
        email: SMOKE_TEST_ADMIN_EMAIL,
        name: "Smoke Test Admin",
        firstName: "Smoke",
        lastName: "Test",
        role: AdminRole.MASTER_ADMIN,
        isMaster: true,
        passwordHash,
      },
      update: {
        name: "Smoke Test Admin",
        firstName: "Smoke",
        lastName: "Test",
        role: AdminRole.MASTER_ADMIN,
        isMaster: true,
        passwordHash,
      },
    }),
  );

  console.log(`Smoke test admin ready: ${admin.email} (id=${admin.id})`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
