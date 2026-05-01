import { NextRequest, NextResponse } from "next/server";

import { getActiveSponsorScrollerItems } from "@/lib/sponsors/server";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

export async function GET(request: NextRequest) {
  try {
    const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
    const data = await getActiveSponsorScrollerItems(targetOrg);
    return NextResponse.json({ data, targetOrg });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to load sponsor scroller: ${message}` },
      { status: 500 },
    );
  }
}
