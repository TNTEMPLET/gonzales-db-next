import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAccess } from "@/lib/allStar/auth";
import prisma from "@/lib/prisma";

export type PlayerSearchResult = {
  id: string;
  playerFullName: string;
  ageGroup: string;
  team: string;
  rosterTag: string | null;
  organizationId: string;
  isPaid: boolean;
  paidAt: string | null;
  paypalTxId: string | null;
  payerName: string | null;
  amountCents: number;
};

export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAccess(request, { needsManage: false });
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  // Search by player full name (case-insensitive)
  const records = await prisma.allStarPayment.findMany({
    where: {
      playerFullName: { contains: q, mode: "insensitive" },
    },
    select: {
      id: true,
      playerFullName: true,
      ageGroup: true,
      team: true,
      rosterTag: true,
      organizationId: true,
      isPaid: true,
      paidAt: true,
      paypalTxId: true,
      payerName: true,
      amountCents: true,
    },
    orderBy: [{ isPaid: "asc" }, { playerFullName: "asc" }],
    take: 25,
  });

  const results: PlayerSearchResult[] = records.map((r) => ({
    ...r,
    paidAt: r.paidAt?.toISOString() ?? null,
  }));

  return NextResponse.json({ results });
}
