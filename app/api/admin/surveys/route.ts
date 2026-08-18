import { NextRequest, NextResponse } from "next/server";
import { ensureAdminModule, isMasterAdminActor } from "@/lib/auth/ensureAdminModule";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    // Use the org ensureAdminModule already validated the caller against
    // (respects the master ?org= switcher, locked to the deployment's own
    // org otherwise) — never trust the raw query param directly, or an
    // admin on a non-master deployment could pass ?org=<other-org> and read
    // another tenant's surveys.
    //
    // Narrow exception: Survey.organizationId can also be "apbaseball" —
    // the cross-org Spring survey (Gonzales + Ascension respondents), which
    // isn't a real ContentOrgId auth.orgId can ever resolve to. Only a
    // master admin explicitly asking for it via ?org=apbaseball gets it;
    // everyone else stays strictly on auth.orgId.
    const requestedOrg = request.nextUrl.searchParams.get("org");
    const targetOrg =
      requestedOrg === "apbaseball" && isMasterAdminActor(auth) ? "apbaseball" : auth.orgId;

    const surveys = await prisma.survey.findMany({
      where: { organizationId: targetOrg },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { responses: true },
        },
      },
    });

    return NextResponse.json({ surveys });
  } catch (error) {
    console.error("Error fetching admin surveys:", error);
    return NextResponse.json(
      { error: "Failed to load admin surveys" },
      { status: 500 }
    );
  }
}
