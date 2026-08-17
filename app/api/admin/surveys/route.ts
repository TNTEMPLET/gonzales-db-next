import { NextRequest, NextResponse } from "next/server";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const org = searchParams.get("org") || "fallball";

    const surveys = await prisma.survey.findMany({
      where: { organizationId: org },
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
