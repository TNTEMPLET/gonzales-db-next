import prisma from "@/lib/prisma";
import { bracketGameChangerSchema, type BracketGameChanger } from "@/lib/gamechanger/types";
import { mergeBracketSpec, safeParseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { isBracketOrgId, type BracketOrgId } from "@/lib/siteConfig";
import type { UnifiedScoreSourceType } from "@/lib/admin/unifiedScoreSources";

export type ScoreboardConnectionInput = {
  organizationId: BracketOrgId; seasonYear: number; sourceType: UnifiedScoreSourceType; sourceKey: string;
  sourceLabel?: string | null; widgetId: string; maxVerticalGamesVisible?: number | null; autoImportFinalScores?: boolean; createdByAdminId?: string | null;
};
export function parseJsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}
export function parseMatchEventPins(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(value)) if (typeof val === "string" && val.trim()) out[key] = val.trim();
  return out;
}
export async function upsertScoreboardConnection(input: ScoreboardConnectionInput) {
  const widgetId = input.widgetId.trim(); if (!widgetId) throw new Error("GameChanger widget ID is required.");
  const row = await prisma.gameChangerScoreboardConnection.upsert({
    where: { organizationId_seasonYear_sourceType_sourceKey: { organizationId: input.organizationId, seasonYear: input.seasonYear, sourceType: input.sourceType, sourceKey: input.sourceKey } },
    create: { organizationId: input.organizationId, seasonYear: input.seasonYear, sourceType: input.sourceType, sourceKey: input.sourceKey, sourceLabel: input.sourceLabel?.trim() || null,
      widgetId, maxVerticalGamesVisible: input.maxVerticalGamesVisible ?? null, autoImportFinalScores: input.autoImportFinalScores ?? true, createdByAdminId: input.createdByAdminId ?? null },
    update: { sourceLabel: input.sourceLabel?.trim() || null, widgetId, maxVerticalGamesVisible: input.maxVerticalGamesVisible ?? null, autoImportFinalScores: input.autoImportFinalScores ?? true },
  });
  if (input.sourceType === "TOURNAMENT") await mirrorTournamentConnectionToBracketSpec({ projectId: input.sourceKey, widgetId, maxVerticalGamesVisible: input.maxVerticalGamesVisible ?? undefined, autoImportFinalScores: input.autoImportFinalScores ?? true });
  return row;
}
export async function getScoreboardConnection(params: { organizationId: BracketOrgId; seasonYear: number; sourceType: UnifiedScoreSourceType; sourceKey: string }) {
  const row = await prisma.gameChangerScoreboardConnection.findUnique({ where: { organizationId_seasonYear_sourceType_sourceKey: params } });
  if (row) return row;
  if (params.sourceType !== "TOURNAMENT") return null;
  const project = await prisma.bracketProject.findUnique({ where: { id: params.sourceKey } });
  if (!project || !isBracketOrgId(project.organizationId)) return null;
  const parsed = safeParseBracketSpec(project.spec); if (!parsed.ok) return null;
  const gc = bracketGameChangerSchema.safeParse(parsed.spec.gameChanger); if (!gc.success) return null;
  return prisma.gameChangerScoreboardConnection.create({ data: { organizationId: project.organizationId, seasonYear: project.seasonYear, sourceType: "TOURNAMENT", sourceKey: project.id, sourceLabel: project.name,
    widgetId: gc.data.widgetId, maxVerticalGamesVisible: gc.data.maxVerticalGamesVisible ?? null, autoImportFinalScores: gc.data.autoImportFinalScores !== false,
    importedFinalEventIds: gc.data.importedFinalEventIds ?? [], matchEventPins: gc.data.matchEventPins ?? {} } });
}
export async function updateConnectionImportedEventIds(params: { connectionId: string; importedFinalEventIds: string[] }) {
  return prisma.gameChangerScoreboardConnection.update({ where: { id: params.connectionId }, data: { importedFinalEventIds: params.importedFinalEventIds } });
}
export async function mirrorTournamentImportedIdsToSpec(projectId: string, importedFinalEventIds: string[]) {
  const project = await prisma.bracketProject.findUnique({ where: { id: projectId } }); if (!project) return;
  const parsed = safeParseBracketSpec(project.spec); if (!parsed.ok) return;
  const current = bracketGameChangerSchema.safeParse(parsed.spec.gameChanger); if (!current.success) return;
  const nextGc: BracketGameChanger = { ...current.data, importedFinalEventIds };
  const nextSpec = mergeBracketSpec(parsed.spec, { gameChanger: nextGc });
  await prisma.bracketProject.update({ where: { id: projectId }, data: { spec: JSON.parse(JSON.stringify(nextSpec)) } });
}
async function mirrorTournamentConnectionToBracketSpec(params: { projectId: string; widgetId: string; maxVerticalGamesVisible?: number; autoImportFinalScores: boolean }) {
  const project = await prisma.bracketProject.findUnique({ where: { id: params.projectId } }); if (!project) return;
  const parsed = safeParseBracketSpec(project.spec); if (!parsed.ok) return;
  const current = bracketGameChangerSchema.safeParse(parsed.spec.gameChanger);
  const nextGc: BracketGameChanger = { ...(current.success ? current.data : { widgetId: params.widgetId }), widgetId: params.widgetId, autoImportFinalScores: params.autoImportFinalScores,
    ...(params.maxVerticalGamesVisible ? { maxVerticalGamesVisible: params.maxVerticalGamesVisible } : {}) };
  const nextSpec = mergeBracketSpec(parsed.spec, { gameChanger: nextGc });
  await prisma.bracketProject.update({ where: { id: params.projectId }, data: { spec: JSON.parse(JSON.stringify(nextSpec)) } });
}
