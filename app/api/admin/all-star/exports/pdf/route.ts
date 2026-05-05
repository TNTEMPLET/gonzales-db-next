import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const cycleId = request.nextUrl.searchParams.get("cycleId");
  if (!cycleId) return NextResponse.json({ error: "cycleId is required" }, { status: 400 });

  const cycle = await prisma.allStarBallotCycle.findUnique({
    where: { id: cycleId },
    include: {
      candidates: true,
      voteSubmissions: { include: { voteItems: true } },
    },
  });
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  const ratingMap = new Map<string, number[]>();
  for (const submission of cycle.voteSubmissions) {
    for (const item of submission.voteItems) {
      const bucket = ratingMap.get(item.candidateId) || [];
      bucket.push(item.rating);
      ratingMap.set(item.candidateId, bucket);
    }
  }

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  doc.setFontSize(14);
  doc.text(
    `All-Star Ballot Export — ${cycle.organizationId.toUpperCase()} ${cycle.ageGroup} (${cycle.seasonYear})`,
    40,
    40,
  );
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 58);

  autoTable(doc, {
    startY: 76,
    head: [
      cycle.hasShowcase
        ? ["Player", "Team", "Jersey", "Showcase Bib #", "Avg Rating", "Votes"]
        : ["Player", "Team", "Jersey", "Avg Rating", "Votes"],
    ],
    body: cycle.candidates.map((candidate) => {
      const ratings = ratingMap.get(candidate.id) || [];
      const avg = ratings.length
        ? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(2)
        : "0.00";
      const row = [
        candidate.playerFullName,
        candidate.team,
        candidate.jerseyNumber,
        avg,
        String(ratings.length),
      ];
      if (cycle.hasShowcase) {
        row.splice(3, 0, candidate.showcaseBibNumber || "");
      }
      return row;
    }),
    styles: { fontSize: 9 },
  });

  const pdfBuffer = doc.output("arraybuffer");
  return new NextResponse(Buffer.from(pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="all-star-${cycle.organizationId}-${cycle.seasonYear}-${cycle.ageGroup}.pdf"`,
    },
  });
}
