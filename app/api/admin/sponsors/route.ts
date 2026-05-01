import { NextRequest, NextResponse } from "next/server";
import type { SponsorPackageType } from "@prisma/client";

import { ensureAdminModule } from "@/lib/news/auth";
import prisma from "@/lib/prisma";
import { resolveAdminTargetOrg, type ContentOrgId } from "@/lib/siteConfig";
import { getSponsorTemplate } from "@/lib/sponsors/templates";

type SponsorUpsertPayload = {
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

function parseOrgTargets(input: unknown, fallbackOrg: ContentOrgId) {
  if (!Array.isArray(input)) return [fallbackOrg];
  const deduped = Array.from(
    new Set(input.filter((value): value is ContentOrgId => VALID_ORGS.includes(value as ContentOrgId))),
  );
  return deduped.length > 0 ? deduped : [fallbackOrg];
}

function serializeSponsor(sponsor: {
  id: string;
  businessName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  logoMimeType: string | null;
  logoAlt: string | null;
  notes: string | null;
  isActive: boolean;
  startAt: Date | null;
  endAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  packageEnrollment: null | {
    id: string;
    packageType: SponsorPackageType;
    packageLabel: string;
    minimumCommitmentCents: number | null;
    amountCents: number | null;
    additionalTeamAmountCents: number | null;
    twoYearCommitmentAmountCents: number | null;
    includesWebsiteLogo: boolean;
    includesSocialRecognition: boolean;
    includesUniformName: boolean;
    includesFieldSignage: boolean;
    includesSeasonScheduleName: boolean;
    includesAllStarMention: boolean;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  placements: Array<{
    id: string;
    organizationId: string;
    showInFooterScroller: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
}) {
  return {
    ...sponsor,
    startAt: sponsor.startAt?.toISOString() || null,
    endAt: sponsor.endAt?.toISOString() || null,
    createdAt: sponsor.createdAt.toISOString(),
    updatedAt: sponsor.updatedAt.toISOString(),
    packageEnrollment: sponsor.packageEnrollment
      ? {
          ...sponsor.packageEnrollment,
          createdAt: sponsor.packageEnrollment.createdAt.toISOString(),
          updatedAt: sponsor.packageEnrollment.updatedAt.toISOString(),
        }
      : null,
    placements: sponsor.placements.map((placement) => ({
      ...placement,
      createdAt: placement.createdAt.toISOString(),
      updatedAt: placement.updatedAt.toISOString(),
    })),
  };
}

export async function GET(request: NextRequest) {
  const auth = await ensureAdminModule(request, "SPONSORS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  try {
    const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
    const sponsors = await prisma.sponsor.findMany({
      where: {
        placements: {
          some: { organizationId: targetOrg },
        },
      },
      include: {
        packageEnrollment: true,
        placements: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        },
      },
      orderBy: [{ updatedAt: "desc" }],
    });

    return NextResponse.json({
      data: sponsors.map((entry) => serializeSponsor(entry)),
      targetOrg,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to load sponsors: ${message}` },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "SPONSORS");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  try {
    const targetOrg = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
    const body = (await request.json()) as SponsorUpsertPayload;
    const businessName = body.businessName?.trim() || "";
    if (!businessName) {
      return NextResponse.json(
        { error: "Business name is required" },
        { status: 400 },
      );
    }

    const packageType = body.packageType || "CUSTOM";
    const template = getSponsorTemplate(packageType);
    const orgTargets = parseOrgTargets(body.orgTargets, targetOrg);
    const sortOrder =
      typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
        ? Math.floor(body.sortOrder)
        : 100;
    const showInFooterScroller =
      typeof body.showInFooterScroller === "boolean"
        ? body.showInFooterScroller
        : template?.includesWebsiteLogo ?? true;

    const sponsor = await prisma.sponsor.create({
      data: {
        businessName,
        contactName: toNullableString(body.contactName),
        contactEmail: toNullableString(body.contactEmail)?.toLowerCase() || null,
        contactPhone: toNullableString(body.contactPhone),
        websiteUrl: toNullableString(body.websiteUrl),
        logoUrl: toNullableString(body.logoUrl),
        logoMimeType: toNullableString(body.logoMimeType),
        logoAlt: toNullableString(body.logoAlt),
        notes: toNullableString(body.notes),
        isActive: body.isActive ?? true,
        startAt: parseDateValue(body.startAt || null),
        endAt: parseDateValue(body.endAt || null),
        packageEnrollment: {
          create: {
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
        },
        placements: {
          create: orgTargets.map((organizationId) => ({
            organizationId,
            showInFooterScroller,
            sortOrder,
          })),
        },
      },
      include: {
        packageEnrollment: true,
        placements: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        },
      },
    });

    return NextResponse.json({ data: serializeSponsor(sponsor) }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to create sponsor: ${message}` },
      { status: 500 },
    );
  }
}
