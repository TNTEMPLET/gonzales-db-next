import { NextRequest, NextResponse } from "next/server";

import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { ensureAdminModule } from "@/lib/news/auth";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";
import { storeCoachDocumentFromFile } from "@/lib/uploads/storeCoachDocument";
import { getVolunteerCard, updateRequirementStatus } from "@/lib/volunteers/service";
import {
  type VolunteerRequirementKey,
  type VolunteerRequirementStatusValue,
  VOLUNTEER_REQUIREMENT_KEYS,
  VOLUNTEER_REQUIREMENT_STATUSES,
} from "@/lib/volunteers/types";

function parseKey(raw: string): VolunteerRequirementKey | null {
  const key = raw.trim().toUpperCase();
  return (VOLUNTEER_REQUIREMENT_KEYS as readonly string[]).includes(key)
    ? (key as VolunteerRequirementKey)
    : null;
}

function parseStatus(raw: unknown): VolunteerRequirementStatusValue | undefined {
  if (typeof raw !== "string") return undefined;
  const status = raw.trim().toUpperCase();
  return (VOLUNTEER_REQUIREMENT_STATUSES as readonly string[]).includes(status)
    ? (status as VolunteerRequirementStatusValue)
    : undefined;
}

function parseDate(raw: unknown): Date | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; key: string }> },
) {
  const auth = await ensureAdminModule(request, "VOLUNTEERS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  try {
    const { id, key: rawKey } = await params;
    const requirementKey = parseKey(rawKey);
    if (!requirementKey) {
      return NextResponse.json({ error: "Invalid requirement key" }, { status: 400 });
    }

    const organizationId = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
    const admin = await getAdminUserFromRequest(request);
    const body = (await request.json()) as {
      status?: string;
      completedAt?: string | null;
      expiresAt?: string | null;
      externalRef?: string | null;
      notes?: string | null;
    };

    const status = parseStatus(body.status);
    if (body.status !== undefined && !status) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    await updateRequirementStatus({
      volunteerProfileId: id,
      organizationId,
      requirementKey,
      status,
      completedAt: parseDate(body.completedAt),
      expiresAt: parseDate(body.expiresAt),
      externalRef:
        body.externalRef === undefined ? undefined : body.externalRef?.trim() || null,
      notes: body.notes === undefined ? undefined : body.notes?.trim() || null,
      reviewedByAdminId: admin?.id ?? null,
    });

    const card = await getVolunteerCard(id, organizationId);
    return NextResponse.json({ data: card });
  } catch (err: unknown) {
    console.error("[admin/volunteers requirements PATCH]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; key: string }> },
) {
  const auth = await ensureAdminModule(request, "VOLUNTEERS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message || "Unauthorized" }, { status: auth.status });
  }

  try {
    const { id, key: rawKey } = await params;
    const requirementKey = parseKey(rawKey);
    if (!requirementKey) {
      return NextResponse.json({ error: "Invalid requirement key" }, { status: 400 });
    }
    if (requirementKey !== "ABUSE_AWARENESS") {
      return NextResponse.json(
        { error: "Only Abuse Awareness supports file upload in v1" },
        { status: 400 },
      );
    }

    const organizationId = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
    const admin = await getAdminUserFromRequest(request);
    const formData = await request.formData();
    const file = formData.get("certificate") ?? formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Certificate file is required" }, { status: 400 });
    }

    const card = await getVolunteerCard(id, organizationId);
    if (!card) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const stored = await storeCoachDocumentFromFile(file, {
      coachUserId: card.registeredUser.id,
      target: "abuse-awareness-training",
    });
    if (!stored.ok) {
      return NextResponse.json(
        { error: stored.error },
        { status: stored.blobConfigError ? 500 : 400 },
      );
    }

    const now = new Date();
    await updateRequirementStatus({
      volunteerProfileId: id,
      organizationId,
      requirementKey,
      status: "CLEAR",
      documentUrl: stored.url,
      fileName: stored.fileName,
      mimeType: stored.mimeType,
      uploadedAt: now,
      completedAt: now,
      reviewedByAdminId: admin?.id ?? null,
    });

    const updated = await getVolunteerCard(id, organizationId);
    return NextResponse.json({ data: updated });
  } catch (err: unknown) {
    console.error("[admin/volunteers requirements POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}
