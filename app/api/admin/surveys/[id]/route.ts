import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import {
  ensureAdminModule,
  isMasterAdminActor,
  type EnsureAdminResult,
} from "@/lib/auth/ensureAdminModule";
import prisma from "@/lib/prisma";
import { isSurveySeason } from "@/lib/surveys/constants";
import { validateSections, type SectionInput } from "@/lib/surveys/validate";

type OkAuth = Extract<EnsureAdminResult, { ok: true }>;

async function loadScopedSurvey(id: string, auth: OkAuth, isMaster: boolean) {
  return prisma.survey.findFirst({
    where: isMaster ? { id } : { id, organizationId: auth.orgId },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: {
          questions: {
            orderBy: { order: "asc" },
            include: { _count: { select: { answers: true } } },
          },
        },
      },
      _count: { select: { responses: true } },
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const survey = await loadScopedSurvey(id, auth, isMasterAdminActor(auth));
  if (!survey) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  }

  return NextResponse.json({ survey });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const existing = await loadScopedSurvey(id, auth, isMasterAdminActor(auth));
  if (!existing) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // organizationId is intentionally not editable here — changing which
  // tenant a survey belongs to after responses may already exist under its
  // original org would misattribute historical data, so a re-target is a
  // delete-and-recreate, not an edit.
  const scalarData: Prisma.SurveyUpdateInput = {};

  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    }
    scalarData.title = title;
  }

  if (body.description !== undefined) {
    scalarData.description =
      typeof body.description === "string" ? body.description.trim() || null : null;
  }

  if (body.slug !== undefined) {
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      return NextResponse.json(
        { error: "slug must be lowercase letters, numbers, and hyphens only" },
        { status: 400 },
      );
    }
    scalarData.slug = slug;
  }

  if (body.season !== undefined) {
    const season = body.season;
    if (!isSurveySeason(season)) {
      return NextResponse.json({ error: "season must be SPRING or FALL" }, { status: 400 });
    }
    scalarData.season = season;
  }

  if (body.seasonYear !== undefined) {
    const seasonYear = typeof body.seasonYear === "number" ? body.seasonYear : Number(body.seasonYear);
    if (!Number.isFinite(seasonYear) || seasonYear < 2000 || seasonYear > 2100) {
      return NextResponse.json({ error: "seasonYear must be a valid year" }, { status: 400 });
    }
    scalarData.seasonYear = seasonYear;
  }

  if (body.isPublished !== undefined) {
    scalarData.isPublished = body.isPublished === true;
  }

  if (body.isAnonymous !== undefined) {
    scalarData.isAnonymous = body.isAnonymous !== false;
  }

  let sections: SectionInput[] | null = null;
  if (body.sections !== undefined) {
    const result = validateSections(body.sections);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    sections = result.sections;
  }

  try {
    if (sections !== null) {
      // Reconcile sections/questions against what already exists rather than
      // delete-and-recreate everything: SurveyQuestion cascades to
      // SurveyAnswer on delete, so blindly replacing questions would silently
      // destroy real submitted response data tied to the old question ids.
      // Any existing question carrying answers is protected from deletion —
      // editing its text/options in place is still allowed, removing it is not.
      const incomingSectionIds = new Set(sections.map((s) => s.id).filter(Boolean));
      const incomingQuestionIds = new Set(
        sections.flatMap((s) => s.questions.map((q) => q.id)).filter(Boolean),
      );

      const sectionsToDelete = existing.sections.filter((s) => !incomingSectionIds.has(s.id));
      const questionsToDeleteFromKeptSections = existing.sections
        .filter((s) => incomingSectionIds.has(s.id))
        .flatMap((s) => s.questions)
        .filter((q) => !incomingQuestionIds.has(q.id));

      const questionsWithAnswersBeingRemoved = [
        ...sectionsToDelete.flatMap((s) => s.questions),
        ...questionsToDeleteFromKeptSections,
      ].filter((q) => q._count.answers > 0);

      if (questionsWithAnswersBeingRemoved.length > 0) {
        return NextResponse.json(
          {
            error:
              "Cannot remove questions that already have submitted responses: " +
              questionsWithAnswersBeingRemoved.map((q) => q.questionText).join("; "),
          },
          { status: 409 },
        );
      }

      await prisma.$transaction(async (tx) => {
        for (const section of sectionsToDelete) {
          await tx.surveySection.delete({ where: { id: section.id } });
        }
        for (const question of questionsToDeleteFromKeptSections) {
          await tx.surveyQuestion.delete({ where: { id: question.id } });
        }

        for (const section of sections!) {
          if (section.id) {
            await tx.surveySection.update({
              where: { id: section.id },
              data: { order: section.order, title: section.title, description: section.description },
            });
          }
          const sectionId = section.id
            ? section.id
            : (
                await tx.surveySection.create({
                  data: {
                    surveyId: id,
                    order: section.order,
                    title: section.title,
                    description: section.description,
                  },
                })
              ).id;

          for (const question of section.questions) {
            if (question.id) {
              await tx.surveyQuestion.update({
                where: { id: question.id },
                data: {
                  order: question.order,
                  questionText: question.questionText,
                  type: question.type,
                  isRequired: question.isRequired,
                  matrixTopics: question.matrixTopics,
                  options: question.options,
                },
              });
            } else {
              await tx.surveyQuestion.create({
                data: {
                  sectionId,
                  order: question.order,
                  questionText: question.questionText,
                  type: question.type,
                  isRequired: question.isRequired,
                  matrixTopics: question.matrixTopics,
                  options: question.options,
                },
              });
            }
          }
        }

        if (Object.keys(scalarData).length > 0) {
          await tx.survey.update({ where: { id }, data: scalarData });
        }
      });
    } else if (Object.keys(scalarData).length > 0) {
      await prisma.survey.update({ where: { id }, data: scalarData });
    }

    const survey = await loadScopedSurvey(id, auth, isMasterAdminActor(auth));
    return NextResponse.json({ survey });
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
    console.error("Error updating survey:", error);
    return NextResponse.json({ error: "Failed to update survey" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { id } = await params;
  const existing = await loadScopedSurvey(id, auth, isMasterAdminActor(auth));
  if (!existing) {
    return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine for a delete with zero responses.
  }

  // Mirrors scripts/seed-2026-spring-and-fall-surveys.mjs's own refusal to
  // delete a survey with existing responses — deleting a Survey cascades
  // through SurveySection/SurveyQuestion/SurveyResponse/SurveyAnswer, so this
  // is the last guard before real family feedback is permanently destroyed.
  if (existing._count.responses > 0 && body.force !== true) {
    return NextResponse.json(
      {
        error: `This survey has ${existing._count.responses} submitted response(s). Pass force: true to permanently delete the survey and all of its responses.`,
        responseCount: existing._count.responses,
      },
      { status: 409 },
    );
  }

  await prisma.survey.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
