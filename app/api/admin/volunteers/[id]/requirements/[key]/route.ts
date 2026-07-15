import { NextRequest, NextResponse } from "next/server";

import { parseBody } from "@/lib/api/parseBody";
import { authFailureResponse, jsonError } from "@/lib/api/respond";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { resolveAdminTargetOrg } from "@/lib/siteConfig";
import { storeCoachDocumentFromFile } from "@/lib/uploads/storeCoachDocument";
import {
  isVolunteerRequirementKey,
  volunteerRequirementPatchSchema,
} from "@/lib/volunteers/schemas";
import { getVolunteerCard, updateRequirementStatus } from "@/lib/volunteers/service";
import type { VolunteerRequirementStatusValue } from "@/lib/volunteers/types";

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
  if (!auth.ok) return authFailureResponse(auth);

  try {
    const { id, key: rawKey } = await params;
    const requirementKey = rawKey.trim().toUpperCase();
    if (!isVolunteerRequirementKey(requirementKey)) {
      return jsonError("Invalid requirement key", 400);
    }

    const organizationId = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
    const rawBody: unknown = await request.json();
    const parsed = parseBody(volunteerRequirementPatchSchema, rawBody);
    if (!parsed.ok) {
      return jsonError(parsed.error, 400, { issues: parsed.issues });
    }

    const body = parsed.data;
    const completedAt = parseDate(body.completedAt);
    const expiresAt = parseDate(body.expiresAt);
    if (body.completedAt !== undefined && completedAt === undefined) {
      return jsonError("Invalid completedAt", 400);
    }
    if (body.expiresAt !== undefined && expiresAt === undefined) {
      return jsonError("Invalid expiresAt", 400);
    }

    await updateRequirementStatus({
      volunteerProfileId: id,
      organizationId,
      requirementKey,
      status: body.status as VolunteerRequirementStatusValue | undefined,
      completedAt,
      expiresAt,
      externalRef:
        body.externalRef === undefined ? undefined : body.externalRef?.trim() || null,
      notes: body.notes === undefined ? undefined : body.notes?.trim() || null,
      reviewedByAdminId: auth.admin.id,
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
  if (!auth.ok) return authFailureResponse(auth);

  try {
    const { id, key: rawKey } = await params;
    const requirementKey = rawKey.trim().toUpperCase();
    if (!isVolunteerRequirementKey(requirementKey)) {
      return jsonError("Invalid requirement key", 400);
    }
    if (requirementKey !== "ABUSE_AWARENESS") {
      return jsonError("Only Abuse Awareness supports file upload in v1", 400);
    }

    const organizationId = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
    const formData = await request.formData();
    const file = formData.get("certificate") ?? formData.get("file");
    if (!(file instanceof File)) {
      return jsonError("Certificate file is required", 400);
    }

    const card = await getVolunteerCard(id, organizationId);
    if (!card) return jsonError("Not found", 404);

    const stored = await storeCoachDocumentFromFile(file, {
      coachUserId: card.registeredUser.id,
      target: "abuse-awareness-training",
    });
    if (!stored.ok) {
      return jsonError(stored.error, stored.blobConfigError ? 500 : 400);
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
      reviewedByAdminId: auth.admin.id,
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
