import { NextRequest, NextResponse } from "next/server";

import { ensureTournamentBracketsMaster } from "@/lib/tournament-brackets/auth";
import prisma from "@/lib/prisma";
import { isContentOrgId } from "@/lib/siteConfig";

export async function GET(request: NextRequest) {
  const auth = await ensureTournamentBracketsMaster(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const org = request.nextUrl.searchParams.get("organizationId");
  const where =
    org && isContentOrgId(org) ? { organizationId: org } : {};

  const rows = await prisma.governingBodyTemplate.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 40,
  });

  return NextResponse.json({ data: rows });
}

export async function POST(request: NextRequest) {
  const auth = await ensureTournamentBracketsMaster(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body = (await request.json()) as {
    organizationId?: string;
    governingBody?: string;
    label?: string;
    fileUrl?: string;
    fileMime?: string;
    parserProfileId?: string;
    notes?: string;
  };

  if (!body.organizationId || !isContentOrgId(body.organizationId)) {
    return NextResponse.json({ error: "organizationId must be gonzales or ascension" }, { status: 400 });
  }
  if (!body.governingBody?.trim() || !body.label?.trim() || !body.fileUrl?.trim()) {
    return NextResponse.json(
      { error: "governingBody, label, and fileUrl are required" },
      { status: 400 },
    );
  }

  const created = await prisma.governingBodyTemplate.create({
    data: {
      organizationId: body.organizationId,
      governingBody: body.governingBody.trim(),
      label: body.label.trim(),
      fileUrl: body.fileUrl.trim(),
      fileMime: body.fileMime?.trim() || null,
      parserProfileId: body.parserProfileId?.trim() || null,
      notes: body.notes?.trim() || null,
      createdByAdminId: auth.adminUserId,
    },
  });

  return NextResponse.json({ data: created });
}
