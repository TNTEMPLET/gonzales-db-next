import { NextRequest, NextResponse } from "next/server";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
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
    const surveys = await prisma.survey.findMany({
      where: { organizationId: auth.orgId },
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
