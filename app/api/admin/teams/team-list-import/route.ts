import { NextRequest, NextResponse } from "next/server";

import { parseSeasonYear } from "@/lib/allStar/server";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

type TeamListImportMode = "preview" | "import";
type TeamListImportAction = "CREATE" | "UPDATE" | "SKIP";

type CsvRecord = {
  rowNumber: number;
  values: Record<string, string>;
};

type TeamListImportRow = {
  rowNumber: number;
  ageGroup: string;
  teamName: string;
  sponsor: string | null;
  headCoachLastName: string | null;
  action: TeamListImportAction;
  errors: string[];
  warnings: string[];
  existingTeamId: string | null;
};

const HEADER_ALIASES = {
  ageGroup: ["age group", "agegroup", "division", "division name", "program division"],
  teamName: ["team name", "team", "teamname"],
  mlbTeam: ["mlb team", "mlb", "mlbteam", "fall ball team"],
  sponsor: ["sponsor", "sponsor name", "sponsorname"],
  headCoachLastName: [
    "head coach last name",
    "head coach lastname",
    "coach last name",
    "head coach",
    "coach",
  ],
} as const;

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseCsv(csvText: string) {
  const lines = csvText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const firstContentIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentIndex === -1) {
    return { headers: [] as string[], records: [] as CsvRecord[] };
  }

  const headers = parseCsvLine(lines[firstContentIndex]).map(normalizeHeader);
  const records: CsvRecord[] = [];

  for (let index = firstContentIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const columns = parseCsvLine(line);
    const values: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      if (!header) return;
      values[header] = columns[columnIndex]?.trim() || "";
    });
    records.push({ rowNumber: index + 1, values });
  }

  return { headers, records };
}

function valueFor(record: CsvRecord, aliases: readonly string[]) {
  for (const alias of aliases) {
    const normalized = normalizeHeader(alias);
    const value = record.values[normalized];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function buildTeamName(sponsor: string, headCoachLastName: string) {
  const sponsorText = sponsor.trim();
  const coachText = headCoachLastName.trim();
  if (sponsorText && coachText) return `${sponsorText} - ${coachText}`;
  return "";
}

function rowKey(seasonYear: number, ageGroup: string, teamName: string) {
  return `${seasonYear}\u0000${ageGroup.trim().toLowerCase()}\u0000${teamName.trim().toLowerCase()}`;
}

function summarize(rows: TeamListImportRow[]) {
  return rows.reduce(
    (counts, row) => {
      counts.total += 1;
      if (row.action === "CREATE") counts.create += 1;
      if (row.action === "UPDATE") counts.update += 1;
      if (row.action === "SKIP") counts.skip += 1;
      if (row.errors.length > 0) counts.errors += 1;
      if (row.warnings.length > 0) counts.warnings += 1;
      return counts;
    },
    { total: 0, create: 0, update: 0, skip: 0, errors: 0, warnings: 0 },
  );
}

async function buildPreviewRows({
  targetOrg,
  seasonYear,
  csvText,
}: {
  targetOrg: string;
  seasonYear: number;
  csvText: string;
}) {
  const { headers, records } = parseCsv(csvText);
  const rows: TeamListImportRow[] = [];

  const hasAgeGroup = HEADER_ALIASES.ageGroup.some((alias) => headers.includes(normalizeHeader(alias)));
  const hasTeamName = HEADER_ALIASES.teamName.some((alias) => headers.includes(normalizeHeader(alias)));
  const hasMlbTeam = HEADER_ALIASES.mlbTeam.some((alias) => headers.includes(normalizeHeader(alias)));
  const hasSponsor = HEADER_ALIASES.sponsor.some((alias) => headers.includes(normalizeHeader(alias)));
  const hasCoach = HEADER_ALIASES.headCoachLastName.some((alias) => headers.includes(normalizeHeader(alias)));

  const setupErrors: string[] = [];
  if (headers.length === 0) setupErrors.push("CSV header row is required.");
  if (!hasAgeGroup) setupErrors.push("Missing required Age Group or Division column.");
  if (!hasTeamName && !hasMlbTeam && !(hasSponsor && hasCoach)) {
    setupErrors.push("Missing Team Name, MLB Team, or Sponsor + Head Coach Last Name columns.");
  }

  const existingTeams = await prisma.team.findMany({
    where: { organizationId: targetOrg, seasonYear },
    select: { id: true, seasonYear: true, ageGroup: true, teamName: true },
  });
  const existingByKey = new Map(
    existingTeams.map((team) => [rowKey(team.seasonYear, team.ageGroup, team.teamName), team]),
  );
  const seenInFile = new Set<string>();

  if (setupErrors.length > 0 && records.length === 0) {
    rows.push({
      rowNumber: 1,
      ageGroup: "",
      teamName: "",
      sponsor: null,
      headCoachLastName: null,
      action: "SKIP",
      errors: setupErrors,
      warnings: [],
      existingTeamId: null,
    });
    return rows;
  }

  for (const record of records) {
    const errors = [...setupErrors];
    const warnings: string[] = [];
    const ageGroup = valueFor(record, HEADER_ALIASES.ageGroup);
    const teamName = valueFor(record, HEADER_ALIASES.teamName);
    const mlbTeam = valueFor(record, HEADER_ALIASES.mlbTeam);
    const sponsor = valueFor(record, HEADER_ALIASES.sponsor);
    const headCoachLastName = valueFor(record, HEADER_ALIASES.headCoachLastName);
    const resolvedTeamName = teamName || mlbTeam || buildTeamName(sponsor, headCoachLastName);

    if (!ageGroup) errors.push("Age Group/Division is required.");
    if (!resolvedTeamName) {
      errors.push("Team Name or MLB Team is required; non-Fall Ball rows may use Sponsor and Head Coach Last Name instead.");
    }
    if (teamName && mlbTeam) warnings.push("Team Name was used; MLB Team was ignored.");
    if (!teamName && mlbTeam) warnings.push("Using MLB Team as the team name.");
    if (!teamName && !mlbTeam && resolvedTeamName) {
      warnings.push("Team Name was built from Sponsor and Head Coach Last Name.");
    }

    const key = rowKey(seasonYear, ageGroup, resolvedTeamName);
    const existing = existingByKey.get(key) || null;
    if (seenInFile.has(key)) errors.push("Duplicate team in this CSV for the same season, age group, and team name.");
    if (ageGroup && resolvedTeamName) seenInFile.add(key);

    rows.push({
      rowNumber: record.rowNumber,
      ageGroup,
      teamName: resolvedTeamName,
      sponsor: sponsor || null,
      headCoachLastName: headCoachLastName || null,
      action: errors.length > 0 ? "SKIP" : existing ? "UPDATE" : "CREATE",
      errors,
      warnings,
      existingTeamId: existing?.id || null,
    });
  }

  if (rows.length === 0) {
    rows.push({
      rowNumber: 1,
      ageGroup: "",
      teamName: "",
      sponsor: null,
      headCoachLastName: null,
      action: "SKIP",
      errors: setupErrors.length > 0 ? setupErrors : ["CSV contains no importable team rows."],
      warnings: [],
      existingTeamId: null,
    });
  }

  return rows;
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
  const body = (await request.json()) as {
    mode?: TeamListImportMode;
    seasonYear?: number | string;
    csvText?: string;
    teamNameMode?: string;
  };

  const mode = body.mode === "import" ? "import" : "preview";
  const seasonYear = parseSeasonYear(String(body.seasonYear ?? ""));
  const csvText = typeof body.csvText === "string" ? body.csvText : "";

  if (!seasonYear) {
    return NextResponse.json({ error: "seasonYear is required" }, { status: 400 });
  }
  if (!csvText.trim()) {
    return NextResponse.json({ error: "csvText is required" }, { status: 400 });
  }

  const rows = await buildPreviewRows({ targetOrg, seasonYear, csvText });
  const summary = summarize(rows);

  if (mode === "preview") {
    return NextResponse.json({ success: true, mode, seasonYear, rows, summary });
  }

  if (summary.errors > 0) {
    return NextResponse.json(
      { error: "Fix row errors before importing team list.", mode, seasonYear, rows, summary },
      { status: 400 },
    );
  }

  const affectedTeams = [];
  for (const row of rows) {
    if (row.action === "SKIP") continue;
    const team = await prisma.team.upsert({
      where: {
        organizationId_seasonYear_ageGroup_teamName: {
          organizationId: targetOrg,
          seasonYear,
          ageGroup: row.ageGroup,
          teamName: row.teamName,
        },
      },
      create: {
        organizationId: targetOrg,
        seasonYear,
        ageGroup: row.ageGroup,
        teamName: row.teamName,
        createdByAdminId: admin?.id || null,
      },
      update: {},
    });
    affectedTeams.push(team);
  }

  return NextResponse.json({
    success: true,
    mode,
    seasonYear,
    rows,
    summary: { ...summary, affected: affectedTeams.length },
    affectedTeams,
  });
}
