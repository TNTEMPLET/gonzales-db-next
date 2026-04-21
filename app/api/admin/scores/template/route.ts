import { NextRequest, NextResponse } from "next/server";

import { ensureNewsAdmin } from "@/lib/news/auth";

export async function GET(request: NextRequest) {
  const auth = await ensureNewsAdmin(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const headers = [
    "Match ID",
    "Event Name",
    "Group Name",
    "Home Team",
    "Away Team",
    "Date",
    "Start Time",
    "Home Team Score",
    "Away Team Score",
    "Scheduled Status",
  ];

  const sampleRow = [
    "13422195",
    "7-8 Coaches Pitch - Little League",
    "7-8 Coaches Pitch - Majors-Group",
    "Bayou Glove Works - Todd",
    "Ascension Parks - Bennett",
    "03/09/2026",
    "6:00 PM",
    "5",
    "4",
    "A",
  ];

  const csv = [headers, sampleRow].map((row) => row.join(",")).join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="scores-upload-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
