import { NextRequest, NextResponse } from "next/server";
import type { SponsorPackageType } from "@prisma/client";

import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg, type ContentOrgId } from "@/lib/siteConfig";
import { getSponsorTemplate } from "@/lib/sponsors/templates";

type SponsorPatchPayload = {
  businessName?: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  logoMimeType?: string | null;
  logoAlt?: string | null;
  notes?: string | null;
  isActive?: boolean;
  startAt?: string | null;
  endAt?: string | null;
  orgTargets?: string[];
  packageType?: SponsorPackageType;
  packageLabel?: string | null;
  minimumCommitmentCents?: number | null;
  amountCents?: number | null;
  additionalTeamAmountCents?: number | null;
  twoYearCommitmentAmountCents?: number | null;
  includesWebsiteLogo?: boolean;
  includesSocialRecognition?: boolean;
  includesUniformName?: boolean;
  includesFieldSignage?: boolean;
  includesSeasonScheduleName?: boolean;
  includesAllStarMention?: boolean;
  packageNotes?: string | null;
  showInFooterScroller?: boolean;
  sortOrder?: number;
};

const VALID_ORGS: ContentOrgId[] = ["gonzales", "ascension"];

function toNullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseDateValue(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseOrgTargets(input: unknown) {
  if (!Array.isArray(input)) return null;
  const deduped = Array.from(
    new Set(input.filter((value): value is ContentOrgId => VALID_ORGS.includes(value as ContentOrgId))),
  );
  return deduped.length > 0 ? deduped : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminModule(request, "SPONSORS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const { id } = await params;
  try {
    const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
    const existing = await prisma.sponsor.findFirst({
      where: {
        id,
        placements: { some: { organizationId: targetOrg } },
      },
      include: {
        packageEnrollment: true,
        placements: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Sponsor not found" }, { status: 404 });
    }

    const body = (await request.json()) as SponsorPatchPayload;
    const packageType = body.packageType || existing.packageEnrollment?.packageType || "CUSTOM";
    const template = getSponsorTemplate(packageType);
    const orgTargets = parseOrgTargets(body.orgTargets);
    const sortOrder =
      typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
        ? Math.floor(body.sortOrder)
        : null;

    const sponsor = await prisma.$transaction(async (tx) => {
      const updated = await tx.sponsor.update({
        where: { id },
        data: {
          businessName: body.businessName?.trim() || undefined,
          contactName:
            body.contactName === undefined
              ? undefined
              : toNullableString(body.contactName),
          contactEmail:
            body.contactEmail === undefined
              ? undefined
              : toNullableString(body.contactEmail)?.toLowerCase() || null,
          contactPhone:
            body.contactPhone === undefined
              ? undefined
              : toNullableString(body.contactPhone),
          websiteUrl:
            body.websiteUrl === undefined
              ? undefined
              : toNullableString(body.websiteUrl),
          logoUrl:
            body.logoUrl === undefined ? undefined : toNullableString(body.logoUrl),
          logoMimeType:
            body.logoMimeType === undefined
              ? undefined
              : toNullableString(body.logoMimeType),
          logoAlt:
            body.logoAlt === undefined ? undefined : toNullableString(body.logoAlt),
          notes: body.notes === undefined ? undefined : toNullableString(body.notes),
          isActive: body.isActive,
          startAt:
            body.startAt === undefined
              ? undefined
              : parseDateValue(body.startAt || null),
          endAt:
            body.endAt === undefined
              ? undefined
              : parseDateValue(body.endAt || null),
        },
      });

      if (existing.packageEnrollment) {
        await tx.sponsorPackageEnrollment.update({
          where: { sponsorId: id },
          data: {
            packageType,
            packageLabel:
              body.packageLabel === undefined
                ? undefined
                : toNullableString(body.packageLabel) || template?.label || "Custom",
            minimumCommitmentCents:
              body.minimumCommitmentCents === undefined
                ? undefined
                : body.minimumCommitmentCents,
            amountCents: body.amountCents === undefined ? undefined : body.amountCents,
            additionalTeamAmountCents:
              body.additionalTeamAmountCents === undefined
                ? undefined
                : body.additionalTeamAmountCents,
            twoYearCommitmentAmountCents:
              body.twoYearCommitmentAmountCents === undefined
                ? undefined
                : body.twoYearCommitmentAmountCents,
            includesWebsiteLogo:
              body.includesWebsiteLogo === undefined
                ? undefined
                : body.includesWebsiteLogo,
            includesSocialRecognition:
              body.includesSocialRecognition === undefined
                ? undefined
                : body.includesSocialRecognition,
            includesUniformName:
              body.includesUniformName === undefined
                ? undefined
                : body.includesUniformName,
            includesFieldSignage:
              body.includesFieldSignage === undefined
                ? undefined
                : body.includesFieldSignage,
            includesSeasonScheduleName:
              body.includesSeasonScheduleName === undefined
                ? undefined
                : body.includesSeasonScheduleName,
            includesAllStarMention:
              body.includesAllStarMention === undefined
                ? undefined
                : body.includesAllStarMention,
            notes:
              body.packageNotes === undefined
                ? undefined
                : toNullableString(body.packageNotes),
          },
        });
      } else {
        await tx.sponsorPackageEnrollment.create({
          data: {
            sponsorId: id,
            packageType,
            packageLabel:
              toNullableString(body.packageLabel) || template?.label || "Custom",
            minimumCommitmentCents:
              body.minimumCommitmentCents ?? template?.minimumCommitmentCents ?? null,
            amountCents: body.amountCents ?? template?.defaultAmountCents ?? null,
            additionalTeamAmountCents:
              body.additionalTeamAmountCents ??
              template?.additionalTeamAmountCents ??
              null,
            twoYearCommitmentAmountCents:
              body.twoYearCommitmentAmountCents ??
              template?.twoYearCommitmentAmountCents ??
              null,
            includesWebsiteLogo:
              body.includesWebsiteLogo ?? template?.includesWebsiteLogo ?? true,
            includesSocialRecognition:
              body.includesSocialRecognition ??
              template?.includesSocialRecognition ??
              false,
            includesUniformName:
              body.includesUniformName ?? template?.includesUniformName ?? false,
            includesFieldSignage:
              body.includesFieldSignage ?? template?.includesFieldSignage ?? false,
            includesSeasonScheduleName:
              body.includesSeasonScheduleName ??
              template?.includesSeasonScheduleName ??
              false,
            includesAllStarMention:
              body.includesAllStarMention ?? template?.includesAllStarMention ?? false,
            notes: toNullableString(body.packageNotes),
          },
        });
      }

      if (orgTargets) {
        await tx.sponsorPlacement.deleteMany({ where: { sponsorId: id } });
        const showInFooterScroller =
          body.showInFooterScroller ??
          existing.placements[0]?.showInFooterScroller ??
          true;
        await tx.sponsorPlacement.createMany({
          data: orgTargets.map((organizationId) => ({
            sponsorId: id,
            organizationId,
            showInFooterScroller,
            sortOrder: sortOrder ?? existing.placements[0]?.sortOrder ?? 100,
          })),
        });
      } else if (
        body.showInFooterScroller !== undefined ||
        sortOrder !== null
      ) {
        await tx.sponsorPlacement.updateMany({
          where: { sponsorId: id },
          data: {
            showInFooterScroller:
              body.showInFooterScroller === undefined
                ? undefined
                : body.showInFooterScroller,
            sortOrder: sortOrder === null ? undefined : sortOrder,
          },
        });
      }

      return updated;
    });

    const hydrated = await prisma.sponsor.findUnique({
      where: { id: sponsor.id },
      include: {
        packageEnrollment: true,
        placements: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        },
      },
    });
    return NextResponse.json({ data: hydrated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to update sponsor: ${message}` },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminModule(request, "SPONSORS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const { id } = await params;
  try {
    const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
    const existing = await prisma.sponsor.findFirst({
      where: { id, placements: { some: { organizationId: targetOrg } } },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Sponsor not found" }, { status: 404 });
    }

    await prisma.sponsor.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to delete sponsor: ${message}` },
      { status: 500 },
    );
  }
}
