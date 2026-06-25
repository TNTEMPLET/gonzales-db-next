import { NextRequest, NextResponse } from "next/server";

import { routeErrorMessage } from "@/lib/api/routeErrorMessage";
import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import {
  filtersFromSearchParams,
  parsePositiveInt,
} from "@/lib/tournament-income";

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "REPORTS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  const parsed = filtersFromSearchParams(request.nextUrl.searchParams);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const seasonYear = parsePositiveInt(request.nextUrl.searchParams.get("seasonYear"));

  try {
    const projects = await prisma.bracketProject.findMany({
      where: {
        organizationId: parsed.filters.organizationId,
        ...(seasonYear ? { seasonYear } : {}),
      },
      orderBy: [{ seasonYear: "desc" }, { priority: "asc" }, { name: "asc" }],
      select: { id: true, organizationId: true, seasonYear: true, name: true, status: true },
    });
    return NextResponse.json({ data: projects });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: routeErrorMessage(err, "Failed to load tournament income brackets") },
      { status: 500 },
    );
  }
}
