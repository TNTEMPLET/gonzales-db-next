import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import {
  importCandidatesFromTeamsForCycle,
  resequenceCandidateBibNumbers,
} from "@/lib/allStar/candidates";
import { isFrozenFirstTeamCycle } from "@/lib/allStar/cycleType";
import prisma from "@/lib/prisma";

type SheetRow = Record<string, string | number | null | undefined>;

function getRowValue(row: SheetRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function forbidIfNotMaster() {
  return null;
}

function normalizeAgeBandFilter(value: string | null | undefined) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "11U" || normalized === "12U" || normalized === "BOTH") return normalized;
  return null;
}

function requiresAgeBandFilterForCycle(organizationId: string, ageGroup: string) {
  return organizationId === "gonzales" && ageGroup.trim().toUpperCase().startsWith("12U");
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
    const result = await importCandidatesFromTeamsForCycle(prisma, {
      id: cycle.id,
      organizationId: cycle.organizationId,
      seasonYear: cycle.seasonYear,
      ageGroup: cycle.ageGroup,
    }, ageBandFilter || "BOTH");
    return NextResponse.json({
      success: true,
      source: "teams",
      created: result.created,
      skipped: result.skipped,
      processed: result.processed,
    });
  }

  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0] || ""];
  if (!firstSheet) return NextResponse.json({ error: "Could not read sheet" }, { status: 400 });

  const rows = XLSX.utils.sheet_to_json<SheetRow>(firstSheet, { raw: false, defval: "" });
  if (!rows.length) return NextResponse.json({ error: "No rows found" }, { status: 400 });

  const validRows: Array<{
    playerFullName: string;
    team: string;
    jerseyNumber: string;
  }> = [];
  let skipped = 0;

  for (const row of rows) {
    const playerFullName = getRowValue(row, ["player_full_name", "Player Full Name", "name", "Name"]);
    const team = getRowValue(row, ["team", "Team"]);
    const jerseyNumber = getRowValue(row, ["jersey_number", "Jersey Number", "jersey", "Jersey"]);

    if (!playerFullName || !team || !jerseyNumber) {
      skipped += 1;
      continue;
    }

    validRows.push({ playerFullName, team, jerseyNumber });
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
    processed: rows.length,
  });
}
