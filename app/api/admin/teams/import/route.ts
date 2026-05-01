import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";

import { parseSeasonYear } from "@/lib/allStar/server";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

type Row = Record<string, string | number | boolean | null | undefined>;
type UndoSnapshot = {
  createdTeamIds: string[];
  createdPlayerIds: string[];
  updatedPlayers: Array<{
    id: string;
    data: Record<string, unknown>;
  }>;
};

function getRowValue(row: Row, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value === undefined || value === null) continue;
    const parsed = String(value).trim();
    if (parsed) return parsed;
  }
  return "";
}

function parseSeasonYearFromProgramName(programName: string) {
  const match = programName.match(/\b(20\d{2})\b/);
  if (!match?.[1]) return null;
  return parseSeasonYear(match[1]);
}

function splitName(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: null, lastName: null };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0] || null, lastName: null };
  }
  return {
    firstName: parts.slice(0, -1).join(" ") || null,
    lastName: parts.at(-1) || null,
  };
}

function parseBooleanValue(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (["true", "yes", "y", "1", "completed", "verified"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "not verified"].includes(normalized)) return false;
  return null;
}

function parseDateValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDivisionMappings(
  value: FormDataEntryValue | null,
): Map<string, string> {
  if (typeof value !== "string" || !value.trim()) return new Map();
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const mapping = new Map<string, string>();
    for (const [rawKey, rawValue] of Object.entries(parsed)) {
      const key = rawKey.trim().toLowerCase();
      const target =
        typeof rawValue === "string" ? rawValue.trim() : String(rawValue || "").trim();
      if (!key || !target) continue;
      mapping.set(key, target);
    }
    return mapping;
  } catch {
    return new Map();
  }
}

function shouldSkipDivisionImport(divisionName: string) {
  const normalized = divisionName.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("modified tee ball")) return false;
  if (normalized.includes("umpire")) return true;
  if (normalized.includes("little league tee ball")) return true;
  if (normalized.includes("little league teeball")) return true;
  if (normalized.includes("3-4 year-old")) return true;
  if (normalized.includes("3-4 year olds")) return true;
  if (normalized.includes("3/4 year-old")) return true;
  if (normalized.includes("5 year-old")) return true;
  if (normalized.includes("5 year olds")) return true;
  return false;
}

function emptyUndoPayload(): UndoSnapshot {
  return { createdTeamIds: [], createdPlayerIds: [], updatedPlayers: [] };
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function applyImportRows(params: {
  rows: Row[];
  targetOrg: string;
  adminId: string | null;
  explicitSeasonYear: number | null;
  divisionMappings: Map<string, string>;
  batchId: string;
}) {
  const {
    rows,
    targetOrg,
    adminId,
    explicitSeasonYear,
    divisionMappings,
    batchId,
  } = params;
  let processed = 0;
  let createdTeams = 0;
  let createdPlayers = 0;
  let updatedPlayers = 0;
  let skipped = 0;
  const teamCache = new Map<string, string>();
  const batch = await prisma.teamPlayerImportBatch.findUnique({
    where: { id: batchId },
    select: { undoPayload: true, status: true, organizationId: true, undoneAt: true },
  });
  if (!batch || batch.organizationId !== targetOrg || batch.undoneAt) {
    throw new Error("Import batch not found");
  }
  if (batch.status !== "RUNNING") {
    throw new Error("Import batch is not running");
  }
  const undoPayload = (batch.undoPayload ?? emptyUndoPayload()) as UndoSnapshot;
  const updatedSeen = new Set(undoPayload.updatedPlayers.map((entry) => entry.id));

  for (const row of rows) {
    processed += 1;
    const latestBatch = await prisma.teamPlayerImportBatch.findUnique({
      where: { id: batchId },
      select: { status: true },
    });
    if (!latestBatch || latestBatch.status !== "RUNNING") {
      break;
    }
    const rawAgeGroup =
      getRowValue(row, ["Division Name", "Age Group", "age_group", "AGE_GROUP"]) || "";
    if (shouldSkipDivisionImport(rawAgeGroup)) {
      skipped += 1;
      continue;
    }
    const mappedAgeGroup = divisionMappings.get(rawAgeGroup.trim().toLowerCase());
    const ageGroup = mappedAgeGroup || rawAgeGroup;
    const teamName =
      getRowValue(row, ["Team Name", "team_name", "assigned_team", "ASSIGNED_TEAM"]) || "";
    const programName = getRowValue(row, ["Program Name", "Season", "season"]);
    const seasonYear = explicitSeasonYear || parseSeasonYearFromProgramName(programName);
    if (!ageGroup || !teamName || !seasonYear) {
      skipped += 1;
      continue;
    }
    const fullName =
      getRowValue(row, [
        "Player Full Name",
        "Participant Full Name",
        "Full Name",
        "Player Name",
        "Player",
      ]) ||
      [
        getRowValue(row, ["Player First Name", "First Name", "first_name"]),
        getRowValue(row, ["Player Last Name", "Last Name", "last_name"]),
      ]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      [
        getRowValue(row, ["Account First Name", "Parent First Name"]),
        getRowValue(row, ["Account Last Name", "Parent Last Name"]),
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
    if (!fullName) {
      skipped += 1;
      continue;
    }
    const contactPhone = getRowValue(row, [
      "Player Telephone",
      "Player Cellphone",
      "Parent Phone",
      "Telephone",
      "Cellphone",
      "Other Phone",
      "Phone",
      "phone",
    ]);
    const guardianFirstName = getRowValue(row, ["Account First Name", "Parent First Name"]);
    const guardianLastName = getRowValue(row, ["Account Last Name", "Parent Last Name"]);
    const guardianEmail = getRowValue(row, ["User Email", "Email", "Parent Email"]);
    const guardianPhone = getRowValue(row, [
      "Telephone",
      "Cellphone",
      "Other Phone",
      "Parent Phone",
      "Phone",
    ]);
    const gender = getRowValue(row, ["Player Gender", "Gender"]);
    const birthDate = parseDateValue(getRowValue(row, ["Player Birth Date", "Birth Date", "DOB"]));
    const orderPaymentStatus = getRowValue(row, ["Order Payment Status", "Payment Status"]);
    const birthCertStatus = getRowValue(row, ["Birth Certificate Upload", "Birth Certificate"]);
    const rosterStatus =
      getRowValue(row, ["Roster Status", "Status", "status"]) ||
      [orderPaymentStatus, birthCertStatus].filter(Boolean).join(" | ") ||
      null;
    const registrationOrderNo = getRowValue(row, ["Order No", "Order Number"]);
    const registrationOrderDate = parseDateValue(getRowValue(row, ["Order Date"]));
    const jerseyNumber =
      getRowValue(row, [
        "Jersey Number",
        "Jersey",
        "jersey_number",
      ]) || null;
    const jerseySize =
      getRowValue(row, ["What is the players jersey size?", "Jersey Size"]) || null;
    const medicalConditionsSummary = getRowValue(row, [
      "Are there any physical / medical conditions or allergies that the staff need to be aware of?",
      "Medical Conditions",
      "Allergies",
    ]);
    const medicalConditionsDetails = getRowValue(row, [
      "If YES to above, please explain / describe the condition.",
      "Medical Condition Details",
    ]);
    const medicalTreatmentAuthorized = parseBooleanValue(
      getRowValue(row, ["Medical Treatment Authorization"]),
    );
    const liabilityWaiverAccepted = parseBooleanValue(getRowValue(row, ["Liability Waiver"]));
    const codeOfConductAccepted = parseBooleanValue(getRowValue(row, ["CODE OF CONDUCT"]));
    const refundPolicyAccepted = parseBooleanValue(getRowValue(row, ["REFUND POLICY"]));
    const playedPriorSeason = parseBooleanValue(
      getRowValue(row, ["Did you play in the Gonzales DYB Spring/Summer 2025 Season?"]),
    );
    const priorSeasonTeamInfo = getRowValue(row, ["If YES, to above, which team and age group?"]);
    const streetAddress = getRowValue(row, ["Street Address"]);
    const unit = getRowValue(row, ["Unit"]);
    const city = getRowValue(row, ["City"]);
    const state = getRowValue(row, ["State"]);
    const postalCode = getRowValue(row, ["Postal Code", "Zip", "Zip Code"]);
    const { firstName, lastName } = splitName(fullName);

    const teamKey = `${targetOrg}::${seasonYear}::${ageGroup.toLowerCase()}::${teamName.toLowerCase()}`;
    let teamId = teamCache.get(teamKey);
    if (!teamId) {
      const existingTeam = await prisma.team.findUnique({
        where: {
          organizationId_seasonYear_ageGroup_teamName: {
            organizationId: targetOrg,
            seasonYear,
            ageGroup,
            teamName,
          },
        },
        select: { id: true },
      });
      const team = existingTeam
        ? existingTeam
        : await prisma.team.create({
            data: {
              organizationId: targetOrg,
              seasonYear,
              ageGroup,
              teamName,
              createdByAdminId: adminId,
            },
            select: { id: true },
          });
      teamId = team.id;
      teamCache.set(teamKey, team.id);
      if (!existingTeam) {
        createdTeams += 1;
        if (!undoPayload.createdTeamIds.includes(team.id)) {
          undoPayload.createdTeamIds.push(team.id);
        }
      }
    }

    const existingPlayer = await prisma.teamPlayer.findFirst({
      where: { teamId, fullName: { equals: fullName, mode: "insensitive" } },
    });
    const updateData = {
      firstName,
      lastName,
      fullName,
      contactPhone: contactPhone || null,
      gender: gender || null,
      birthDate,
      guardianFirstName: guardianFirstName || null,
      guardianLastName: guardianLastName || null,
      guardianEmail: guardianEmail || null,
      guardianPhone: guardianPhone || null,
      paymentStatus: orderPaymentStatus || null,
      birthCertificateStatus: birthCertStatus || null,
      registrationOrderNo: registrationOrderNo || null,
      registrationOrderDate,
      jerseySize,
      medicalConditionsSummary: medicalConditionsSummary || null,
      medicalConditionsDetails: medicalConditionsDetails || null,
      medicalTreatmentAuthorized,
      liabilityWaiverAccepted,
      codeOfConductAccepted,
      refundPolicyAccepted,
      playedPriorSeason,
      priorSeasonTeamInfo: priorSeasonTeamInfo || null,
      streetAddress: streetAddress || null,
      unit: unit || null,
      city: city || null,
      state: state || null,
      postalCode: postalCode || null,
      rosterStatus,
      jerseyNumber,
    };
    if (existingPlayer) {
      if (!updatedSeen.has(existingPlayer.id)) {
        undoPayload.updatedPlayers.push({
          id: existingPlayer.id,
          data: {
            firstName: existingPlayer.firstName,
            lastName: existingPlayer.lastName,
            fullName: existingPlayer.fullName,
            contactPhone: existingPlayer.contactPhone,
            gender: existingPlayer.gender,
            birthDate: existingPlayer.birthDate,
            guardianFirstName: existingPlayer.guardianFirstName,
            guardianLastName: existingPlayer.guardianLastName,
            guardianEmail: existingPlayer.guardianEmail,
            guardianPhone: existingPlayer.guardianPhone,
            paymentStatus: existingPlayer.paymentStatus,
            birthCertificateStatus: existingPlayer.birthCertificateStatus,
            registrationOrderNo: existingPlayer.registrationOrderNo,
            registrationOrderDate: existingPlayer.registrationOrderDate,
            jerseySize: existingPlayer.jerseySize,
            medicalConditionsSummary: existingPlayer.medicalConditionsSummary,
            medicalConditionsDetails: existingPlayer.medicalConditionsDetails,
            medicalTreatmentAuthorized: existingPlayer.medicalTreatmentAuthorized,
            liabilityWaiverAccepted: existingPlayer.liabilityWaiverAccepted,
            codeOfConductAccepted: existingPlayer.codeOfConductAccepted,
            refundPolicyAccepted: existingPlayer.refundPolicyAccepted,
            playedPriorSeason: existingPlayer.playedPriorSeason,
            priorSeasonTeamInfo: existingPlayer.priorSeasonTeamInfo,
            streetAddress: existingPlayer.streetAddress,
            unit: existingPlayer.unit,
            city: existingPlayer.city,
            state: existingPlayer.state,
            postalCode: existingPlayer.postalCode,
            rosterStatus: existingPlayer.rosterStatus,
            jerseyNumber: existingPlayer.jerseyNumber,
          },
        });
        updatedSeen.add(existingPlayer.id);
      }
      await prisma.teamPlayer.update({ where: { id: existingPlayer.id }, data: updateData });
      updatedPlayers += 1;
    } else {
      const createdPlayer = await prisma.teamPlayer.create({ data: { teamId, ...updateData } });
      createdPlayers += 1;
      undoPayload.createdPlayerIds.push(createdPlayer.id);
    }
  }

  const nextBatch = await prisma.teamPlayerImportBatch.update({
    where: { id: batchId },
    data: {
      processedRows: { increment: processed },
      createdTeams: { increment: createdTeams },
      createdPlayers: { increment: createdPlayers },
      updatedPlayers: { increment: updatedPlayers },
      skippedRows: { increment: skipped },
      undoPayload: toInputJson(undoPayload),
    },
    select: {
      id: true,
      status: true,
      totalRows: true,
      processedRows: true,
      createdTeams: true,
      createdPlayers: true,
      updatedPlayers: true,
      skippedRows: true,
      completedAt: true,
    },
  });
  return nextBatch;
}

async function undoBatch(targetOrg: string, batchId?: string) {
  const batch = batchId
    ? await prisma.teamPlayerImportBatch.findFirst({
        where: { id: batchId, organizationId: targetOrg, undoneAt: null },
      })
    : await prisma.teamPlayerImportBatch.findFirst({
        where: { organizationId: targetOrg, undoneAt: null },
        orderBy: { createdAt: "desc" },
      });
  if (!batch) throw new Error("No import batch available to undo");
  const undoPayload = (batch.undoPayload ?? emptyUndoPayload()) as UndoSnapshot;
  const updatedOps = undoPayload.updatedPlayers.map((entry) =>
    prisma.teamPlayer.update({
      where: { id: entry.id },
      data: entry.data,
    }),
  );
  if (updatedOps.length > 0) await prisma.$transaction(updatedOps);
  if (undoPayload.createdPlayerIds.length > 0) {
    await prisma.teamPlayer.deleteMany({ where: { id: { in: undoPayload.createdPlayerIds } } });
  }
  if (undoPayload.createdTeamIds.length > 0) {
    await prisma.team.deleteMany({
      where: { id: { in: undoPayload.createdTeamIds }, organizationId: targetOrg },
    });
  }
  await prisma.teamPlayerImportBatch.update({
    where: { id: batch.id },
    data: { status: "UNDONE", undoneAt: new Date(), completedAt: new Date() },
  });
  return batch.id;
}

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }
  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const batchId = request.nextUrl.searchParams.get("batchId")?.trim();
  const mode = request.nextUrl.searchParams.get("mode")?.trim();
  if (mode === "history") {
    const limitRaw = Number(request.nextUrl.searchParams.get("limit") || "5");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 5;
    const history = await prisma.teamPlayerImportBatch.findMany({
      where: { organizationId: targetOrg },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        totalRows: true,
        processedRows: true,
        createdTeams: true,
        createdPlayers: true,
        updatedPlayers: true,
        skippedRows: true,
        createdAt: true,
        completedAt: true,
        undoneAt: true,
      },
    });
    return NextResponse.json({ data: history });
  }
  if (!batchId) {
    const latest = await prisma.teamPlayerImportBatch.findFirst({
      where: { organizationId: targetOrg },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ data: latest || null });
  }
  const batch = await prisma.teamPlayerImportBatch.findFirst({
    where: { id: batchId, organizationId: targetOrg },
  });
  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }
  return NextResponse.json({ data: batch });
}

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const admin = await getAdminUserFromRequest(request);
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as
      | { mode?: "start"; totalRows?: number }
      | {
          mode?: "chunk";
          batchId?: string;
          rows?: Row[];
          seasonYear?: number | string | null;
          divisionMappings?: Record<string, string>;
        }
      | { mode?: "complete"; batchId?: string }
      | { mode?: "cancel"; batchId?: string }
      | { mode?: "undo"; batchId?: string };
    if (body.mode === "start") {
      const created = await prisma.teamPlayerImportBatch.create({
        data: {
          organizationId: targetOrg,
          createdByAdminId: admin?.id || null,
          status: "RUNNING",
          totalRows:
            typeof body.totalRows === "number" && body.totalRows > 0 ? body.totalRows : 0,
          undoPayload: toInputJson(emptyUndoPayload()),
        },
      });
      return NextResponse.json({ success: true, batch: created });
    }
    if (body.mode === "chunk") {
      const batchId = typeof body.batchId === "string" ? body.batchId : "";
      if (!batchId || !Array.isArray(body.rows)) {
        return NextResponse.json({ error: "batchId and rows are required" }, { status: 400 });
      }
      const explicitSeasonYear = parseSeasonYear(String(body.seasonYear || ""));
      const divisionMappings = new Map<string, string>();
      const rawMap =
        body.divisionMappings && typeof body.divisionMappings === "object"
          ? body.divisionMappings
          : {};
      for (const [division, mapped] of Object.entries(rawMap)) {
        const key = division.trim().toLowerCase();
        const val = String(mapped || "").trim();
        if (key && val) divisionMappings.set(key, val);
      }
      const updated = await applyImportRows({
        rows: body.rows,
        targetOrg,
        adminId: admin?.id || null,
        explicitSeasonYear,
        divisionMappings,
        batchId,
      });
      return NextResponse.json({ success: true, batch: updated });
    }
    if (body.mode === "complete") {
      const batchId = typeof body.batchId === "string" ? body.batchId : "";
      if (!batchId) return NextResponse.json({ error: "batchId is required" }, { status: 400 });
      const completed = await prisma.teamPlayerImportBatch.update({
        where: { id: batchId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      return NextResponse.json({ success: true, batch: completed });
    }
    if (body.mode === "cancel") {
      const batchId = typeof body.batchId === "string" ? body.batchId : "";
      if (!batchId) return NextResponse.json({ error: "batchId is required" }, { status: 400 });
      await prisma.teamPlayerImportBatch.update({
        where: { id: batchId },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
      return NextResponse.json({ success: true });
    }
    if (body.mode === "undo") {
      try {
        const undoneBatchId = await undoBatch(
          targetOrg,
          typeof body.batchId === "string" ? body.batchId : undefined,
        );
        return NextResponse.json({ success: true, batchId: undoneBatchId });
      } catch (error: unknown) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Failed to undo import" },
          { status: 400 },
        );
      }
    }
    return NextResponse.json({ error: "Unsupported import mode" }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const divisionMappings = parseDivisionMappings(formData.get("divisionMappings"));
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV or XLSX file is required" }, { status: 400 });
  }
  const explicitSeasonYear = parseSeasonYear(String(formData.get("seasonYear") || ""));
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0] || ""];
  if (!firstSheet) {
    return NextResponse.json({ error: "Unable to read uploaded file" }, { status: 400 });
  }
  const rows = XLSX.utils.sheet_to_json<Row>(firstSheet, { defval: "", raw: false });
  if (rows.length === 0) {
    return NextResponse.json({ error: "Uploaded file has no rows" }, { status: 400 });
  }
  const createdBatch = await prisma.teamPlayerImportBatch.create({
    data: {
      organizationId: targetOrg,
      createdByAdminId: admin?.id || null,
      status: "RUNNING",
      totalRows: rows.length,
      undoPayload: toInputJson(emptyUndoPayload()),
    },
  });
  const batch = await applyImportRows({
    rows,
    targetOrg,
    adminId: admin?.id || null,
    explicitSeasonYear,
    divisionMappings,
    batchId: createdBatch.id,
  });
  await prisma.teamPlayerImportBatch.update({
    where: { id: createdBatch.id },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  return NextResponse.json({
    success: true,
    processed: batch.processedRows,
    createdTeams: batch.createdTeams,
    createdPlayers: batch.createdPlayers,
    updatedPlayers: batch.updatedPlayers,
    skipped: batch.skippedRows,
    batchId: createdBatch.id,
  });
}
