import { NextRequest, NextResponse } from "next/server";

import { rosterPlayersToGameChangerCsv, slugifyRosterFilePart } from "@/lib/gamechanger/rosterExport";
import { ensureTournamentBracketsMaster } from "@/lib/tournament-brackets/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await ensureTournamentBracketsMaster(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const submissionId = request.nextUrl.searchParams.get("submissionId")?.trim();
  const linkId = request.nextUrl.searchParams.get("linkId")?.trim();
  const organizationId = request.nextUrl.searchParams.get("organizationId")?.trim();
  const seasonYear = Number.parseInt(request.nextUrl.searchParams.get("seasonYear") ?? "", 10);
  const bracketProjectId = request.nextUrl.searchParams.get("bracketProjectId")?.trim() || null;
  if (!submissionId && !linkId && organizationId && Number.isFinite(seasonYear)) {
    const submissions = await prisma.tournamentRosterSubmission.findMany({
      where: { status: "APPROVED", link: { organizationId, seasonYear, bracketProjectId } },
      orderBy: [{ link: { teamName: "asc" } }, { updatedAt: "desc" }],
      include: { players: { orderBy: { rowNumber: "asc" } }, link: true },
    });
    const seen = new Set<string>();
    const rows = [["Team Name", "First Name", "Last Name", "Jersey Number"]];
    for (const submission of submissions) {
      if (seen.has(submission.linkId)) continue;
      seen.add(submission.linkId);
      for (const player of submission.players) rows.push([submission.link.teamName, player.firstName, player.lastName, player.jerseyNumber]);
    }
    const escape = (value: string) =>
      value.includes('"') || value.includes(",") || value.includes("\n")
        ? `"${value.replace(/"/g, '""')}"`
        : value;
    const csv = rows.map((row) => row.map(escape).join(",")).join("\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="approved-gamechanger-rosters.csv"',
      },
    });
  }
  if (!submissionId && !linkId) return NextResponse.json({ error: "submissionId or linkId is required" }, { status: 400 });
  const submission = submissionId
    ? await prisma.tournamentRosterSubmission.findUnique({
        where: { id: submissionId },
        include: { players: { orderBy: { rowNumber: "asc" } }, link: true },
      })
    : await prisma.tournamentRosterSubmission.findFirst({
        where: { linkId, status: "APPROVED" },
        orderBy: { updatedAt: "desc" },
        include: { players: { orderBy: { rowNumber: "asc" } }, link: true },
      });
  if (!submission) return NextResponse.json({ error: "Approved submission not found" }, { status: 404 });
  if (submission.status !== "APPROVED") {
    return NextResponse.json({ error: "Roster must be approved before export" }, { status: 409 });
  }
  const csv = rosterPlayersToGameChangerCsv(submission.players);
  const filename = `${slugifyRosterFilePart(submission.link.teamName)}-gamechanger-roster.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
