import { PrismaClient } from "@prisma/client";
import { PrismaPostgresAdapter } from "@prisma/adapter-ppg";
import bcrypt from "bcryptjs";

function createClient() {
  const adapter = new PrismaPostgresAdapter({
    connectionString: process.env.DATABASE_URL!,
  });
  return new PrismaClient({ adapter });
}

const prisma = createClient();
const orgId = process.env.SITE_ORG ?? "gonzales";

async function main() {
  const posts = [
    {
      title: "Spring Opening Day Parade Announced",
      slug: "spring-opening-day-parade-announced",
      excerpt:
        "Join us Saturday morning for player introductions and first pitch.",
      content:
        "Opening Day starts at 8:30 AM with team check-in, followed by a parade of teams and first games at 10:00 AM.",
      author: "League Staff",
      status: "PUBLISHED" as const,
      featured: true,
      publishedAt: new Date(),
    },
    {
      title: "Weather Policy And Rainout Alerts",
      slug: "weather-policy-and-rainout-alerts",
      excerpt:
        "How and where weather updates will be posted during the season.",
      content:
        "Rainout updates will be posted to the schedule board and announced through league communication channels as conditions change.",
      author: "Board of Directors",
      status: "PUBLISHED" as const,
      featured: false,
      publishedAt: new Date(),
    },
  ];

  for (const post of posts) {
    await prisma.newsPost.upsert({
      where: {
        organizationId_slug: { organizationId: orgId, slug: post.slug },
      },
      create: {
        organizationId: orgId,
        ...post,
      },
      update: {
        organizationId: orgId,
        title: post.title,
        excerpt: post.excerpt,
        content: post.content,
        author: post.author,
        status: post.status,
        featured: post.featured,
        publishedAt: post.publishedAt,
      },
    });
  }

  console.log(`Seeded ${posts.length} news posts`);

  const dicksName = "DICK'S Sporting Goods";
  const existingDicks = await prisma.sponsor.findFirst({
    where: { businessName: dicksName },
    select: { id: true },
  });
  if (!existingDicks) {
    await prisma.sponsor.create({
      data: {
        businessName: dicksName,
        contactName: "TBD",
        contactEmail: "tbd@example.com",
        contactPhone: "TBD",
        websiteUrl: "https://www.dickssportinggoods.com",
        logoUrl: "/sponsors/dicks-wordmark.svg",
        logoMimeType: "image/svg+xml",
        logoAlt: "DICK'S Sporting Goods",
        notes:
          "Team sponsorship seed. Official retail site: https://www.dickssportinggoods.com — replace placeholder contact fields and optionally upload a higher-resolution logo in admin.",
        isActive: true,
        packageEnrollment: {
          create: {
            packageType: "TEAM_SPONSORSHIPS",
            packageLabel: "Team Sponsorships",
            minimumCommitmentCents: 50_000,
            amountCents: 50_000,
            additionalTeamAmountCents: 45_000,
            twoYearCommitmentAmountCents: null,
            includesWebsiteLogo: true,
            includesSocialRecognition: true,
            includesUniformName: true,
            includesFieldSignage: false,
            includesSeasonScheduleName: false,
            includesAllStarMention: false,
          },
        },
        placements: {
          create: [
            {
              organizationId: "gonzales",
              showInFooterScroller: true,
              sortOrder: 40,
            },
            {
              organizationId: "ascension",
              showInFooterScroller: true,
              sortOrder: 40,
            },
          ],
        },
      },
    });
    console.log(
      "Seeded DICK'S Sporting Goods (team sponsorship, gonzales + ascension)",
    );
  } else {
    console.log("DICK'S Sporting Goods sponsor already present; skip create");
  }

  const bootstrapEmail =
    process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (bootstrapEmail && bootstrapPassword) {
    const passwordHash = await bcrypt.hash(bootstrapPassword, 12);

    await prisma.adminUser.upsert({
      where: { email: bootstrapEmail },
      create: {
        email: bootstrapEmail,
        name: "Site Admin",
        passwordHash,
      },
      update: {
        passwordHash,
      },
    });

    console.log(`Bootstrapped admin: ${bootstrapEmail}`);
  } else {
    console.log(
      "No bootstrap admin created. Use `npm run admin:create -- <email> [password] [name]`.",
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
