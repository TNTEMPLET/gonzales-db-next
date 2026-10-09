import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { springCombinedRequestBlock } from "@/lib/admin/springCombined/view";
import { ADMIN_SESSION_COOKIE, getAdminUserFromCookieToken } from "@/lib/auth/adminSession";
import { loadSeasonMode } from "@/lib/season/loadMode";
import { isSeasonMode, type SeasonMode } from "@/lib/season/mode";
import { saveSeasonModeOverride } from "@/lib/season/saveModeOverride";
import { getSeasonConfigForOrg } from "@/lib/seasonConfig";
import { isContentOrgId } from "@/lib/siteConfig";

async function requireMasterAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const user = await getAdminUserFromCookieToken(token);
  if (!user?.isMaster) return null;
  return user;
}

function rejectSpring(value: string | null | undefined) {
  const blocked = springCombinedRequestBlock(value);
  if (!blocked) return null;
  return NextResponse.json({ error: blocked.error }, { status: blocked.status });
}

export async function GET(request: NextRequest) {
  const user = await requireMasterAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requested = request.nextUrl.searchParams.get("org");
  const springBlock = rejectSpring(requested);
  if (springBlock) return springBlock;
  if (!requested || !isContentOrgId(requested)) {
    return NextResponse.json(
      { error: "Select a league (gonzales, ascension, or fallball)." },
      { status: 400 },
    );
  }

  const snapshot = await loadSeasonMode(requested);
  return NextResponse.json(snapshot);
}

export async function POST(request: NextRequest) {
  const user = await requireMasterAdmin();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const springBlock = rejectSpring(request.nextUrl.searchParams.get("org"));
  if (springBlock) return springBlock;

  const body = (await request.json().catch(() => null)) as {
    organizationId?: unknown;
    seasonModeOverride?: unknown;
  } | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const organizationId = body.organizationId;
  const orgSpringBlock = rejectSpring(typeof organizationId === "string" ? organizationId : null);
  if (orgSpringBlock) return orgSpringBlock;
  if (typeof organizationId !== "string" || !isContentOrgId(organizationId)) {
    return NextResponse.json(
      { error: "Select a league (gonzales, ascension, or fallball)." },
      { status: 400 },
    );
  }

  if (!("seasonModeOverride" in body)) {
    return NextResponse.json({ error: "Choose a season mode, or clear the override." }, { status: 400 });
  }
  const rawOverride = body.seasonModeOverride;
  let seasonModeOverride: SeasonMode | null;
  if (rawOverride == null) {
    seasonModeOverride = null;
  } else if (isSeasonMode(rawOverride)) {
    seasonModeOverride = rawOverride;
  } else {
    return NextResponse.json(
      { error: "Season mode must be Off season, Preseason, In season, or Postseason." },
      { status: 400 },
    );
  }

  const seasonYear = getSeasonConfigForOrg(organizationId).year;
  try {
    await saveSeasonModeOverride({
      organizationId,
      seasonYear,
      seasonModeOverride,
      adminId: user.id,
    });
  } catch (err) {
    console.error(
      "season-mode POST failed",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Season mode override could not be saved." },
      { status: 503 },
    );
  }

  const snapshot = await loadSeasonMode(organizationId);
  return NextResponse.json(snapshot);
}
