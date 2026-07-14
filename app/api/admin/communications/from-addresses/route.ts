import { NextRequest, NextResponse } from "next/server";

import { resolveCommunicationActor } from "@/lib/communications/authz";
import {
  listFromAddressRows,
  setDefaultFromAddress,
  validateFromHeader,
} from "@/lib/communications/fromAddresses";
import { canMasterBypassApproval } from "@/lib/communications/policy";
import prisma from "@/lib/prisma";

function requireMaster(actor: { ok: true; role: string | null; admin: { isMaster: boolean; id: string } }) {
  if (actor.admin.isMaster || canMasterBypassApproval(actor.role as never)) {
    return null;
  }
  return NextResponse.json({ error: "Master Admin required" }, { status: 403 });
}

/** List From options. All COMMUNICATIONS admins can read active; Master gets all when includeInactive=1. */
export async function GET(request: NextRequest) {
  const actor = await resolveCommunicationActor(request);
  if (!actor.ok) return NextResponse.json({ error: actor.message }, { status: actor.status });

  const includeInactive =
    request.nextUrl.searchParams.get("includeInactive") === "1" &&
    (actor.admin.isMaster || canMasterBypassApproval(actor.role));

  const rows = await listFromAddressRows(includeInactive);
  const defaultRow = rows.find((r) => r.isDefault && r.isActive) || rows.find((r) => r.isActive);
  return NextResponse.json({
    data: rows,
    defaultFrom: defaultRow?.fromHeader ?? null,
  });
}

/** Create a From option — Master Admin only. */
export async function POST(request: NextRequest) {
  const actor = await resolveCommunicationActor(request);
  if (!actor.ok) return NextResponse.json({ error: actor.message }, { status: actor.status });
  const denied = requireMaster(actor);
  if (denied) return denied;

  const body = (await request.json()) as {
    fromHeader?: string;
    label?: string | null;
    isDefault?: boolean;
    isActive?: boolean;
    sortOrder?: number;
  };

  const validated = validateFromHeader(body.fromHeader || "");
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const existing = await prisma.communicationFromAddress.findUnique({
    where: { fromHeader: validated.fromHeader },
  });
  if (existing) {
    return NextResponse.json({ error: "That From address already exists" }, { status: 409 });
  }

  const sortOrder =
    typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
      ? Math.trunc(body.sortOrder)
      : ((await prisma.communicationFromAddress.aggregate({ _max: { sortOrder: true } }))._max
          .sortOrder ?? 0) + 10;

  const makeDefault = Boolean(body.isDefault);
  if (makeDefault) {
    await prisma.communicationFromAddress.updateMany({ data: { isDefault: false } });
  }

  const created = await prisma.communicationFromAddress.create({
    data: {
      fromHeader: validated.fromHeader,
      label: body.label?.trim() || null,
      isDefault: makeDefault,
      isActive: body.isActive === false ? false : true,
      sortOrder,
      createdByAdminId: actor.admin.id,
    },
  });

  // Ensure at least one default exists
  const anyDefault = await prisma.communicationFromAddress.count({
    where: { isDefault: true, isActive: true },
  });
  if (anyDefault === 0 && created.isActive) {
    await setDefaultFromAddress(created.id);
  }

  return NextResponse.json({ success: true, data: created });
}

/** Bulk helper not needed — PATCH/DELETE on [id]. */
export async function PATCH() {
  return NextResponse.json({ error: "Use /from-addresses/:id" }, { status: 405 });
}
