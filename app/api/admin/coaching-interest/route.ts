import type { CoachingInterestRolePreference, CoachingInterestStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { toCsvDocument } from "@/lib/export/csv";
import prisma from "@/lib/prisma";
import { isCoachingInterestEnabled } from "@/lib/org/capabilities";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";

const STATUSES = new Set(["NEW", "CONTACTED", "NOT_INTERESTED", "CONVERTED", "ARCHIVED"]);
const ROLE_PREFERENCES = new Set(["HEAD_COACH", "ASSISTANT_COACH", "EITHER"]);

function enumValue<T extends string>(value: string | null, allowed: Set<string>): T | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();
  return allowed.has(normalized) ? (normalized as T) : undefined;
}

function clean(value: unknown, maxLength = 1000) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : "";
}

function toCsv(rows: Awaited<ReturnType<typeof listSubmissions>>) {
  return toCsvDocument(
    [
      "Status",
      "First Name",
      "Last Name",
      "Email",
      "Cell Phone",
      "Interested Division",
      "Role Preference",
      "Coached Before",
      "Prior Division",
      "Notes",
      "Admin Notes",
      "Submitted At",
      "Updated At",
    ],
    rows.map((row) => [
      row.status,
      row.firstName,
      row.lastName,
      row.email,
      row.cellPhone,
      row.interestedDivision,
      row.rolePreference,
      row.hasCoachedBefore ? "Yes" : "No",
      row.priorDivision,
      row.notes,
      row.adminNotes,
      row.createdAt.toISOString(),
      row.updatedAt.toISOString(),
    ]),
  ).trimEnd();
}

async function listSubmissions(request: NextRequest) {
  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  const status = enumValue<CoachingInterestStatus>(
    request.nextUrl.searchParams.get("status"),
    STATUSES,
  );
  const rolePreference = enumValue<CoachingInterestRolePreference>(
    request.nextUrl.searchParams.get("rolePreference"),
    ROLE_PREFERENCES,
  );
  const division = clean(request.nextUrl.searchParams.get("division"), 120);
  const search = clean(request.nextUrl.searchParams.get("search"), 120);

  return prisma.coachingInterestSubmission.findMany({
    where: {
      organizationId: targetOrg,
      status,
      rolePreference,
      interestedDivision: division
        ? { contains: division, mode: "insensitive" }
        : undefined,
      OR: search
        ? [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { cellPhone: { contains: search, mode: "insensitive" } },
            { interestedDivision: { contains: search, mode: "insensitive" } },
            { priorDivision: { contains: search, mode: "insensitive" } },
          ]
        : undefined,
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 1000,
  });
}

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  if (!isCoachingInterestEnabled(targetOrg)) {
    return NextResponse.json(
      { error: "Coaching interest is not enabled for this organization." },
      { status: 404 },
    );
  }

  const rows = await listSubmissions(request);
  if (request.nextUrl.searchParams.get("format") === "csv") {
    return new NextResponse(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="fallball-coaching-interest.csv"',
      },
    });
  }

  return NextResponse.json({ data: rows });
}

export async function PATCH(request: NextRequest) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  if (!isCoachingInterestEnabled(targetOrg)) {
    return NextResponse.json(
      { error: "Coaching interest is not enabled for this organization." },
      { status: 404 },
    );
  }
  const body = (await request.json()) as {
    id?: string;
    status?: CoachingInterestStatus;
    adminNotes?: string | null;
  };
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const status = enumValue<CoachingInterestStatus>(body.status ?? null, STATUSES);
  if (body.status && !status) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const existing = await prisma.coachingInterestSubmission.findUnique({
    where: { id: body.id },
    select: { id: true, organizationId: true, status: true },
  });
  if (!existing || existing.organizationId !== targetOrg) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  const updated = await prisma.coachingInterestSubmission.update({
    where: { id: existing.id },
    data: {
      status,
      adminNotes:
        body.adminNotes === undefined ? undefined : clean(body.adminNotes, 2000) || null,
      contactedAt:
        status === "CONTACTED" && existing.status !== "CONTACTED" ? new Date() : undefined,
      convertedAt:
        status === "CONVERTED" && existing.status !== "CONVERTED" ? new Date() : undefined,
    },
  });

  return NextResponse.json({ data: updated });
}
