/**
 * One-time script: insert a rainout alert for both orgs expiring at midnight tonight.
 * Run after `prisma db push` or `prisma migrate deploy` has applied the OrgAlert table.
 *
 *   node --env-file=.env.local scripts/seed-tonight-rainout.mjs
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPostgresAdapter } from "@prisma/adapter-ppg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Run with: node --env-file=.env.local scripts/seed-tonight-rainout.mjs");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPostgresAdapter({ connectionString: databaseUrl }),
});

// Midnight tonight (local midnight = 05:00 UTC in CDT / UTC-5)
const midnight = new Date();
midnight.setHours(23, 59, 0, 0);
// Convert to proper end-of-day: set to next day 00:00 local = 05:00 UTC
const expiresAt = new Date(midnight.getFullYear(), midnight.getMonth(), midnight.getDate() + 1, 0, 0, 0, 0);

try {
  for (const org of ["gonzales", "ascension"]) {
    const alert = await prisma.orgAlert.create({
      data: {
        organizationId: org,
        allParksOut: true,
        venues: [],
        expiresAt,
      },
    });
    console.log(`Created alert for ${org}: expires ${expiresAt.toISOString()} (id: ${alert.id})`);
  }
  console.log("Done.");
} finally {
  await prisma.$disconnect();
}
