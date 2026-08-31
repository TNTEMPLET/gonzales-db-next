import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";

import { normalizeAgeGroup } from "@/lib/ageGroupAliases";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";
import { matchStandardDivision } from "@/lib/sportsConnect/fallballDivisions";

export type CsvRow = Record<string, string | number | boolean | null | undefined>;
export type UpdatedUserSnapshot = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  contactPhone: string | null;
  ageGroup: string | null;
  assignedTeam: string | null;
  isCoach: boolean;
  jerseySize: string | null;
};

export type AutoCoachAssignmentSnapshot = {
  teamId: string;
  registeredUserId: string;
};

export function emptyUndoPayload() {
  return {
    createdUserIds: [] as string[],
    updatedUsers: [] as UpdatedUserSnapshot[],
    createdCoachAssignments: [] as AutoCoachAssignmentSnapshot[],
  };
}

export function getRowValue(row: CsvRow, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      return String(row[key]).trim();
    }
  }
  return "";
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function shouldImportAsCoach(roleValue: string) {
  const normalized = roleValue.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.includes("not coaches")) return false;
  return normalized.includes("coach");
}

export function parseCoachAssignmentRole(
  roleValue: string,
): "HEAD_COACH" | "ASSISTANT_COACH" {
  const normalized = roleValue.trim().toLowerCase();
  if (!normalized) return "ASSISTANT_COACH";
  if (normalized.includes("head")) return "HEAD_COACH";
  return "ASSISTANT_COACH";
}

export function selectPreferredContactPhone(row: CsvRow) {
  const preferred = getRowValue(row, [
    "contact_phone",
    "Contact Phone",
    "CONTACT_PHONE",
    "phone",
    "Phone",
    "PHONE",
    "Volunteer Cellphone",
    "Volunteer Telephone",
    "Volunteer Other Phone",
  ]);
  return preferred || null;
}

export function parseAgeGroupMappings(
  value: FormDataEntryValue | null,
): Map<string, string> {
  if (typeof value !== "string" || !value.trim()) return new Map();

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const mapping = new Map<string, string>();
    for (const [rawKey, rawTarget] of Object.entries(parsed)) {
      const key = rawKey.trim().toLowerCase();
      const target =
        typeof rawTarget === "string" ? rawTarget.trim() : String(rawTarget || "").trim();
      if (!key || !target) continue;
      mapping.set(key, target);
    }
    return mapping;
  } catch {
    return new Map();
  }
}

function normalizeTeamToken(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeTeamValue(value: string) {
  return normalizeTeamToken(value)
    .split(" ")
    .filter(Boolean)
    .filter(
      (token) =>
        ![
          "the",
          "ll",
          "dyb",
          "baseball",
          "team",
          "coaches",
          "coach",
          "inc",
          "llc",
        ].includes(token),
    );
}

function pickTeamMatch(
  importedTeamName: string,
  candidates: Array<{
    id: string;
    teamName: string;
    ageGroup: string;
    seasonYear: number;
  }>,
) {
  const importedNormalized = normalizeTeamToken(importedTeamName);
  const importedTokens = new Set(tokenizeTeamValue(importedTeamName));
  if (importedTokens.size === 0) return null;

  let best: { id: string; score: number } | null = null;
  for (const candidate of candidates) {
    const candidateNormalized = normalizeTeamToken(candidate.teamName);
    if (candidateNormalized === importedNormalized) {
      return candidate.id;
    }
    const candidateTokens = tokenizeTeamValue(candidate.teamName);
    if (candidateTokens.length === 0) continue;
    let overlap = 0;
    for (const token of candidateTokens) {
      if (importedTokens.has(token)) overlap += 1;
    }
    const score = overlap / Math.max(importedTokens.size, candidateTokens.length);
    if (!best || score > best.score) {
      best = { id: candidate.id, score };
    }
  }

  if (!best || best.score < 0.45) return null;
  return best.id;
}

export async function resolveTeamForAutoAssignment(params: {
  organizationId: string;
  assignedTeam: string | null;
  ageGroup: string | null;
}) {
  const { organizationId, assignedTeam, ageGroup } = params;
  const normalizedTeam = assignedTeam?.trim();
  if (!normalizedTeam) return null;
  const allCandidates = await prisma.team.findMany({
    where: {
      organizationId,
    },
    select: {
      id: true,
      teamName: true,
      ageGroup: true,
      seasonYear: true,
    },
    orderBy: [{ seasonYear: "desc" }],
  });
  if (allCandidates.length === 0) return null;

  const matchedTeamId = pickTeamMatch(normalizedTeam, allCandidates);
  if (!matchedTeamId) return null;

  const candidates = allCandidates.filter((team) => team.id === matchedTeamId);
  if (candidates.length === 0) return null;
  if (ageGroup?.trim()) {
    const normalizedAgeGroup = ageGroup.trim().toLowerCase();
    const matched = allCandidates.find(
      (team) =>
        team.id === matchedTeamId &&
        team.ageGroup.trim().toLowerCase() === normalizedAgeGroup,
    );
    if (matched) return matched;
  }
  return candidates[0] || null;
}

/**
 * Row-processing loop against an already-created, RUNNING CoachImportBatch.
 * Extracted from POST so both the legacy single-file coach import modal and
 * the Smart Auto-Build confirm route (app/api/admin/teams/smart-build/confirm)
 * call one implementation instead of drifting apart — see
 * review-fallball-coaches.md bug #1 for what happens when a second copy of
 * this exact loop is missing a check (there, the coach-role filter) the
 * first one had.
 */
export async function applyCoachImportRows(params: {
  rows: CsvRow[];
  targetOrg: string;
  batchId: string;
  ageGroupMappings: Map<string, string>;
  autoAssignToTeams: boolean;
}) {
  const { rows, targetOrg, batchId, ageGroupMappings, autoAssignToTeams } = params;

  let processed = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let autoAssigned = 0;
  let autoRoleUpdated = 0;
  let autoAssignAttempts = 0;
  let preservedCoachAssignments = 0;
  const unmatchedTeamNames = new Set<string>();
  const createdUserIds: string[] = [];
  const updatedUsersBeforeImport: UpdatedUserSnapshot[] = [];
  const createdCoachAssignments: AutoCoachAssignmentSnapshot[] = [];

  for (const row of rows) {
    processed += 1;

    const email = getRowValue(row, [
      "email",
      "Email",
      "EMAIL",
      "Volunteer Email Address",
    ]);
    if (!email || !isValidEmail(email)) {
      skipped += 1;
      if (processed % 10 === 0) {
        await prisma.coachImportBatch.update({
          where: { id: batchId },
          data: {
            processedCount: processed,
            createdCount: created,
            updatedCount: updated,
            skippedCount: skipped,
          },
        });
      }
      continue;
    }

    const volunteerRole = getRowValue(row, [
      "Volunteer Role",
      "role",
      "Role",
      "ROLE",
    ]);
    if (!shouldImportAsCoach(volunteerRole)) {
      skipped += 1;
      if (processed % 10 === 0) {
        await prisma.coachImportBatch.update({
          where: { id: batchId },
          data: {
            processedCount: processed,
            createdCount: created,
            updatedCount: updated,
            skippedCount: skipped,
          },
        });
      }
      continue;
    }
    const assignmentRole = parseCoachAssignmentRole(volunteerRole);

    const normalizedEmail = email.toLowerCase();
    const firstName =
      getRowValue(row, [
        "first_name",
        "First Name",
        "firstName",
        "FIRST_NAME",
        "Volunteer First Name",
      ]) ||
      null;
    const lastName =
      getRowValue(row, [
        "last_name",
        "Last Name",
        "lastName",
        "LAST_NAME",
        "Volunteer Last Name",
      ]) ||
      null;
    const name = [firstName, lastName].filter(Boolean).join(" ") || null;
    const rawAgeGroup = getRowValue(row, [
      "age_group",
      "Age Group",
      "ageGroup",
      "AGE_GROUP",
      "Division Name",
    ]);
    const mappedAgeGroup = ageGroupMappings.get(rawAgeGroup.trim().toLowerCase());
    // Fall Ball standardizes on 10 short codes (4U TB ... 17U) regardless of
    // how SportsConnect spells the division that row — checked before the
    // Assignr-oriented normalizeAgeGroup() fallback, which is for
    // gonzales/ascension's own alias vocabulary and is a no-op on Fall Ball
    // division text anyway.
    const standardizedAgeGroup =
      targetOrg === "fallball" ? matchStandardDivision(rawAgeGroup) : null;
    const ageGroup = mappedAgeGroup || standardizedAgeGroup || normalizeAgeGroup(rawAgeGroup);
    const assignedTeam =
      getRowValue(row, [
        "assigned_team",
        "Assigned Team",
        "assignedTeam",
        "ASSIGNED_TEAM",
        "Team Name",
      ]) ||
      null;
    const contactPhone = selectPreferredContactPhone(row);
    const jerseySize =
      getRowValue(row, [
        "What is your jersey size? (All Positions)",
        "What is the coaches jersey size?",
        "What is the coach's jersey size?",
        "What is the volunteer's jersey size?",
        "What is the players jersey size?",
        "Jersey Size",
        "Shirt Size",
        "Uniform Size",
      ]) || null;

    // Global identity lookup, matched by email alone (not scoped to this
    // org) — a person already known from another org, or from an earlier
    // row in this same file, must get a new org profile attached to their
    // existing identity, not a second global identity. The previous version
    // only reused `existing` when it ALSO already had a profile for this
    // org, so a coach known from another org (or re-imported after their
    // fallball profile momentarily lagged behind) fell into the "create a
    // brand-new person" branch every time — this is what fragmented single
    // volunteers into a dozen-plus rows across repeated fallball imports.
    let existing = await prisma.registeredUser.findFirst({
      where: { email: normalizedEmail },
    });
    let justCreatedUser = false;
    if (!existing) {
      try {
        existing = await prisma.registeredUser.create({
          data: { email: normalizedEmail, firstName, lastName, name, contactPhone },
        });
        justCreatedUser = true;
      } catch (e) {
        // Two rows for a brand-new email racing each other can both miss the
        // findFirst above; the unique constraint on `email` turns the loser
        // into a clean conflict here instead of a duplicate row.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          existing = await prisma.registeredUser.findFirstOrThrow({
            where: { email: normalizedEmail },
          });
        } else {
          throw e;
        }
      }
    }

    const profile = await (prisma as any).registeredUserOrgProfile.findUnique({
      where: {
        registeredUserId_organizationId: { registeredUserId: existing.id, organizationId: targetOrg },
      },
    });

    if (!justCreatedUser) {
      updatedUsersBeforeImport.push({
        id: existing.id,
        firstName: existing.firstName,
        lastName: existing.lastName,
        name: existing.name,
        contactPhone: existing.contactPhone,
        ageGroup: profile?.ageGroup ?? null,
        assignedTeam: profile?.assignedTeam ?? null,
        isCoach: profile?.isCoach ?? false,
        jerseySize: profile?.jerseySize ?? null,
      });
      await prisma.registeredUser.update({
        where: { id: existing.id },
        data: { firstName, lastName, name, contactPhone },
      });
    }
    await (prisma as any).registeredUserOrgProfile.upsert({
      where: {
        registeredUserId_organizationId: { registeredUserId: existing.id, organizationId: targetOrg },
      },
      create: {
        registeredUserId: existing.id,
        organizationId: targetOrg,
        isCoach: true,
        ageGroup,
        assignedTeam,
        jerseySize,
      },
      update: {
        ageGroup,
        assignedTeam,
        isCoach: true,
        // Only overwrite when the row actually has a size — most coach
        // exports won't carry this column at all, and a blank shouldn't
        // erase a size captured from an earlier import that did.
        ...(jerseySize ? { jerseySize } : {}),
      },
    });
    if (autoAssignToTeams) {
      if (assignedTeam?.trim()) autoAssignAttempts += 1;
      const targetTeam = await resolveTeamForAutoAssignment({
        organizationId: targetOrg,
        assignedTeam,
        ageGroup,
      });
      if (!targetTeam && assignedTeam?.trim()) {
        unmatchedTeamNames.add(assignedTeam.trim());
      }
      if (targetTeam) {
        // SportsConnect has no concept of an internal draft: for a division
        // still mid-draft, its own export always says "Unallocated" for
        // every coach's team, even one who already has a real HEAD_COACH/
        // ASSISTANT_COACH assignment from the draft (see
        // lib/draft/syncDraftTeamRealization.ts). Don't let a routine
        // re-import undo that -- only skip the move when it would demote a
        // real assignment back to the placeholder; moving between two real
        // teams, or landing on Unallocated when there's no existing real
        // assignment yet, is unaffected.
        const isTargetUnallocated = targetTeam.teamName.trim().toLowerCase() === "unallocated";
        const existingDivisionAssignments = isTargetUnallocated
          ? await prisma.teamCoachAssignment.findMany({
              where: {
                registeredUserId: existing.id,
                team: { organizationId: targetOrg, ageGroup: targetTeam.ageGroup },
              },
              select: { team: { select: { teamName: true } } },
            })
          : [];
        const hasRealAssignment = existingDivisionAssignments.some(
          (a) => a.team.teamName.trim().toLowerCase() !== "unallocated",
        );
        if (isTargetUnallocated && hasRealAssignment) {
          preservedCoachAssignments += 1;
        } else {
        // Drop assignments left over from an earlier import in this same
        // division that pointed at a different team (e.g. a placeholder
        // team before real teams existed) — otherwise a coach whose team
        // assignment changes between imports ends up linked to both the
        // stale team and the correct one instead of moving.
        await prisma.teamCoachAssignment.deleteMany({
          where: {
            registeredUserId: existing.id,
            teamId: { not: targetTeam.id },
            team: { organizationId: targetOrg, ageGroup: targetTeam.ageGroup },
          },
        });
        const assignment = await prisma.teamCoachAssignment.findUnique({
          where: {
            teamId_registeredUserId: {
              teamId: targetTeam.id,
              registeredUserId: existing.id,
            },
          },
          select: { id: true, role: true },
        });
        if (!assignment) {
          await prisma.teamCoachAssignment.create({
            data: {
              teamId: targetTeam.id,
              registeredUserId: existing.id,
              role: assignmentRole,
            },
          });
          createdCoachAssignments.push({
            teamId: targetTeam.id,
            registeredUserId: existing.id,
          });
          autoAssigned += 1;
        } else if (assignment.role !== assignmentRole) {
          await prisma.teamCoachAssignment.update({
            where: { id: assignment.id },
            data: { role: assignmentRole },
          });
          autoRoleUpdated += 1;
        }
        }
      }
    }
    if (justCreatedUser) {
      createdUserIds.push(existing.id);
      created += 1;
    } else {
      updated += 1;
    }

    if (processed % 10 === 0) {
      await prisma.coachImportBatch.update({
        where: { id: batchId },
        data: {
          processedCount: processed,
          createdCount: created,
          updatedCount: updated,
          skippedCount: skipped,
        },
      });
    }
  }

  const undoData = {
    createdUserIds,
    updatedUsers: updatedUsersBeforeImport,
    createdCoachAssignments,
  };

  await prisma.coachImportBatch.update({
    where: { id: batchId },
    data: {
      createdCount: created,
      updatedCount: updated,
      processedCount: processed,
      skippedCount: skipped,
      undoPayload: undoData,
    },
  });

  return {
    processed,
    created,
    updated,
    skipped,
    autoAssigned,
    autoRoleUpdated,
    autoAssignAttempts,
    preservedCoachAssignments,
    unmatchedTeamNames,
    undoData,
  };
}

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "USERS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(
    request.nextUrl.searchParams.get("org"),
  );

  try {
    const admin = await getAdminUserFromRequest(request);
    const formData = await request.formData();
    const file = formData.get("file");
    const ageGroupMappings = parseAgeGroupMappings(formData.get("ageGroupMappings"));
    const autoAssignToTeamsValue = String(formData.get("autoAssignToTeams") || "true").trim().toLowerCase();
    const autoAssignToTeams = autoAssignToTeamsValue !== "false";

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "CSV or XLSX file is required" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0] || ""];

    if (!firstSheet) {
      return NextResponse.json(
        { error: "Unable to read uploaded file" },
        { status: 400 },
      );
    }

    const rows = XLSX.utils.sheet_to_json<CsvRow>(firstSheet, {
      defval: "",
      raw: false,
    });

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Uploaded file has no rows" },
        { status: 400 },
      );
    }

    const batch = await prisma.coachImportBatch.create({
      data: {
        organizationId: targetOrg,
        createdByAdminId: admin?.id || null,
        createdByEmail: admin?.email || null,
        undoPayload: emptyUndoPayload(),
      },
      select: { id: true },
    });

    const result = await applyCoachImportRows({
      rows,
      targetOrg,
      batchId: batch.id,
      ageGroupMappings,
      autoAssignToTeams,
    });
    const {
      processed,
      created,
      updated,
      skipped,
      autoAssigned,
      autoRoleUpdated,
      autoAssignAttempts,
      preservedCoachAssignments,
      unmatchedTeamNames,
      undoData,
    } = result;

    return NextResponse.json({
      success: true,
      processed,
      created,
      updated,
      skipped,
      autoAssigned,
      autoRoleUpdated,
      preservedCoachAssignments,
      autoAssignToTeams,
      autoAssignDiagnostics: {
        attempts: autoAssignAttempts,
        unmatchedCount: unmatchedTeamNames.size,
        unmatchedTeamNames: Array.from(unmatchedTeamNames).sort((a, b) =>
          a.localeCompare(b),
        ),
      },
      importBatchId: batch.id,
      undoData,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to import coaches: ${message}` },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "USERS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(
    request.nextUrl.searchParams.get("org"),
  );
  const batchId = request.nextUrl.searchParams.get("batchId")?.trim();

  const batch = batchId
    ? await prisma.coachImportBatch.findFirst({
        where: { id: batchId, organizationId: targetOrg },
        select: {
          id: true,
          processedCount: true,
          createdCount: true,
          updatedCount: true,
          skippedCount: true,
          createdAt: true,
          undoneAt: true,
        },
      })
    : await prisma.coachImportBatch.findFirst({
        where: { organizationId: targetOrg, undoneAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          processedCount: true,
          createdCount: true,
          updatedCount: true,
          skippedCount: true,
          createdAt: true,
          undoneAt: true,
        },
      });

  return NextResponse.json({ batch: batch || null });
}
