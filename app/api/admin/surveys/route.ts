import { NextRequest, NextResponse } from "next/server";
import { ensureAdminModule, isMasterAdminActor } from "@/lib/auth/ensureAdminModule";
import prisma from "@/lib/prisma";
import { isSurveyOrgId, isSurveySeason } from "@/lib/surveys/constants";
import { validateSections, type SectionInput } from "@/lib/surveys/validate";

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
    // isPublished: true by default so stray unpublished/draft surveys never
    // show up in the day-to-day analytics list — matches the public route,
    // which already only ever serves published surveys. The Survey Manager
    // UI opts into ?includeUnpublished=true so drafts it just created (or
    // needs to edit/publish) are still reachable — without this, a draft
    // would become invisible/unmanageable the moment it's created.
    const includeUnpublished = request.nextUrl.searchParams.get("includeUnpublished") === "true";
    const where = isMasterAdminActor(auth)
      ? { isPublished: includeUnpublished ? undefined : true }
      : { organizationId: auth.orgId, isPublished: includeUnpublished ? undefined : true };

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

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const seasonYear = typeof body.seasonYear === "number" ? body.seasonYear : Number(body.seasonYear);

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return NextResponse.json(
      { error: "slug is required and must be lowercase letters, numbers, and hyphens only" },
      { status: 400 },
    );
  }
  const season = body.season;
  if (!isSurveySeason(season)) {
    return NextResponse.json({ error: "season must be SPRING or FALL" }, { status: 400 });
  }
  if (!Number.isFinite(seasonYear) || seasonYear < 2000 || seasonYear > 2100) {
    return NextResponse.json({ error: "seasonYear must be a valid year" }, { status: 400 });
  }

  // Non-master admins can only create surveys for their own tenant, regardless
  // of what organizationId the request body claims — mirrors the read-side
  // scoping on GET immediately above. Master admins may target any real
  // survey org, including the cross-org "apbaseball" pseudo-org.
  const rawOrganizationId = body.organizationId;
  const organizationId = isMasterAdminActor(auth)
    ? (isSurveyOrgId(rawOrganizationId) ? rawOrganizationId : null)
    : auth.orgId;
  if (!organizationId) {
    return NextResponse.json({ error: "Invalid organizationId" }, { status: 400 });
  }

  let sections: SectionInput[] = [];
  if (body.sections !== undefined) {
    const result = validateSections(body.sections);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    sections = result.sections;
  }

  try {
    const survey = await prisma.survey.create({
      data: {
        organizationId,
        season,
        seasonYear,
        title,
        description: typeof body.description === "string" ? body.description.trim() || null : null,
        slug,
        isPublished: body.isPublished === true,
        isAnonymous: body.isAnonymous !== false,
        sections: {
          create: sections.map((section) => ({
            order: section.order,
            title: section.title,
            description: section.description,
            questions: {
              create: section.questions.map((q) => ({
                order: q.order,
                questionText: q.questionText,
                type: q.type,
                isRequired: q.isRequired,
                matrixTopics: q.matrixTopics,
                options: q.options,
              })),
            },
          })),
        },
      },
      include: { sections: { include: { questions: true } } },
    });

    return NextResponse.json({ survey }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Object &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A survey with this slug already exists for this organization" },
        { status: 409 },
      );
    }
    console.error("Error creating survey:", error);
    return NextResponse.json({ error: "Failed to create survey" }, { status: 500 });
  }
}
