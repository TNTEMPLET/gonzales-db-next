import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import {
  buildCandidateImportCsv,
  normalizeCandidateSpreadsheetRows,
  parseCandidateSpreadsheetBuffer,
} from "@/lib/allStar/candidateSpreadsheet";
import prisma from "@/lib/prisma";

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

export async function POST(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const form = await request.formData();
  const cycleId = String(form.get("cycleId") || "").trim();
  const file = form.get("file");
  const download = String(form.get("download") || "").trim().toLowerCase() === "true";
  const teamMappings = parseTeamMappings(form.get("teamMappings"));

  if (!cycleId) {
    return NextResponse.json({ error: "cycleId is required" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const cycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: cycleId },
    select: { id: true, organizationId: true, seasonYear: true, ageGroup: true },
  });
  if (!cycle) {
    return NextResponse.json({ error: "Cycle not found" }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseCandidateSpreadsheetBuffer(buffer);
  if (!parsed.rows.length) {
    return NextResponse.json({ error: "No rows found in spreadsheet" }, { status: 400 });
  }

  const existingTeams = await prisma.team.findMany({
    where: {
      organizationId: cycle.organizationId,
      seasonYear: cycle.seasonYear,
      ageGroup: cycle.ageGroup,
    },
    select: { teamName: true },
    orderBy: { teamName: "asc" },
  });
  const existingTeamNames = existingTeams.map((team) => team.teamName);

  const cleanup = normalizeCandidateSpreadsheetRows(parsed.rows, {
    existingTeamNames,
    teamMappings,
  });

  if (download) {
    const csv = buildCandidateImportCsv(
      cleanup.rows.map((row) => ({
        playerFullName: row.playerFullName,
        team: row.team,
        jerseyNumber: row.jerseyNumber,
      })),
    );
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="all-star-candidates-cleaned.csv"',
      },
    });
  }

  return NextResponse.json({
    success: true,
    detectedHeaders: parsed.headers,
    existingTeamNames,
    ...cleanup,
  });
}
