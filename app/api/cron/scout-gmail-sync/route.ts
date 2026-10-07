import { NextRequest, NextResponse } from "next/server";

import { scoutCronAccess } from "@/lib/scout/cronAuth";
import { runScoutMailboxSync } from "@/lib/scout/runSync";
import { getOrgId } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const decision = scoutCronAccess({
    orgId: getOrgId(),
    authorizationHeader: request.headers.get("authorization"),
    cronSecret: process.env.CRON_SECRET,
  });

  if (decision.action === "skip") {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Cron only runs on the master deployment",
    });
  }

  if (decision.action === "deny") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runScoutMailboxSync();
  return NextResponse.json(result);
}
