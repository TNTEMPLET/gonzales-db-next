/**
 * Ensure SW Regional trip template + optional Ascension starter event.
 *
 * Usage:
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-sw-regional-trip.ts
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-sw-regional-trip.ts --create-event
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/seed-sw-regional-trip.ts --create-event --org=ascension
 */
import { PrismaClient } from "@prisma/client";
import { createDatabaseAdapter } from "../lib/databaseAdapter";
import {
  SW_REGIONAL_TEMPLATE_KEY,
  SW_REGIONAL_V1_FIELDS,
} from "../lib/trip/swRegionalFields";

const SHEET_ID = "1g4gKH_m_SVip4wI3uBzeZwIt6PVMmIu72qmj80xH7R0";
const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}`;

async function main() {
  const args = process.argv.slice(2);
  const createEvent = args.includes("--create-event");
  const orgArg = args.find((a) => a.startsWith("--org="));
  const organizationId = orgArg?.split("=")[1]?.trim() || "ascension";
  const force = args.includes("--force-resync");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const prisma = new PrismaClient({
    adapter: createDatabaseAdapter(connectionString),
  });

  try {
    let template = await prisma.tripFieldTemplate.findUnique({
      where: { key: SW_REGIONAL_TEMPLATE_KEY },
      include: { fields: true },
    });

    const seedKeys = new Set(SW_REGIONAL_V1_FIELDS.map((f) => f.key));
    const needsResync =
      force ||
      !template ||
      template.fields.length === 0 ||
      template.fields.length !== SW_REGIONAL_V1_FIELDS.length ||
      template.fields.some((f) => !seedKeys.has(f.key)) ||
      SW_REGIONAL_V1_FIELDS.some((f) => !template!.fields.some((ef) => ef.key === f.key));

    if (!template) {
      template = await prisma.tripFieldTemplate.create({
        data: {
          key: SW_REGIONAL_TEMPLATE_KEY,
          name: "Southwest Regional travel roster (v1)",
          description:
            "Parent intake matching the multi-league All-Star travel Google Sheet headers.",
          fields: {
            create: SW_REGIONAL_V1_FIELDS.map((f) => ({
              key: f.key,
              label: f.label,
              sheetColumn: f.sheetColumn,
              fieldType: f.fieldType,
              required: f.required ?? false,
              optionsJson: f.options ? JSON.stringify(f.options) : null,
              sortOrder: f.sortOrder,
              helpText: f.helpText ?? null,
              prefillFrom: f.prefillFrom ?? null,
              adminOnly: f.adminOnly ?? false,
            })),
          },
        },
        include: { fields: { orderBy: { sortOrder: "asc" } } },
      });
      console.log(`Created template ${template.key} id=${template.id}`);
    } else if (needsResync) {
      await prisma.tripFieldDef.deleteMany({ where: { templateId: template.id } });
      await prisma.tripFieldDef.createMany({
        data: SW_REGIONAL_V1_FIELDS.map((f) => ({
          templateId: template!.id,
          key: f.key,
          label: f.label,
          sheetColumn: f.sheetColumn,
          fieldType: f.fieldType,
          required: f.required ?? false,
          optionsJson: f.options ? JSON.stringify(f.options) : null,
          sortOrder: f.sortOrder,
          helpText: f.helpText ?? null,
          prefillFrom: f.prefillFrom ?? null,
          adminOnly: f.adminOnly ?? false,
        })),
      });
      template = await prisma.tripFieldTemplate.findUniqueOrThrow({
        where: { id: template.id },
        include: { fields: { orderBy: { sortOrder: "asc" } } },
      });
      console.log(`Resynced template ${template.key} fields=${template.fields.length}`);
    } else {
      console.log(
        `Template ${template.key} already up to date (fields=${template.fields.length})`,
      );
    }

    const full = await prisma.tripFieldTemplate.findUniqueOrThrow({
      where: { id: template.id },
      include: { fields: { orderBy: { sortOrder: "asc" } } },
    });
    console.log("Sheet columns:");
    for (const f of full.fields) {
      console.log(
        `  ${f.sortOrder.toString().padStart(3)}  ${f.sheetColumn}  (${f.key})`,
      );
    }

    if (!createEvent) {
      console.log("Done (pass --create-event to seed Ascension SW Regional event).");
      return;
    }

    const existing = await prisma.tripEvent.findFirst({
      where: {
        organizationId,
        name: { contains: "SW Regional", mode: "insensitive" },
      },
    });
    if (existing) {
      console.log(
        `Event already exists: ${existing.id} (${existing.name}) status=${existing.status}`,
      );
      return;
    }

    const event = await prisma.tripEvent.create({
      data: {
        organizationId,
        templateId: full.id,
        name: "SW Regional 2026 — Ascension",
        teamLabel: "All-Stars",
        status: "draft",
        googleSheetId: SHEET_ID,
        googleSheetUrl: SHEET_URL,
        introMarkdown:
          "Please complete this travel roster form for Southwest Regional. Fields match the multi-league registration sheet.",
      },
    });
    console.log(`Created event ${event.id} for org=${organizationId} (status=draft)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
