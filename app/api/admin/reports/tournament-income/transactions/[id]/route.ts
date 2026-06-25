import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { routeErrorMessage } from "@/lib/api/routeErrorMessage";
import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import {
  isTournamentIncomeCategory,
  isTournamentIncomeClassification,
  resolveTournamentIncomeOrg,
} from "@/lib/tournament-income";

type RouteParams = { params: Promise<{ id: string }> };

type PatchBody = {
  org?: string;
  organizationId?: string;
  category?: string;
  classification?: string;
  classificationStatus?: string;
  bracketProjectId?: string | null;
  adminNotes?: string | null;
};

export async function PATCH(request: NextRequest, ctx: RouteParams) {
  const auth = await ensureAdminModule(request, "REPORTS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  const { id } = await ctx.params;
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const organizationId = resolveTournamentIncomeOrg(
    body.org ?? body.organizationId ?? request.nextUrl.searchParams.get("org"),
  );
  if (!organizationId) {
    return NextResponse.json({ error: "org must be a valid bracket org" }, { status: 400 });
  }

  const existing = await prisma.tournamentIncomeTransaction.findUnique({ where: { id } });
  if (!existing || existing.organizationId !== organizationId) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  const data: Prisma.TournamentIncomeTransactionUpdateInput = {};
  let manualClassification = false;

  if (body.category !== undefined) {
    if (!isTournamentIncomeCategory(body.category)) {
      return NextResponse.json({ error: "category is invalid" }, { status: 400 });
    }
    data.category = body.category;
    manualClassification = true;
  }

  const classification = body.classificationStatus ?? body.classification;
  if (classification !== undefined) {
    if (!isTournamentIncomeClassification(classification)) {
      return NextResponse.json({ error: "classification is invalid" }, { status: 400 });
    }
    data.classificationStatus = classification;
  }

  if (body.adminNotes !== undefined) {
    data.adminNotes = body.adminNotes?.trim() || null;
  }

  if (body.bracketProjectId !== undefined) {
    const bracketProjectId = body.bracketProjectId?.trim() || null;
    if (bracketProjectId) {
      const project = await prisma.bracketProject.findUnique({
        where: { id: bracketProjectId },
        select: { id: true, organizationId: true },
      });
      if (!project || project.organizationId !== organizationId) {
        return NextResponse.json({ error: "Bracket project not found for org" }, { status: 400 });
      }
    }
    data.bracketProject = bracketProjectId ? { connect: { id: bracketProjectId } } : { disconnect: true };
    manualClassification = true;
  }

  if (manualClassification && data.classificationStatus === undefined) {
    data.classificationStatus = "MANUAL";
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No supported fields to update" }, { status: 400 });
  }

  try {
    const updated = await prisma.tournamentIncomeTransaction.update({
      where: { id },
      data,
    });
    return NextResponse.json({ data: updated });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: routeErrorMessage(err, "Failed to update tournament income transaction") },
      { status: 500 },
    );
  }
}
