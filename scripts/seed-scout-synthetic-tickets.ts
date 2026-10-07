/**
 * Load synthetic Scout tickets into the local dev database.
 *
 *   pnpm seed:scout-synthetic
 *
 * Refuses production and hosted database URLs. Does not read a mailbox.
 */
import { PrismaClient } from "@prisma/client";

import { createDatabaseAdapter } from "../lib/databaseAdapter";
import { scoutSyntheticSeedBlockReason } from "../lib/scout/seedGuard";
import { seedSyntheticScoutTickets } from "../lib/scout/syntheticSeed";

async function main() {
  const blocked = scoutSyntheticSeedBlockReason(process.env, "script");
  if (blocked) {
    console.error(blocked);
    process.exit(1);
  }

  const prisma = new PrismaClient({
    adapter: createDatabaseAdapter(process.env.DATABASE_URL!),
  });
  try {
    const result = await seedSyntheticScoutTickets(prisma);
    console.log(`Scout sample tickets ready (${result.upserted}).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "Seed failed");
  process.exit(1);
});
