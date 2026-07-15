/**
 * One-time / safe-to-rerun: copy RegisteredUser legacy AAT columns onto
 * VolunteerRequirementStatus when the volunteer row has no document yet.
 *
 * Usage (DEV by default via prisma.config / env load):
 *   pnpm exec tsx --env-file=.env.local --env-file=.env.development.local \
 *     scripts/backfill-volunteer-aat-from-users.ts
 *
 * Options:
 *   --org=gonzales|ascension|fallball   limit to one org
 *   --dry-run                           report only
 */
import prisma from "../lib/prisma";
import { getSeasonConfigForOrg } from "../lib/seasonConfig";
import type { ContentOrgId } from "../lib/siteConfig";
import { ensureVolunteerProfile } from "../lib/volunteers/service";

const CONTENT_ORGS: ContentOrgId[] = ["gonzales", "ascension", "fallball"];

function parseArgs(argv: string[]) {
  let org: ContentOrgId | null = null;
  let dryRun = false;
  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    if (arg.startsWith("--org=")) {
      const value = arg.slice("--org=".length) as ContentOrgId;
      if (CONTENT_ORGS.includes(value)) org = value;
    }
  }
  return { org, dryRun };
}

async function main() {
  const { org, dryRun } = parseArgs(process.argv.slice(2));
  const orgs = org ? [org] : CONTENT_ORGS;

  let scanned = 0;
  let hydrated = 0;
  let skipped = 0;

  for (const organizationId of orgs) {
    const seasonYear = getSeasonConfigForOrg(organizationId).year;
    const users = await prisma.registeredUser.findMany({
      where: {
        organizationId,
        abuseAwarenessTrainingCertificateUrl: { not: null },
      },
      select: {
        id: true,
        email: true,
        abuseAwarenessTrainingCertificateUrl: true,
        abuseAwarenessTrainingCertificateFileName: true,
        abuseAwarenessTrainingCertificateMimeType: true,
        abuseAwarenessTrainingCertificateUploadedAt: true,
      },
    });

    for (const user of users) {
      scanned += 1;
      if (!user.abuseAwarenessTrainingCertificateUrl) {
        skipped += 1;
        continue;
      }

      if (dryRun) {
        console.log(
          `[dry-run] would hydrate ${organizationId} ${user.email} season=${seasonYear}`,
        );
        hydrated += 1;
        continue;
      }

      const profile = await ensureVolunteerProfile({
        organizationId,
        registeredUserId: user.id,
        seasonYear,
      });
      // ensureVolunteerProfile already calls hydrateAatFromLegacyUser
      void profile;
      hydrated += 1;
    }
  }

  console.log(
    JSON.stringify(
      { scanned, hydrated, skipped, dryRun, orgs },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => null);
  });
