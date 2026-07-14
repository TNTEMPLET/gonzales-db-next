import { NextRequest, NextResponse } from "next/server";

import { resolveCommunicationActor } from "@/lib/communications/authz";
import {
  setDefaultFromAddress,
  validateFromHeader,
} from "@/lib/communications/fromAddresses";
import { canMasterBypassApproval } from "@/lib/communications/policy";
import prisma from "@/lib/prisma";

function requireMaster(actor: { admin: { isMaster: boolean }; role: string | null }) {
  if (actor.admin.isMaster || canMasterBypassApproval(actor.role as never)) {
    return null;
  }
  return NextResponse.json({ error: "Master Admin required" }, { status: 403 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await resolveCommunicationActor(request);
  if (!actor.ok) return NextResponse.json({ error: actor.message }, { status: actor.status });
  const denied = requireMaster(actor);
  if (denied) return denied;

  const { id } = await params;
  const existing = await prisma.communicationFromAddress.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json()) as {
    fromHeader?: string;
    label?: string | null;
    isDefault?: boolean;
    isActive?: boolean;
    sortOrder?: number;
  };

  let fromHeader = existing.fromHeader;
  if (body.fromHeader !== undefined) {
    const validated = validateFromHeader(body.fromHeader);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    fromHeader = validated.fromHeader;
    if (fromHeader !== existing.fromHeader) {
      const clash = await prisma.communicationFromAddress.findUnique({
        where: { fromHeader },
      });
      if (clash && clash.id !== id) {
        return NextResponse.json({ error: "That From address already exists" }, { status: 409 });
      }
    }
  }

  const makeDefault = body.isDefault === true;
  if (makeDefault) {
    await prisma.communicationFromAddress.updateMany({
      where: { id: { not: id } },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.communicationFromAddress.update({
    where: { id },
    data: {
      fromHeader,
      label: body.label === undefined ? existing.label : body.label?.trim() || null,
      isDefault: body.isDefault === undefined ? existing.isDefault : Boolean(body.isDefault),
      isActive: body.isActive === undefined ? existing.isActive : Boolean(body.isActive),
      sortOrder:
        typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
          ? Math.trunc(body.sortOrder)
          : existing.sortOrder,
    },
  });

  // If we deactivated the only default, promote another active row
  if (!updated.isActive || !updated.isDefault) {
    const defaults = await prisma.communicationFromAddress.count({
      where: { isDefault: true, isActive: true },
    });
    if (defaults === 0) {
      const next = await prisma.communicationFromAddress.findFirst({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      if (next) await setDefaultFromAddress(next.id);
    }
  }

  const fresh = await prisma.communicationFromAddress.findUnique({ where: { id } });
  return NextResponse.json({ success: true, data: fresh });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await resolveCommunicationActor(request);
  if (!actor.ok) return NextResponse.json({ error: actor.message }, { status: actor.status });
  const denied = requireMaster(actor);
  if (denied) return denied;

  const { id } = await params;
  const existing = await prisma.communicationFromAddress.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const activeCount = await prisma.communicationFromAddress.count({
    where: { isActive: true },
  });
  if (existing.isActive && activeCount <= 1) {
    return NextResponse.json(
      { error: "Cannot delete the last active From address" },
      { status: 409 },
    );
  }

  await prisma.communicationFromAddress.delete({ where: { id } });

  if (existing.isDefault) {
    const next = await prisma.communicationFromAddress.findFirst({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    if (next) await setDefaultFromAddress(next.id);
  }

  return NextResponse.json({ success: true });
}
