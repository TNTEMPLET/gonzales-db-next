import { NextRequest, NextResponse } from "next/server";

import { SCOUT_MAILBOX } from "@/lib/scout/config";
import prisma from "@/lib/prisma";
import { loadScoutPage } from "@/lib/scout/queries";
import { requireScoutApi } from "@/lib/scout/requireScout";
import { parseScoutTicketPatch } from "@/lib/scout/ticketPatch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireScoutApi(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const page = await loadScoutPage({ ticketId: id });
  if (page.storageMessage) {
    return NextResponse.json({ error: page.storageMessage }, { status: 503 });
  }
  if (!page.selected) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ticket: page.selected });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireScoutApi(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = parseScoutTicketPatch(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const existing = await prisma.scoutTicket.findFirst({
      where: { id, mailbox: SCOUT_MAILBOX },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.scoutTicket.update({
      where: { id },
      data: {
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        ...(parsed.data.orgTag !== undefined ? { orgTag: parsed.data.orgTag } : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
      },
    });
  } catch (err) {
    console.error("[scout] ticket update failed", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ error: "Could not update the ticket." }, { status: 500 });
  }

  const page = await loadScoutPage({ ticketId: id });
  return NextResponse.json({ ticket: page.selected });
}
