/**
 * Exact-name pre-fill for shared parks. Dry-run unless --apply is passed.
 *
 * Refuses to run unless public._environment has exactly one row, value
 * 'staging' (the marker from scripts/staging/scrub.sql). Production must
 * never carry that marker. This script does not write inside the migration.
 *
 *   pnpm venues:prefill
 *   pnpm venues:prefill -- --apply
 *
 * Node's --env-file does not override an existing DATABASE_URL, so a staging
 * URL passed in the environment is the one that is checked:
 *
 *   DATABASE_URL="$STAGING_DATABASE_URL" pnpm venues:prefill
 *   DATABASE_URL="$STAGING_DATABASE_URL" pnpm venues:prefill -- --apply
 *
 * Exact normalized names become one Venue and get venueId set. Similar names
 * are printed and left for the Parks screen. A non-null venueId is never
 * overwritten. Re-running after a successful apply creates nothing.
 */
import { PrismaClient } from "@prisma/client";

import { createDatabaseAdapter } from "../../lib/databaseAdapter";
import { formatOrganizationIdDisplay } from "../../lib/siteConfig";
import {
  buildVenueMatchPlan,
  summarizeVenueMatchPlan,
  type VenueMatchPark,
  type VenueMatchVenue,
} from "../../lib/venues/match";
import { stagingMarkerRefusal, type StagingMarker } from "../../lib/venues/stagingGuard";

async function main() {
  const apply = process.argv.includes("--apply");
  if (process.argv.includes("--help")) {
    console.log("Usage: pnpm venues:prefill [-- --apply]");
    console.log("Dry-run is the default. --apply writes exact-name venues and links.");
    return;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (!databaseUrl) {
    console.error("refusing to prefill venues: DATABASE_URL is missing");
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: createDatabaseAdapter(databaseUrl) });
  try {
    const marker = await readStagingMarker(prisma);
    const refusal = stagingMarkerRefusal(marker);
    if (refusal) {
      console.error(refusal);
      process.exit(1);
    }

    const venues: VenueMatchVenue[] = await prisma.venue.findMany({
      select: { id: true, name: true, normalizedName: true },
      orderBy: { name: "asc" },
    });
    const parks: VenueMatchPark[] = await prisma.schedulePark.findMany({
      select: {
        id: true,
        organizationId: true,
        name: true,
        shortName: true,
        address: true,
        venueId: true,
      },
      orderBy: [{ organizationId: "asc" }, { name: "asc" }],
    });
    const plan = buildVenueMatchPlan(parks, venues);
    const summary = summarizeVenueMatchPlan(plan);
    const mode = apply ? "apply" : "dry-run";
    console.log(`Venue pre-fill ${mode}`);
    console.log(`venues ${apply ? "created" : "to create"}: ${summary.venuesToCreate}`);
    console.log(`parks ${apply ? "linked" : "to link"}: ${summary.parksToLink}`);
    console.log(`already linked: ${summary.alreadyLinked}`);
    console.log(`unmatched: ${summary.unmatched}`);
    console.log(`suggested (not auto-linked): ${summary.suggested}`);

    const parkById = new Map(parks.map((park) => [park.id, park]));
    for (const create of plan.creates) {
      const names = create.parkIds
        .map((id) => parkById.get(id))
        .filter((park): park is VenueMatchPark => Boolean(park))
        .map((park) => `${formatOrganizationIdDisplay(park.organizationId)} ${park.name}`);
      console.log(`create ${create.name} <- ${names.join("; ") || create.normalizedName}`);
    }
    for (const link of plan.links) {
      const park = parkById.get(link.parkId);
      const venue = venues.find((item) => item.id === link.venueId);
      console.log(
        `link ${park ? `${formatOrganizationIdDisplay(park.organizationId)} ${park.name}` : link.parkId} -> ${venue?.name ?? link.venueId}`,
      );
    }
    for (const suggestion of plan.suggestions) {
      const park = parkById.get(suggestion.parkId);
      console.log(
        `suggest ${park ? `${formatOrganizationIdDisplay(park.organizationId)} ${park.name}` : suggestion.parkId} ~ ${suggestion.label}`,
      );
    }
    for (const parkId of plan.unmatchedParkIds) {
      const park = parkById.get(parkId);
      console.log(
        `unmatched ${park ? `${formatOrganizationIdDisplay(park.organizationId)} "${park.name}"` : parkId}`,
      );
    }

    if (!apply) {
      console.log("Dry run only. Pass --apply to write.");
      return;
    }

    await prisma.$transaction(async (tx) => {
      for (const create of plan.creates) {
        const venue = await tx.venue.create({
          data: {
            name: create.name,
            shortName: create.shortName,
            address: create.address,
            normalizedName: create.normalizedName,
          },
        });
        await tx.schedulePark.updateMany({
          where: { id: { in: create.parkIds }, venueId: null },
          data: { venueId: venue.id },
        });
      }
      for (const link of plan.links) {
        await tx.schedulePark.updateMany({
          where: { id: link.parkId, venueId: null },
          data: { venueId: link.venueId },
        });
      }
    });
    console.log("Applied. Re-run without --apply to confirm the next pass is empty.");
  } finally {
    await prisma.$disconnect();
  }
}

async function readStagingMarker(prisma: PrismaClient): Promise<StagingMarker> {
  const table = await prisma.$queryRaw<Array<{ reg: string | null }>>`
    SELECT to_regclass('public._environment')::text AS reg
  `;
  if (!table[0]?.reg) return "missing";
  const rows = await prisma.$queryRaw<Array<{ value: string | null }>>`
    SELECT value FROM public._environment
  `;
  if (rows.length !== 1) return "multiple";
  return rows[0]?.value ?? null;
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : "Venue pre-fill failed";
  console.error(message);
  process.exit(1);
});
