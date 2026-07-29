import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

type UpdatedUserSnapshot = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  contactPhone: string | null;
  ageGroup: string | null;
  assignedTeam: string | null;
  isCoach: boolean;
};

type UndoPayload = {
  importBatchId?: string;
  createdUserIds?: string[];
  updatedUsers?: UpdatedUserSnapshot[];
  createdCoachAssignments?: Array<{
    teamId: string;
    registeredUserId: string;
  }>;
};

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "USERS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(
    request.nextUrl.searchParams.get("org"),
  );

  try {
    const body = (await request.json()) as UndoPayload;
    let importBatchId: string | null =
      typeof body.importBatchId === "string" && body.importBatchId.trim()
        ? body.importBatchId.trim()
        : null;

    const batch = importBatchId
      ? await prisma.coachImportBatch.findFirst({
          where: {
            id: importBatchId,
            organizationId: targetOrg,
            undoneAt: null,
          },
          select: { id: true, undoPayload: true },
        })
      : await prisma.coachImportBatch.findFirst({
          where: { organizationId: targetOrg, undoneAt: null },
          orderBy: { createdAt: "desc" },
          select: { id: true, undoPayload: true },
        });

    if (!batch) {
      return NextResponse.json(
        { error: "No active import batch available to undo" },
        { status: 404 },
      );
    }

    importBatchId = batch.id;
    const payload = (batch.undoPayload ?? {}) as UndoPayload;
    const createdUserIds = Array.isArray(payload.createdUserIds)
      ? payload.createdUserIds.filter((id): id is string => typeof id === "string")
      : [];
    const updatedUsers = Array.isArray(payload.updatedUsers)
      ? payload.updatedUsers.filter(
          (item): item is UpdatedUserSnapshot =>
            Boolean(item) &&
            typeof item.id === "string" &&
            "firstName" in item &&
            "lastName" in item &&
            "name" in item &&
            "ageGroup" in item &&
            "assignedTeam" in item &&
            "isCoach" in item,
        )
      : [];
    const createdCoachAssignments = Array.isArray(payload.createdCoachAssignments)
      ? payload.createdCoachAssignments.filter(
          (item): item is { teamId: string; registeredUserId: string } =>
            Boolean(item) &&
            typeof item.teamId === "string" &&
            typeof item.registeredUserId === "string",
        )
      : [];

    if (
      createdUserIds.length === 0 &&
      updatedUsers.length === 0 &&
      createdCoachAssignments.length === 0
    ) {
      return NextResponse.json(
        { error: "No import rollback data provided" },
        { status: 400 },
      );
    }

    // Global identity rows: we only filter by id (RegisteredUser is org-agnostic).
    const createdUsers = await prisma.registeredUser.findMany({
      where: { id: { in: createdUserIds } },
      select: { id: true },
    });
    const deletableIds = createdUsers.map((user) => user.id);

    const updatedUserIds = updatedUsers.map((item) => item.id);
    const existingUpdatedUsers = await prisma.registeredUser.findMany({
      where: { id: { in: updatedUserIds } },
      select: { id: true },
    });
    const existingUpdatedUserIdSet = new Set(
      existingUpdatedUsers.map((user) => user.id),
    );

    let revertedUpdated = 0;
    if (updatedUsers.length > 0) {
      // Restore global fields on the user row; restore per-org coach/age/team on the profile.
      const tx = updatedUsers
        .filter((item) => existingUpdatedUserIdSet.has(item.id))
        .map((item) =>
          prisma.registeredUser.update({
            where: { id: item.id },
            data: {
              firstName: item.firstName,
              lastName: item.lastName,
              name: item.name,
              contactPhone:
                typeof item.contactPhone === "string" ? item.contactPhone : null,
            },
          }),
        );
      if (tx.length > 0) {
        await prisma.$transaction(tx);
      }
      // Profile restores (per-org)
      for (const item of updatedUsers.filter((it) => existingUpdatedUserIdSet.has(it.id))) {
        await (prisma as any).registeredUserOrgProfile.upsert({
          where: {
            registeredUserId_organizationId: { registeredUserId: item.id, organizationId: targetOrg },
          },
          create: {
            registeredUserId: item.id,
            organizationId: targetOrg,
            isCoach: item.isCoach,
            ageGroup: item.ageGroup,
            assignedTeam: item.assignedTeam,
          },
          update: {
            isCoach: item.isCoach,
            ageGroup: item.ageGroup,
            assignedTeam: item.assignedTeam,
          },
        });
      }
      revertedUpdated = updatedUsers.filter((it) => existingUpdatedUserIdSet.has(it.id)).length;
    }

    let removedAssignments = 0;
    if (createdCoachAssignments.length > 0) {
      const deleted = await prisma.teamCoachAssignment.deleteMany({
        where: {
          OR: createdCoachAssignments.map((item) => ({
            teamId: item.teamId,
            registeredUserId: item.registeredUserId,
          })),
        },
      });
      removedAssignments = deleted.count;
    }

    let deletedCreated = 0;
    if (deletableIds.length > 0) {
      // RegisteredUser is now global; delete the global rows (profiles/assignments cascade or are cleaned separately).
      const deleted = await prisma.registeredUser.deleteMany({
        where: { id: { in: deletableIds } },
      });
      deletedCreated = deleted.count;
    }

    await prisma.coachImportBatch.update({
      where: { id: importBatchId },
      data: { undoneAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      importBatchId,
      deletedCreated,
      revertedUpdated,
      removedAssignments,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to undo import: ${message}` },
      { status: 500 },
    );
  }
}
