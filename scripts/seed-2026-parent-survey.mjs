import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
// Dev-database override, matching prisma.config.ts's documented priority
// (.env.local holds the PRODUCTION DATABASE_URL; .env.development.local
// overrides it for local/dev work). Without this override step, this
// script would always target production regardless of dev setup.
dotenv.config({ path: ".env.development.local", override: true });
dotenv.config({ path: ".env" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL is not set in environment!");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function seed() {
  console.log(`🌱 Seeding 2026 AP Baseball Parent Survey...`);

  const orgs = ["fallball", "apbaseball"];
  // Same literal slug for both orgs now that Survey's unique key is
  // (organizationId, slug) rather than a global-unique slug column.
  const slug = "2026-parent-survey";

  for (const organizationId of orgs) {
    const targetSlug = slug;

    // Re-seeding: only safe to delete-and-recreate the section/question
    // tree if no real parent responses exist yet. Once responses exist,
    // deleting the survey would cascade-delete every one of them with no
    // recovery path — refuse instead of silently destroying data.
    const existing = await prisma.survey.findFirst({
      where: { organizationId, slug: targetSlug },
      include: { _count: { select: { responses: true } } },
    });

    if (existing) {
      if (existing._count.responses > 0) {
        console.error(
          `❌ Survey [org=${organizationId}, slug=${targetSlug}] already has ${existing._count.responses} response(s). ` +
            `Refusing to delete and recreate it — that would destroy real parent submissions. ` +
            `Update the existing survey/questions manually, or export and archive the responses first.`,
        );
        process.exit(1);
      }
      await prisma.survey.delete({ where: { id: existing.id } });
    }

    const survey = await prisma.survey.create({
      data: {
        organizationId,
        seasonYear: 2026,
        title: "2026 AP Baseball Parent Survey",
        description:
          "Brief season feedback form • Estimated time: 3-5 minutes. Your responses help us improve the experience for players and families. Scale: 1 = Poor, 2 = Fair, 3 = Good, 4 = Very Good, 5 = Excellent.",
        slug: targetSlug,
        isPublished: true,
        isAnonymous: true,
        sections: {
          create: [
            {
              order: 1,
              title: "Section 1: Overall Experience",
              questions: {
                create: [
                  {
                    order: 1,
                    questionText:
                      "1. Overall, how would you rate your family's experience this season?",
                    type: "RATING",
                    isRequired: true,
                    options: ["1 Poor", "2 Fair", "3 Good", "4 Very Good", "5 Excellent"],
                  },
                  {
                    order: 2,
                    questionText:
                      "2. How likely are you to register your child again next season?",
                    type: "LIKERT_CHOICE",
                    isRequired: true,
                    options: [
                      "Very Unlikely",
                      "Unlikely",
                      "Neutral",
                      "Likely",
                      "Very Likely",
                    ],
                  },
                  {
                    order: 3,
                    questionText:
                      "3. How likely are you to recommend our organization to another family?",
                    type: "RATING",
                    isRequired: true,
                    options: ["1 Not Likely", "2", "3", "4", "5 Very Likely"],
                  },
                ],
              },
            },
            {
              order: 2,
              title: "Section 2: Facilities",
              questions: {
                create: [
                  {
                    order: 4,
                    questionText: "4. Please rate the following facility areas:",
                    type: "MATRIX",
                    isRequired: true,
                    matrixTopics: [
                      "Field conditions",
                      "Restrooms",
                      "Concessions",
                      "Parking",
                      "Overall cleanliness",
                    ],
                    options: ["1 Poor", "2 Fair", "3 Good", "4 Very Good", "5 Excellent"],
                  },
                ],
              },
            },
            {
              order: 3,
              title: "Section 3: League Operations",
              questions: {
                create: [
                  {
                    order: 5,
                    questionText: "5. Please rate the following league operations areas:",
                    type: "MATRIX",
                    isRequired: true,
                    matrixTopics: [
                      "Registration process",
                      "Communication from the league",
                      "Scheduling of games",
                      "Organization of events",
                      "Volunteer support",
                    ],
                    options: ["1 Poor", "2 Fair", "3 Good", "4 Very Good", "5 Excellent"],
                  },
                ],
              },
            },
            {
              order: 4,
              title: "Section 4: Coaches & Player Development",
              questions: {
                create: [
                  {
                    order: 6,
                    questionText:
                      "6. Please rate the following coaching and player development areas:",
                    type: "MATRIX",
                    isRequired: true,
                    matrixTopics: [
                      "Coach communication",
                      "Sportsmanship emphasized by coaches",
                      "Player skill development",
                      "Positive team environment",
                    ],
                    options: ["1 Poor", "2 Fair", "3 Good", "4 Very Good", "5 Excellent"],
                  },
                ],
              },
            },
            {
              order: 5,
              title: "Section 5: Umpires",
              questions: {
                create: [
                  {
                    order: 7,
                    questionText: "7. Please rate the following umpire areas:",
                    type: "MATRIX",
                    isRequired: true,
                    matrixTopics: [
                      "Professionalism",
                      "Knowledge of rules",
                      "Consistency of calls",
                      "Overall umpire performance",
                    ],
                    options: ["1 Poor", "2 Fair", "3 Good", "4 Very Good", "5 Excellent"],
                  },
                ],
              },
            },
            {
              order: 6,
              title: "Section 6: Open Feedback",
              questions: {
                create: [
                  {
                    order: 8,
                    questionText: "8. What did the organization do well this season?",
                    type: "TEXT",
                    isRequired: false,
                  },
                  {
                    order: 9,
                    questionText:
                      "9. What is the most important thing we should improve next season?",
                    type: "TEXT",
                    isRequired: false,
                  },
                  {
                    order: 10,
                    questionText:
                      "10. What should be our #1 priority for improvement next season?",
                    type: "SINGLE_CHOICE",
                    isRequired: true,
                    options: [
                      "Facilities",
                      "Communication",
                      "Scheduling",
                      "Umpires",
                      "Player Development",
                      "All-Star Program",
                      "Concessions",
                      "Other",
                    ],
                  },
                ],
              },
            },
            {
              order: 7,
              title: "Optional Section: All-Star Program",
              description:
                "Complete this section only if your player participated in All-Stars after the regular season.",
              questions: {
                create: [
                  {
                    order: 11,
                    questionText: "11. Did your player participate in All-Stars?",
                    type: "CONDITIONAL_GATE",
                    isRequired: false,
                    options: ["Yes", "No"],
                  },
                  {
                    order: 12,
                    questionText: "12. Please rate the following All-Star program areas:",
                    type: "MATRIX",
                    isRequired: false,
                    matrixTopics: [
                      "Selection process transparency",
                      "Communication about All-Stars",
                      "Tournament preparation",
                      "Coaching staff",
                      "Overall All-Star experience",
                    ],
                    options: ["1 Poor", "2 Fair", "3 Good", "4 Very Good", "5 Excellent"],
                  },
                  {
                    order: 13,
                    questionText:
                      "13. Did your player's All-Star experience meet your expectations?",
                    type: "SINGLE_CHOICE",
                    isRequired: false,
                    options: [
                      "Exceeded Expectations",
                      "Met Expectations",
                      "Below Expectations",
                    ],
                  },
                  {
                    order: 14,
                    questionText:
                      "14. What improvements would you suggest for the All-Star program?",
                    type: "TEXT",
                    isRequired: false,
                  },
                ],
              },
            },
            {
              order: 8,
              title: "Optional Information",
              questions: {
                create: [
                  {
                    order: 15,
                    questionText: "15. Division played:",
                    type: "SINGLE_CHOICE",
                    isRequired: false,
                    options: [
                      "3-4TB",
                      "5UTB",
                      "6U Mod TB",
                      "6U CP",
                      "7/8 Majors",
                      "7U CP",
                      "8U CP",
                      "9/10 Majors",
                      "9U DYB",
                      "10U DYB",
                      "11/12 Majors",
                      "12U DYB",
                      "13-15 DBB",
                      "15-17 DBB",
                      "Other",
                    ],
                  },
                ],
              },
            },
          ],
        },
      },
    });

    console.log(`✅ Created survey [${survey.title}] for org=${organizationId} (slug=${survey.slug})`);
  }

  await prisma.$disconnect();
  await pool.end();
}

seed().catch((err) => {
  console.error("❌ Error seeding survey:", err);
  process.exit(1);
});
