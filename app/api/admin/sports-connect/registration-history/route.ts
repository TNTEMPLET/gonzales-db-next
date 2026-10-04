import { NextRequest, NextResponse } from "next/server";

import { hasAdminRoleAtLeast } from "@/lib/auth/adminRoles";
import { getEffectiveAdminRoleForOrg } from "@/lib/auth/effectiveAdminRole";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import prisma from "@/lib/prisma";
import { isContentOrgId, resolveAdminTargetOrg } from "@/lib/siteConfig";
import {
  commitRegistrationHistory,
  countRegistrationHistoryUndo,
  storeRegistrationHistoryPreview,
  undoRegistrationHistory,
  type HistoryDb,
} from "@/lib/sportsConnect/registrationHistoryCommit";
import {
  classifyRegistrationHistory,
  inventoryRegistrationPrograms,
  readRegistrationHistoryExport,
  RegistrationHistoryError,
  sha256FileBytes,
  type HistoryMappingEntry,
  type HistoryOrgId,
  type NormalizedHistoryMappingEntry,
} from "@/lib/sportsConnect/registrationHistory";
import { PLAYER_REG_HISTORY_REPORT_KIND } from "@/lib/sportsConnect/registrationHistoryKind";

export const dynamic = "force-dynamic";

const db = prisma as unknown as HistoryDb;

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const org = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  if (!isContentOrgId(org)) {
    return NextResponse.json({ error: "Select a site first." }, { status: 400 });
  }

  const rows = await prisma.sportsConnectImportRun.findMany({
    where: {
      organizationId: org,
      reportKind: PLAYER_REG_HISTORY_REPORT_KIND,
      status: { in: ["DONE", "UNDONE"] },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      organizationId: true,
      seasonYear: true,
      status: true,
      sourceFileName: true,
      summary: true,
      createdAt: true,
      completedAt: true,
    },
  });

  return NextResponse.json({
    data: rows
      .filter((row) => summaryRole(row.summary) === "commit" || row.status === "UNDONE")
      .map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        seasonYear: row.seasonYear,
        status: row.status,
        sourceFileName: row.sourceFileName,
        createdAt: row.createdAt.toISOString(),
        completedAt: row.completedAt?.toISOString() ?? null,
        wouldAdd: summaryNumber(row.summary, "wouldAdd"),
        alreadyPresent: summaryNumber(row.summary, "alreadyPresent"),
        inserted: summaryNumber(row.summary, "inserted"),
        undoneEnrollmentCount: summaryNumber(row.summary, "undoneEnrollmentCount"),
      })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return await undoFromJson(request, auth.admin.id, auth.admin.isMaster);
    }
    const form = await request.formData();
    const action = String(form.get("action") || "");
    if (action === "inspect") return await inspect(form);
    if (action === "preview") return await preview(form, auth.admin.id, auth.admin.isMaster);
    if (action === "commit") return await commit(form, auth.admin.id, auth.admin.isMaster);
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    if (err instanceof RegistrationHistoryError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[registration-history]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Registration history import failed." }, { status: 500 });
  }
}

async function inspect(form: FormData) {
  const uploaded = await readUpload(form);
  return NextResponse.json({
    data: {
      fileName: uploaded.fileName,
      fileSha256: uploaded.fileSha256,
      totalRows: uploaded.rows.length,
      programs: inventoryRegistrationPrograms(uploaded.rows),
    },
  });
}

async function preview(form: FormData, adminId: string, isMaster: boolean) {
  const uploaded = await readUpload(form);
  const mapping = readMapping(form);
  const normalized = classifiedTargets(uploaded.rows, mapping);
  await assertCanWriteTargets(adminId, isMaster, normalized);
  const classified = classifyRegistrationHistory({
    rows: uploaded.rows,
    mapping,
    existingKeys: await loadExistingKeys(normalized),
    fileName: uploaded.fileName,
    fileSha256: uploaded.fileSha256,
  });
  const stored = await storeRegistrationHistoryPreview(db, {
    fileName: uploaded.fileName,
    fileSha256: uploaded.fileSha256,
    preview: classified.preview,
    normalizedMapping: classified.normalizedMapping,
    createdByAdminId: adminId,
  });
  return NextResponse.json({
    data: { previewRunId: stored.id, preview: classified.preview },
  });
}

async function commit(form: FormData, adminId: string, isMaster: boolean) {
  const uploaded = await readUpload(form);
  const mapping = readMapping(form);
  const previewRunId = String(form.get("previewRunId") || "").trim();
  if (!previewRunId) {
    throw new RegistrationHistoryError("Dry-run this file before committing it.");
  }
  const normalized = classifiedTargets(uploaded.rows, mapping);
  await assertCanWriteTargets(adminId, isMaster, normalized);
  const result = await commitRegistrationHistory(db, {
    previewRunId,
    fileName: uploaded.fileName,
    fileSha256: uploaded.fileSha256,
    mapping,
    rows: uploaded.rows,
    createdByAdminId: adminId,
  });
  return NextResponse.json({ data: result });
}

async function undoFromJson(request: NextRequest, adminId: string, isMaster: boolean) {
  const org = resolveAdminTargetOrg(request.nextUrl.searchParams.get("org"));
  if (!isContentOrgId(org)) {
    return NextResponse.json({ error: "Select a site first." }, { status: 400 });
  }
  const role = await getEffectiveAdminRoleForOrg(adminId, isMaster, org);
  if (!role || !hasAdminRoleAtLeast(role, "ADMIN")) {
    return NextResponse.json({ error: `Admin access is required for ${org}.` }, { status: 403 });
  }
  let body: { runId?: unknown; confirm?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const runId = typeof body.runId === "string" ? body.runId.trim() : "";
  if (!runId) return NextResponse.json({ error: "runId is required." }, { status: 400 });
  if (body.confirm !== true) {
    const counted = await countRegistrationHistoryUndo(db, { runId, organizationId: org });
    return NextResponse.json({ data: { ...counted, undone: false } });
  }
  const result = await undoRegistrationHistory(db, { runId, organizationId: org });
  return NextResponse.json({ data: result });
}

async function authorize(request: NextRequest) {
  const auth = await ensureAdminModule(request, "SPORTS_CONNECT");
  if (!auth.ok) return auth;
  if (!hasAdminRoleAtLeast(auth.role, "ADMIN")) {
    return {
      ok: false as const,
      status: 403,
      message: "Admin access is required for registration history import.",
    };
  }
  return auth;
}

async function readUpload(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new RegistrationHistoryError("Choose an .xlsx or .csv export.");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const fileSha256 = sha256FileBytes(bytes);
  const parsed = readRegistrationHistoryExport({ buffer: bytes, fileName: file.name || "export.xlsx" });
  return { ...parsed, fileSha256 };
}

function readMapping(form: FormData): HistoryMappingEntry[] {
  const raw = form.get("mapping");
  if (typeof raw !== "string" || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new RegistrationHistoryError("Mapping must be JSON.");
  }
  if (!Array.isArray(parsed)) throw new RegistrationHistoryError("Mapping must be a list.");
  return parsed.filter((entry): entry is HistoryMappingEntry => !!entry && typeof entry === "object");
}

function classifiedTargets(rows: Record<string, unknown>[], mapping: HistoryMappingEntry[]) {
  return classifyRegistrationHistory({
    rows,
    mapping,
    existingKeys: [],
    fileName: "export",
    fileSha256: "",
  }).normalizedMapping;
}

async function loadExistingKeys(mapping: NormalizedHistoryMappingEntry[]) {
  const targets = mapping.filter((entry) => entry.action === "map");
  if (!targets.length) return [];
  const unique = new Map<string, { organizationId: string; seasonYear: number }>();
  for (const target of targets) {
    if (target.action !== "map") continue;
    unique.set(`${target.organizationId}\0${target.seasonYear}`, {
      organizationId: target.organizationId,
      seasonYear: target.seasonYear,
    });
  }
  return prisma.enrollment.findMany({
    where: { OR: [...unique.values()] },
    select: { organizationId: true, seasonYear: true, sportsConnectRowKey: true },
  });
}

async function assertCanWriteTargets(
  adminId: string,
  isMaster: boolean,
  mapping: NormalizedHistoryMappingEntry[],
) {
  const orgs = new Set<HistoryOrgId>();
  for (const entry of mapping) {
    if (entry.action === "map") orgs.add(entry.organizationId);
  }
  for (const org of orgs) {
    const role = await getEffectiveAdminRoleForOrg(adminId, isMaster, org);
    if (!role || !hasAdminRoleAtLeast(role, "ADMIN")) {
      throw new RegistrationHistoryError(`Admin access is required for ${org}.`, 403);
    }
  }
}

function summaryRole(summary: unknown): string | null {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return null;
  const role = (summary as { role?: unknown }).role;
  return typeof role === "string" ? role : null;
}

function summaryNumber(summary: unknown, key: string): number | null {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return null;
  const value = (summary as Record<string, unknown>)[key];
  return typeof value === "number" ? value : null;
}
