import "server-only";

import type { TripFieldDefPublic, TripFieldType, TripPrefillSource } from "@/lib/trip/types";
import {
  SW_REGIONAL_TEMPLATE_KEY,
  SW_REGIONAL_V1_FIELDS,
  tripFieldSection,
} from "@/lib/trip/swRegionalFields";
import prisma from "@/lib/prisma";

export { SW_REGIONAL_TEMPLATE_KEY, SW_REGIONAL_V1_FIELDS };

const SEED_BY_KEY = new Map(SW_REGIONAL_V1_FIELDS.map((f) => [f.key, f]));

export function fieldDefToPublic(row: {
  key: string;
  label: string;
  sheetColumn: string;
  fieldType: string;
  required: boolean;
  optionsJson: string | null;
  sortOrder: number;
  helpText: string | null;
  prefillFrom: string | null;
  adminOnly: boolean;
}): TripFieldDefPublic {
  let options: string[] = [];
  if (row.optionsJson) {
    try {
      const parsed = JSON.parse(row.optionsJson) as unknown;
      if (Array.isArray(parsed)) {
        options = parsed.filter((x): x is string => typeof x === "string");
      }
    } catch {
      options = [];
    }
  }
  const seed = SEED_BY_KEY.get(row.key);
  return {
    key: row.key,
    label: row.label,
    sheetColumn: row.sheetColumn,
    fieldType: row.fieldType as TripFieldType,
    required: row.required,
    options,
    sortOrder: row.sortOrder,
    helpText: row.helpText,
    prefillFrom: (row.prefillFrom as TripPrefillSource | null) ?? null,
    adminOnly: row.adminOnly,
    section: seed?.section ?? tripFieldSection(row.key),
    excludeFromDirectorExport:
      seed?.excludeFromDirectorExport === true ||
      !row.sheetColumn?.trim() ||
      tripFieldSection(row.key) === "health",
  };
}

function seedFieldRows(templateId: string) {
  return SW_REGIONAL_V1_FIELDS.map((f) => ({
    templateId,
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
  }));
}

/**
 * Ensure SW Regional template exists and field defs match the Sheet header map.
 * Re-syncs fields when the seed list changes (by key set / count).
 */
export async function ensureSwRegionalTemplate(opts?: { forceResync?: boolean }) {
  const existing = await prisma.tripFieldTemplate.findUnique({
    where: { key: SW_REGIONAL_TEMPLATE_KEY },
    include: { fields: true },
  });

  const seedKeys = new Set(SW_REGIONAL_V1_FIELDS.map((f) => f.key));
  const needsResync =
    opts?.forceResync ||
    !existing ||
    existing.fields.length === 0 ||
    existing.fields.length !== SW_REGIONAL_V1_FIELDS.length ||
    existing.fields.some((f) => !seedKeys.has(f.key)) ||
    SW_REGIONAL_V1_FIELDS.some((f) => !existing.fields.some((ef) => ef.key === f.key));

  if (existing && !needsResync) {
    return existing;
  }

  if (existing) {
    await prisma.tripFieldDef.deleteMany({ where: { templateId: existing.id } });
    await prisma.tripFieldDef.createMany({ data: seedFieldRows(existing.id) });
    return prisma.tripFieldTemplate.findUniqueOrThrow({
      where: { id: existing.id },
      include: { fields: { orderBy: { sortOrder: "asc" } } },
    });
  }

  return prisma.tripFieldTemplate.create({
    data: {
      key: SW_REGIONAL_TEMPLATE_KEY,
      name: "Southwest Regional travel roster (v1)",
      description:
        "Parent intake: roster columns for tournament director CSV plus optional health for player binder sheets (athletes only; coaches are director-sheet only; health never exported to director CSV).",
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
}
