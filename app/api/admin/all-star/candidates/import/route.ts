import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import {
  normalizeCandidateSpreadsheetRows,
  parseCandidateSpreadsheetBuffer,
  resolveJerseyFromSheetRow,
  resolvePlayerFullNameFromSheetRow,
  resolveTeamFromSheetRow,
  type CandidateSheetRow,
} from "@/lib/allStar/candidateSpreadsheet";
import {
  importCandidatesFromTeamsForCycle,
  resequenceCandidateBibNumbers,
} from "@/lib/allStar/candidates";
import { isFrozenFirstTeamCycle } from "@/lib/allStar/cycleType";
import prisma from "@/lib/prisma";

function forbidIfNotMaster() {
  return null;
}

function normalizeAgeBandFilter(value: string | null | undefined) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === "BOTH") return normalized;
  const match = normalized.match(/^(\d{1,2})U$/);
  if (match?.[1]) return `${Number.parseInt(match[1], 10)}U`;
  return null;
}

function requiresAgeBandFilterForCycle(organizationId: string, ageGroup: string) {
  return organizationId === "gonzales" && ageGroup.trim().toUpperCase().startsWith("12U");
}

function parseTeamMappings(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const mappings: Record<string, string> = {};
    for (const [rawKey, rawTarget] of Object.entries(parsed)) {
      const key = rawKey.trim();
      const target = typeof rawTarget === "string" ? rawTarget.trim() : "";
      if (key && target) mappings[key] = target;
    }
    return mappings;
  } catch {
    return {};
  }
}

function parseCleanedRows(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as Array<{
      playerFullName?: unknown;
      team?: unknown;
      jerseyNumber?: unknown;
    }>;
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map((row) => ({
        playerFullName: String(row.playerFullName || "").trim(),
        team: String(row.team || "").trim(),
        jerseyNumber: String(row.jerseyNumber || "").trim(),
      }))
      .filter((row) => row.playerFullName && row.team);
  } catch {
    return null;
  }
}

function rowsFromLegacySheet(sheetRows: CandidateSheetRow[]) {
  const validRows: Array<{
    playerFullName: string;
    team: string;
    jerseyNumber: string;
  }> = [];
  let skipped = 0;

  for (const row of sheetRows) {
    const playerFullName = resolvePlayerFullNameFromSheetRow(row);
    const team = resolveTeamFromSheetRow(row);
    const jerseyNumber = resolveJerseyFromSheetRow(row);

    if (!playerFullName || !team) {
      skipped += 1;
      continue;
    }

    validRows.push({ playerFullName, team, jerseyNumber });
  }

  return { validRows, skipped, processed: sheetRows.length };
}

export async function POST(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const forbid = forbidIfNotMaster();
  if (forbid) return forbid;

  const form = await request.formData();
  const cycleId = String(form.get("cycleId") || "");
  const source = String(form.get("source") || "").trim().toLowerCase();
  const ageBandFilter = normalizeAgeBandFilter(
    typeof form.get("ageBandFilter") === "string" ? String(form.get("ageBandFilter")) : null,
  );
  const file = form.get("file");
  const teamMappings = parseTeamMappings(form.get("teamMappings"));
  const cleanedRows = parseCleanedRows(form.get("cleanedRows"));

  if (!cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });

  const cycle = await prisma.allStarBallotCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  if (isFrozenFirstTeamCycle(cycle)) {
    return NextResponse.json(
      { error: "First-team cycle is frozen while closed. Reopen cycle to edit." },
      { status: 409 },
    );
  }

  if (source === "teams") {
    if (requiresAgeBandFilterForCycle(cycle.organizationId, cycle.ageGroup) && !ageBandFilter) {
      return NextResponse.json(
        { error: "Select All-Star age filter (11U, 12U, or BOTH) for 12U DYB imports." },
        { status: 400 },
      );
    }
    const result = await importCandidatesFromTeamsForCycle(
      prisma,
      {
        id: cycle.id,
        organizationId: cycle.organizationId,
        seasonYear: cycle.seasonYear,
        ageGroup: cycle.ageGroup,
        allStarAgeGroupId: cycle.allStarAgeGroupId,
        allStarAgeGroupLabel: cycle.allStarAgeGroupLabel,
      },
      ageBandFilter || "BOTH",
    );
    return NextResponse.json({
      success: true,
      source: "teams",
      created: result.created,
      skipped: result.skipped,
      processed: result.processed,
    });
  }

  let validRows: Array<{
    playerFullName: string;
    team: string;
    jerseyNumber: string;
  }> = [];
  let skipped = 0;
  let processed = 0;

  if (cleanedRows && cleanedRows.length > 0) {
    validRows = cleanedRows;
    processed = cleanedRows.length;
  } else {
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseCandidateSpreadsheetBuffer(buffer);
    if (!parsed.rows.length) {
      return NextResponse.json({ error: "No rows found" }, { status: 400 });
    }

    const existingTeams = await prisma.team.findMany({
      where: {
        organizationId: cycle.organizationId,
        seasonYear: cycle.seasonYear,
        ageGroup: cycle.ageGroup,
      },
      select: { teamName: true },
    });
    const existingTeamNames = existingTeams.map((team) => team.teamName);

    if (Object.keys(teamMappings).length > 0 || existingTeamNames.length > 0) {
      const cleanup = normalizeCandidateSpreadsheetRows(parsed.rows, {
        existingTeamNames,
        teamMappings,
      });
      validRows = cleanup.rows.map((row) => ({
        playerFullName: row.playerFullName,
        team: row.team,
        jerseyNumber: row.jerseyNumber,
      }));
      skipped = cleanup.skipped.length;
      processed = parsed.rows.length;
    } else {
      const legacy = rowsFromLegacySheet(parsed.rows);
      validRows = legacy.validRows;
      skipped = legacy.skipped;
      processed = legacy.processed;
    }
  }

  if (validRows.length === 0) {
    return NextResponse.json(
      {
        error:
          "No importable rows found. Use Clean up & preview to map columns and team names, or download the import template.",
        skipped,
        processed,
      },
      { status: 400 },
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const row of validRows) {
      await tx.allStarCandidate.create({
        data: {
          ballotCycleId: cycle.id,
          organizationId: cycle.organizationId,
          ageGroup: cycle.ageGroup,
          playerFullName: row.playerFullName,
          team: row.team,
          jerseyNumber: row.jerseyNumber,
          showcaseBibNumber: null,
        },
      });
    }
    await resequenceCandidateBibNumbers(tx, cycle.id);
  });

  return NextResponse.json({
    success: true,
    created: validRows.length,
    skipped,
    processed,
  });
}
