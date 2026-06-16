/**
 * End-to-end smoke test for all bracket creation workflows (lib + DB).
 * Run on dev-box:
 *   pnpm exec tsx --env-file=.env.local --env-file=.env.development.local scripts/smoke-bracket-creation-workflows.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildBracketLayout } from "@/lib/tournament-brackets/bracketLayout";
import {
  defaultBracketSpec,
  isBracketSetupWizardComplete,
  mergeBracketSpec,
  parseBracketSpec,
} from "@/lib/tournament-brackets/bracketSpec";
import { generateDoubleEliminationRoundsForFormat } from "@/lib/tournament-brackets/generateDoubleElimFromTeams";
import { generateSingleEliminationRoundsFromTeams } from "@/lib/tournament-brackets/generateSingleElimFromTeams";
import { ingestBracketBuffer } from "@/lib/tournament-brackets/ingestion";
import { ingestPdfBracket } from "@/lib/tournament-brackets/ingestion/pdfBracketProfile";
import {
  buildRoundsFromOfficialTemplate,
  defaultOfficialTemplateForNewProject,
} from "@/lib/tournament-brackets/officialTemplates";
import prisma from "@/lib/prisma";

const ORG = "ladistrict2" as const;
const PDF_FIXTURE =
  process.env.BRACKET_PDF_FIXTURE ??
  "lib/tournament-brackets/__tests__/fixtures/district2-6team-bracket.pdf";
const XLSX_FIXTURE = "lib/assignr/__fixtures__/eoy-tourney-schedule.csv";

type StepResult = {
  id: string;
  label: string;
  ok: boolean;
  ms: number;
  detail: string;
  issues: string[];
};

const results: StepResult[] = [];

function msSince(start: number) {
  return Math.round(performance.now() - start);
}

function record(step: Omit<StepResult, "ms"> & { start: number }) {
  results.push({
    id: step.id,
    label: step.label,
    ok: step.ok,
    ms: msSince(step.start),
    detail: step.detail,
    issues: step.issues,
  });
}

function layoutSummary(spec: ReturnType<typeof parseBracketSpec>) {
  const layout = buildBracketLayout(spec);
  if (layout.mode !== "double_elimination") {
    return `mode=${layout.mode} games=${spec.games.length} rounds=${spec.rounds.length}`;
  }
  const live = spec.rounds.flatMap((r) => r.matches).filter((m) => m.officialGameNumber).length;
  return `DE ${layout.diagramStyle} variant=${layout.classicVariant ?? "—"} liveGames=${live} wizardComplete=${isBracketSetupWizardComplete(spec)}`;
}

async function createSmokeProject(name: string, specPatch: Record<string, unknown> = {}) {
  const spec = mergeBracketSpec(defaultBracketSpec(), specPatch);
  return prisma.bracketProject.create({
    data: {
      organizationId: ORG,
      seasonYear: 2026,
      name: `[smoke] ${name}`,
      priority: -999,
      spec: JSON.parse(JSON.stringify(spec)),
      sourceArtifactUrls: [],
    },
    select: { id: true, name: true },
  });
}

async function cleanup(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.bracketProject.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  const createdIds: string[] = [];
  console.log("=== Bracket creation workflow smoke test ===\n");

  // 1. Manual empty project
  {
    const start = performance.now();
    const issues: string[] = [];
    try {
      const p = await createSmokeProject("manual-empty");
      createdIds.push(p.id);
      const spec = parseBracketSpec(
        (await prisma.bracketProject.findUnique({ where: { id: p.id } }))!.spec,
      );
      if (isBracketSetupWizardComplete(spec)) issues.push("empty project should not be wizard-complete");
      if (spec.rounds.length > 0) issues.push("empty project should have no rounds");
      record({
        start,
        id: "manual-empty",
        label: "Manual: create empty project",
        ok: issues.length === 0,
        detail: `project=${p.id} teams=${spec.teams.length} template=${spec.officialTemplateId}`,
        issues,
      });
    } catch (e) {
      record({
        start,
        id: "manual-empty",
        label: "Manual: create empty project",
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
        issues: ["exception"],
      });
    }
  }

  // 2. Wizard — official 6-team standard
  {
    const start = performance.now();
    const issues: string[] = [];
    try {
      const teams = ["A", "B", "C", "D", "E", "F"];
      const rounds = buildRoundsFromOfficialTemplate("little_league_6_team_de", teams, {
        championshipSeriesStyle: "always_scheduled_reset",
      });
      const g3 = rounds.flatMap((r) => r.matches).find((m) => m.officialGameNumber === "3");
      if (g3?.away !== "E") issues.push(`G3 away expected E, got ${g3?.away}`);
      const p = await createSmokeProject("wizard-6std", {
        teams,
        rounds,
        setupWizardCompleted: true,
        championshipSeriesStyle: "always_scheduled_reset",
        officialTemplateId: "little_league_6_team_de",
        bracketFormat: "double_elimination",
      });
      createdIds.push(p.id);
      const spec = parseBracketSpec(
        (await prisma.bracketProject.findUnique({ where: { id: p.id } }))!.spec,
      );
      const layout = buildBracketLayout(spec);
      if (layout.mode === "double_elimination" && layout.classicVariant !== "six_team_modified_de") {
        issues.push(`expected six_team_modified_de, got ${layout.classicVariant}`);
      }
      record({
        start,
        id: "wizard-6std",
        label: "Setup wizard: official 6-team standard DE",
        ok: issues.length === 0,
        detail: layoutSummary(spec),
        issues,
      });
    } catch (e) {
      record({
        start,
        id: "wizard-6std",
        label: "Setup wizard: official 6-team standard DE",
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
        issues: ["exception"],
      });
    }
  }

  // 3. Wizard — official 6-team modified
  {
    const start = performance.now();
    const issues: string[] = [];
    try {
      const teams = ["A", "B", "C", "D", "E", "F"];
      const rounds = buildRoundsFromOfficialTemplate("little_league_6_team_de", teams, {
        championshipSeriesStyle: "winner_take_all",
      });
      const live = rounds.flatMap((r) => r.matches).filter((m) => m.officialGameNumber);
      if (live.length !== 10) issues.push(`expected 10 live games, got ${live.length}`);
      const p = await createSmokeProject("wizard-6mod", {
        teams,
        rounds,
        setupWizardCompleted: true,
        championshipSeriesStyle: "winner_take_all",
        officialTemplateId: "little_league_6_team_de",
        bracketFormat: "modified_double_elimination",
      });
      createdIds.push(p.id);
      const spec = parseBracketSpec(
        (await prisma.bracketProject.findUnique({ where: { id: p.id } }))!.spec,
      );
      record({
        start,
        id: "wizard-6mod",
        label: "Setup wizard: official 6-team modified DE",
        ok: issues.length === 0,
        detail: layoutSummary(spec),
        issues,
      });
    } catch (e) {
      record({
        start,
        id: "wizard-6mod",
        label: "Setup wizard: official 6-team modified DE",
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
        issues: ["exception"],
      });
    }
  }

  // 4. Wizard — official 5-team
  {
    const start = performance.now();
    const issues: string[] = [];
    try {
      const teams = ["A", "B", "C", "D", "E"];
      const rounds = buildRoundsFromOfficialTemplate("little_league_5_team_de", teams, {
        championshipSeriesStyle: "always_scheduled_reset",
      });
      const p = await createSmokeProject("wizard-5", {
        teams,
        rounds,
        setupWizardCompleted: true,
        officialTemplateId: "little_league_5_team_de",
      });
      createdIds.push(p.id);
      const spec = parseBracketSpec(
        (await prisma.bracketProject.findUnique({ where: { id: p.id } }))!.spec,
      );
      const layout = buildBracketLayout(spec);
      if (layout.mode === "double_elimination" && layout.classicVariant !== "five_team") {
        issues.push(`expected five_team variant, got ${layout.classicVariant}`);
      }
      record({
        start,
        id: "wizard-5",
        label: "Setup wizard: official 5-team DE",
        ok: issues.length === 0,
        detail: layoutSummary(spec),
        issues,
      });
    } catch (e) {
      record({
        start,
        id: "wizard-5",
        label: "Setup wizard: official 5-team DE",
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
        issues: ["exception"],
      });
    }
  }

  // 5. Wizard — custom 8-team DE
  {
    const start = performance.now();
    const issues: string[] = [];
    try {
      const teams = Array.from({ length: 8 }, (_, i) => `Team ${i + 1}`);
      const rounds = generateDoubleEliminationRoundsForFormat(teams, "double_elimination");
      const p = await createSmokeProject("wizard-8custom", {
        teams,
        rounds,
        setupWizardCompleted: true,
        bracketFormat: "double_elimination",
        officialTemplateId: null,
        layoutPreference: "connected_columns",
      });
      createdIds.push(p.id);
      const spec = parseBracketSpec(
        (await prisma.bracketProject.findUnique({ where: { id: p.id } }))!.spec,
      );
      const layout = buildBracketLayout(spec);
      if (layout.mode === "double_elimination" && layout.diagramStyle === "classic_unified") {
        issues.push("8-team custom should use connected_columns, not classic unified");
      }
      record({
        start,
        id: "wizard-8custom",
        label: "Setup wizard: custom 8-team DE (connected columns)",
        ok: issues.length === 0,
        detail: layoutSummary(spec),
        issues,
      });
    } catch (e) {
      record({
        start,
        id: "wizard-8custom",
        label: "Setup wizard: custom 8-team DE",
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
        issues: ["exception"],
      });
    }
  }

  // 6. Wizard — single elimination 4-team
  {
    const start = performance.now();
    const issues: string[] = [];
    try {
      const teams = ["A", "B", "C", "D"];
      const rounds = generateSingleEliminationRoundsFromTeams(teams);
      const p = await createSmokeProject("wizard-4se", {
        teams,
        rounds,
        setupWizardCompleted: true,
        bracketFormat: "single_elimination",
        officialTemplateId: null,
      });
      createdIds.push(p.id);
      const spec = parseBracketSpec(
        (await prisma.bracketProject.findUnique({ where: { id: p.id } }))!.spec,
      );
      const layout = buildBracketLayout(spec);
      if (layout.mode !== "single_elimination") issues.push(`expected single_elim, got ${layout.mode}`);
      record({
        start,
        id: "wizard-4se",
        label: "Setup wizard: single elimination 4-team",
        ok: issues.length === 0,
        detail: layoutSummary(spec),
        issues,
      });
    } catch (e) {
      record({
        start,
        id: "wizard-4se",
        label: "Setup wizard: single elimination 4-team",
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
        issues: ["exception"],
      });
    }
  }

  // 7. PDF upload — DocHub 6-team bracket
  {
    const start = performance.now();
    const issues: string[] = [];
    try {
      const buf = readFileSync(PDF_FIXTURE);
      const buffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      const ingested = await ingestPdfBracket(buffer);
      if (!ingested.pdfTemplate) issues.push("no template detected");
      if (!ingested.specPatch?.rounds) issues.push("no rounds in spec patch");
      if ((ingested.roundsBuilt ?? 0) < 10) issues.push(`expected ≥10 games built, got ${ingested.roundsBuilt}`);
      const merged = mergeBracketSpec(defaultBracketSpec(), ingested.specPatch ?? {});
      if (!isBracketSetupWizardComplete(merged)) {
        issues.push("PDF with rounds should unlock structure via legacy content");
      }
      if (merged.setupWizardCompleted === true) {
        issues.push("PDF ingest should leave setupWizardCompleted false until user confirms");
      }
      const g3 = merged.rounds.flatMap((r) => r.matches).find((m) => m.officialGameNumber === "3");
      if (g3?.home !== "W1" || g3?.away !== "E") {
        issues.push(`G3 feeders wrong: ${g3?.home} vs ${g3?.away}`);
      }
      const p = await createSmokeProject("pdf-ingest", ingested.specPatch ?? {});
      createdIds.push(p.id);
      record({
        start,
        id: "pdf-ingest",
        label: "PDF upload: DocHub 6-team LL bracket",
        ok: issues.length === 0,
        detail: `template=${ingested.pdfTemplate?.templateId} games=${ingested.roundsBuilt} style=${ingested.specPatch?.championshipSeriesStyle} ${layoutSummary(merged)}`,
        issues,
      });
    } catch (e) {
      record({
        start,
        id: "pdf-ingest",
        label: "PDF upload: DocHub 6-team LL bracket",
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
        issues: ["exception"],
      });
    }
  }

  // 8. PDF — unrecognized / empty text
  {
    const start = performance.now();
    const issues: string[] = [];
    try {
      const buffer = Buffer.from("%PDF-1.4 fake").buffer;
      const ingested = await ingestPdfBracket(buffer);
      if (ingested.pdfTemplate) issues.push("should not detect template on garbage PDF");
      if (!ingested.warnings.some((w) => /text|template|extract/i.test(w))) {
        issues.push("expected helpful warning for bad PDF");
      }
      record({
        start,
        id: "pdf-bad",
        label: "PDF upload: invalid / no text",
        ok: issues.length === 0,
        detail: `warnings=${ingested.warnings.length} first="${ingested.warnings[0]?.slice(0, 80)}"`,
        issues,
      });
    } catch (e) {
      record({
        start,
        id: "pdf-bad",
        label: "PDF upload: invalid / no text",
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
        issues: ["exception"],
      });
    }
  }

  // 9. XLSX/CSV schedule import
  {
    const start = performance.now();
    const issues: string[] = [];
    try {
      const buf = readFileSync(XLSX_FIXTURE);
      const buffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      const ingested = await ingestBracketBuffer({
        buffer,
        mimeType: "text/csv",
        filename: "eoy-tourney-schedule.csv",
        seasonYear: 2026,
        profile: "auto",
      });
      if (ingested.games.length < 1) issues.push("expected games from schedule fixture");
      const p = await createSmokeProject("xlsx-schedule", {
        games: ingested.games.slice(0, 5),
        setupWizardCompleted: true,
        ingestionWarnings: ingested.warnings,
      });
      createdIds.push(p.id);
      const spec = parseBracketSpec(
        (await prisma.bracketProject.findUnique({ where: { id: p.id } }))!.spec,
      );
      if (spec.rounds.length > 0) issues.push("schedule import should populate games[], not rounds");
      record({
        start,
        id: "xlsx-schedule",
        label: "Schedule import: tournament XLSX/CSV",
        ok: issues.length === 0,
        detail: `gamesImported=${ingested.games.length} sample=${ingested.games[0]?.homeTeam} vs ${ingested.games[0]?.awayTeam}`,
        issues,
      });
    } catch (e) {
      record({
        start,
        id: "xlsx-schedule",
        label: "Schedule import: tournament XLSX/CSV",
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
        issues: ["exception"],
      });
    }
  }

  // 10. Skip guided setup (unlock without rounds)
  {
    const start = performance.now();
    const issues: string[] = [];
    try {
      const p = await createSmokeProject("skip-wizard", { setupWizardCompleted: true });
      createdIds.push(p.id);
      const spec = parseBracketSpec(
        (await prisma.bracketProject.findUnique({ where: { id: p.id } }))!.spec,
      );
      if (!isBracketSetupWizardComplete(spec)) issues.push("skip should mark wizard complete");
      if (spec.rounds.length > 0) issues.push("skip path should not auto-build rounds");
      record({
        start,
        id: "skip-wizard",
        label: "Skip guided setup (manual structure later)",
        ok: issues.length === 0,
        detail: `wizardComplete=${isBracketSetupWizardComplete(spec)} rounds=${spec.rounds.length}`,
        issues,
      });
    } catch (e) {
      record({
        start,
        id: "skip-wizard",
        label: "Skip guided setup",
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
        issues: ["exception"],
      });
    }
  }

  // 11. Default new project spec
  {
    const start = performance.now();
    const issues: string[] = [];
    try {
      const def = defaultBracketSpec();
      const template = defaultOfficialTemplateForNewProject();
      if (def.officialTemplateId !== template.id) issues.push("default template mismatch");
      if (def.teams.length !== template.teamCount) issues.push("default team placeholders mismatch");
      record({
        start,
        id: "default-spec",
        label: "New project defaults (pre-wizard)",
        ok: issues.length === 0,
        detail: `template=${def.officialTemplateId} teams=${def.teams.join(",")} format=${def.bracketFormat}`,
        issues,
      });
    } catch (e) {
      record({
        start,
        id: "default-spec",
        label: "New project defaults",
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
        issues: ["exception"],
      });
    }
  }

  // 12. PDF re-ingest on existing project (replace)
  {
    const start = performance.now();
    const issues: string[] = [];
    try {
      const p = await createSmokeProject("reingest-base", { teams: ["X"], rounds: [] });
      createdIds.push(p.id);
      const buf = readFileSync(PDF_FIXTURE);
      const buffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      const ingested = await ingestPdfBracket(buffer);
      const spec = parseBracketSpec(
        (await prisma.bracketProject.findUnique({ where: { id: p.id } }))!.spec,
      );
      const next = mergeBracketSpec(spec, {
        ...(ingested.specPatch ?? {}),
        ingestionWarnings: ingested.warnings,
      });
      await prisma.bracketProject.update({
        where: { id: p.id },
        data: { spec: JSON.parse(JSON.stringify(next)) },
      });
      const after = parseBracketSpec(
        (await prisma.bracketProject.findUnique({ where: { id: p.id } }))!.spec,
      );
      if (after.teams[0] !== "A") issues.push("re-ingest should replace teams with PDF placeholders");
      if (after.rounds.flatMap((r) => r.matches).length < 10) issues.push("re-ingest should rebuild rounds");
      record({
        start,
        id: "pdf-reingest",
        label: "PDF re-upload on existing project",
        ok: issues.length === 0,
        detail: layoutSummary(after),
        issues,
      });
    } catch (e) {
      record({
        start,
        id: "pdf-reingest",
        label: "PDF re-upload on existing project",
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
        issues: ["exception"],
      });
    }
  }

  await cleanup(createdIds);

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  console.log("| Step | Status | ms | Detail |");
  console.log("|------|--------|-----|--------|");
  for (const r of results) {
    console.log(`| ${r.label} | ${r.ok ? "PASS" : "FAIL"} | ${r.ms} | ${r.detail.replace(/\|/g, "/")} |`);
    if (r.issues.length) console.log(`  issues: ${r.issues.join("; ")}`);
  }
  console.log(`\n${passed}/${results.length} passed`);
  if (failed.length) {
    console.error("\nFailed steps:", failed.map((f) => f.id).join(", "));
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
