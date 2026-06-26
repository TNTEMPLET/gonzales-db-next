import type { CommunicationChannel } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { getTournamentAlertProviderStatus } from "@/lib/tournament-monitor/alertSender";
import { hashMonitorStatus, publishTournamentMonitorEvent } from "@/lib/tournament-monitor/events";

type MonitorBody = {
  action?: "save-subscription" | "delete-subscription" | "test-alert";
  id?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  channels?: CommunicationChannel[];
  active?: boolean;
};

function authorized(request: NextRequest) {
  return ensureAdminModule(request, "SCORES");
}

function normalizeChannels(channels: unknown): CommunicationChannel[] {
  if (!Array.isArray(channels)) return ["EMAIL"];
  const out = channels.filter((channel): channel is CommunicationChannel => channel === "EMAIL" || channel === "SMS");
  return out.length > 0 ? out : ["EMAIL"];
}

export async function GET(request: NextRequest) {
  const auth = await authorized(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const [subscriptions, events, lastRun] = await Promise.all([
    prisma.tournamentMonitorSubscription.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.tournamentMonitorEvent.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.tournamentMonitorRun.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);

  return NextResponse.json({
    data: {
      providerStatus: getTournamentAlertProviderStatus(),
      subscriptions,
      events,
      lastRun,
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await authorized(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await request.json()) as MonitorBody;
  if (body.action === "delete-subscription") {
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    await prisma.tournamentMonitorSubscription.delete({ where: { id: body.id } });
    return NextResponse.json({ success: true });
  }

  if (body.action === "test-alert") {
    const payload = { triggeredAt: new Date().toISOString(), source: "admin-test" };
    const published = await publishTournamentMonitorEvent({
      type: "LIVE_HEARTBEAT",
      organizationId: "master",
      eventKey: `TEST_ALERT:${hashMonitorStatus(payload)}:${Date.now()}`,
      statusHash: hashMonitorStatus(payload),
      title: "AP Baseball tournament alert test",
      message: "This is a test tournament alert from the Master Scores module. Email and SMS delivery are working if you received this.",
      payload,
    });
    return NextResponse.json({ success: true, data: published });
  }

  const name = body.name?.trim() || "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const data = {
    name,
    email: body.email?.trim() || null,
    phone: body.phone?.trim() || null,
    channels: normalizeChannels(body.channels),
    active: body.active !== false,
  };
  if (!data.email && !data.phone) {
    return NextResponse.json({ error: "email or phone is required" }, { status: 400 });
  }

  const saved = body.id
    ? await prisma.tournamentMonitorSubscription.update({ where: { id: body.id }, data })
    : await prisma.tournamentMonitorSubscription.create({ data });
  return NextResponse.json({ success: true, data: saved });
}
