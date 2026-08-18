import { NextRequest, NextResponse } from "next/server";
import { ensureAdminModule, isMasterAdminActor } from "@/lib/auth/ensureAdminModule";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    // Master admins can see every survey across every org — they're the
    // only actor authorized for cross-tenant data anywhere else in this
    // app, so this mirrors that. Single-tenant admins stay strictly scoped
    // to auth.orgId (the org ensureAdminModule already validated them
    // against — respects the master ?org= switcher, locked to the
    // deployment's own org otherwise). Never trust the raw ?org= query
    // param directly for a non-master admin, or they could pass
    // ?org=<other-org> and read another tenant's surveys.
    // isPublished: true so unpublished/draft surveys never show up in the
    // active survey list — matches the public route, which already only
    // ever serves published surveys.
    const where = isMasterAdminActor(auth)
      ? { isPublished: true }
      : { organizationId: auth.orgId, isPublished: true };

    const surveys = await prisma.survey.findMany({
      where,
      orderBy: [{ season: "asc" }, { createdAt: "desc" }],
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
