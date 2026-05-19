"use client";

import { jsPDF } from "jspdf";
import { useRouter, usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";

import BracketSetupWizard from "@/components/admin/BracketSetupWizard";
import BracketStructureEditor from "@/components/admin/BracketStructureEditor";
import BracketTeamNameBulkMapper from "@/components/admin/BracketTeamNameBulkMapper";
import BracketTeamNameMappingEditor from "@/components/admin/BracketTeamNameMappingEditor";
import GameChangerScoreboardModal from "@/components/brackets/GameChangerScoreboardModal";
import TournamentBracketView, { type BracketScoringViewProps } from "@/components/brackets/TournamentBracketView";
import { useGameChangerAdminSync } from "@/hooks/useGameChangerAdminSync";
import { bracketMatchLabelForId, bracketMatchRefForId } from "@/lib/gamechanger/collectLayoutMatches";
import { parseGameChangerEmbedSnippet } from "@/lib/gamechanger/parseEmbedSnippet";
import { bracketGameChangerSchema } from "@/lib/gamechanger/types";
import { buildBracketExportHtmlDocument } from "@/lib/tournament-brackets/bracketExportHtml";
import { buildBracketLayout, type BracketLayout } from "@/lib/tournament-brackets/bracketLayout";
import { buildBracketSvgPreview } from "@/lib/tournament-brackets/bracketSvgPreview";
import { isBracketSetupWizardComplete, safeParseBracketSpec, type BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { comparePublishedBrackets } from "@/lib/tournament-brackets/publishedBracketSort";
import {
  canUseConnectedBracketScoring,
  clearBracketScoringFromSpec,
  getDownstreamMatchIdsForRescore,
  mergeMatchScoresIntoSpec,
  scoresFromSpec,
  specHasSavedScores,
  type BracketMatchScores,
} from "@/lib/tournament-brackets/bracketScoring";
import { bracketWatermarkSrc } from "@/lib/tournament-brackets/bracketWatermark";
import { normalizeHex6, resolveBracketThemeColors } from "@/lib/tournament-brackets/bracketTheme";
import { ALLOWED_REFERENCE_HOST_SUFFIXES, isReferenceUrlAllowed } from "@/lib/tournament-brackets/referenceAllowlist";
import {
  CONTENT_ORGS,
  getContentOrgBrandColors,
  getOrgDisplayName,
  getTournamentBracketBrandingForOrg,
  type ContentOrgId,
} from "@/lib/siteConfig";

type ProjectRow = {
  id: string;
  organizationId: string;
  seasonYear: number;
  name: string;
  status: ProjectStatus;
  priority: number;
  updatedAt: string;
};

type ProjectStatus = "DRAFT" | "READY" | "ARCHIVED";
type ProjectSortMode = "priority" | "recent" | "season" | "name";
type ProjectSortDirection = "asc" | "desc";

const PROJECT_STATUS_PRIORITY: Record<ProjectStatus, number> = {
  READY: 0,
  DRAFT: 1,
  ARCHIVED: 2,
};
const PROJECT_PRIORITY_OPTION_FLOOR = 20;

type ProjectDetail = ProjectRow & {
  spec: unknown;
  sourceArtifactUrls: unknown;
};

/** Avoid `res.json()` on empty/HTML error bodies (gives clearer errors than "Unexpected end of JSON input"). */
async function readApiJson<T extends Record<string, unknown>>(res: Response): Promise<T> {
  const raw = await res.text();
  const trimmed = raw.trim();
  if (!trimmed) {
    const extra =
      res.status >= 500
        ? " If BracketProject tables are missing, run: npx prisma migrate deploy"
        : "";
    throw new Error(`Empty response from server (HTTP ${res.status}).${extra}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json") && (trimmed.startsWith("<") || trimmed.startsWith("<!"))) {
    throw new Error(
      `Server returned HTML instead of JSON (HTTP ${res.status}). You may need to sign in again or the route failed to compile.`,
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(
      `Invalid JSON from server (HTTP ${res.status}): ${trimmed.slice(0, 200)}${trimmed.length > 200 ? "…" : ""}`,
    );
  }
}

function apiErrorMessage(json: { error?: string; hint?: string }, fallback: string) {
  const base = json.error || fallback;
  return json.hint ? `${base} — ${json.hint}` : base;
}

/** Browser `fetch` and Prisma driver often surface connection loss as "fetch failed". */
function formatClientFetchError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const msg = err.message.trim();
  if (msg === "fetch failed" || msg.includes("ECONNRESET") || msg.includes("network")) {
    return "Could not reach the server (connection lost or timed out). Wait a few seconds and use Retry, or refresh the page.";
  }
  if (msg.startsWith("Bracket save rejected:")) return msg;
  return msg || fallback;
}

function compareByProjectName(left: ProjectRow, right: ProjectRow): number {
  return left.name.localeCompare(right.name, "en-US", {
    numeric: true,
    sensitivity: "base",
  });
}

function compareByUpdatedAtAsc(left: ProjectRow, right: ProjectRow): number {
  const leftTime = Date.parse(left.updatedAt);
  const rightTime = Date.parse(right.updatedAt);
  return (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0);
}

function sortProjectsForAdmin(
  projects: ProjectRow[],
  sortMode: ProjectSortMode,
  sortDirection: ProjectSortDirection,
): ProjectRow[] {
  return [...projects].sort((left, right) => {
    let result: number;
    if (sortMode === "recent") {
      result = compareByUpdatedAtAsc(left, right) || compareByProjectName(left, right);
    } else if (sortMode === "season") {
      result = left.seasonYear - right.seasonYear || comparePublishedBrackets(left, right);
    } else if (sortMode === "name") {
      result = compareByProjectName(left, right) || left.seasonYear - right.seasonYear;
    } else {
      const priorityCompare = (left.priority ?? 0) - (right.priority ?? 0);
      const statusCompare = PROJECT_STATUS_PRIORITY[left.status] - PROJECT_STATUS_PRIORITY[right.status];
      result = priorityCompare || statusCompare || comparePublishedBrackets(left, right);
    }
    return sortDirection === "asc" ? result : -result;
  });
}

/** html2canvas 1.x cannot parse CSS Color 4 `color()` / `lab()` strings from computed styles; canvas normalizes to rgb/hex. */
function coerceCssColorToRgb(cssColor: string): string | null {
  const v = cssColor?.trim();
  if (!v || v === "transparent" || v === "rgba(0, 0, 0, 0)") return null;
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#000000";
    ctx.fillStyle = v;
    const out = ctx.fillStyle;
    return typeof out === "string" ? out : null;
  } catch {
    return null;
  }
}

/** Walk clone in lockstep with the live DOM and replace unsupported color syntax with rgb/hex. */
function flattenBracketCloneForHtml2Canvas(origRoot: HTMLElement, cloneRoot: HTMLElement) {
  const walk = (o: Element, c: Element) => {
    if (o instanceof HTMLElement && c instanceof HTMLElement) {
      const cs = getComputedStyle(o);
      const color = coerceCssColorToRgb(cs.color);
      if (color) c.style.color = color;
      const bgImg = cs.backgroundImage;
      if (!bgImg || bgImg === "none") {
        const bg = coerceCssColorToRgb(cs.backgroundColor);
        if (bg) c.style.backgroundColor = bg;
      } else {
        c.style.backgroundImage = "none";
        const fallback =
          coerceCssColorToRgb(cs.backgroundColor) ||
          coerceCssColorToRgb(cs.getPropertyValue("--bracket-bg").trim()) ||
          "#eef2f7";
        c.style.backgroundColor = fallback;
      }
      const btc = coerceCssColorToRgb(cs.borderTopColor);
      if (btc) c.style.borderTopColor = btc;
      const brc = coerceCssColorToRgb(cs.borderRightColor);
      if (brc) c.style.borderRightColor = brc;
      const bbc = coerceCssColorToRgb(cs.borderBottomColor);
      if (bbc) c.style.borderBottomColor = bbc;
      const blc = coerceCssColorToRgb(cs.borderLeftColor);
      if (blc) c.style.borderLeftColor = blc;
      c.style.boxShadow = "none";
      c.style.filter = "none";
      c.style.backdropFilter = "none";
    }
    if (o instanceof SVGElement && c instanceof SVGElement) {
      const cs = getComputedStyle(o);
      const stroke = coerceCssColorToRgb(cs.stroke);
      if (stroke) c.setAttribute("stroke", stroke);
      if (cs.fill && cs.fill !== "none") {
        const fill = coerceCssColorToRgb(cs.fill);
        if (fill) c.setAttribute("fill", fill);
      }
    }
    const n = Math.min(o.children.length, c.children.length);
    for (let i = 0; i < n; i++) walk(o.children[i]!, c.children[i]!);
  };
  walk(origRoot, cloneRoot);
}

/** Marks the admin preview zoom wrapper; removed in html2canvas clone so flyer PDF stays full size. */
const BRACKET_PREVIEW_SCALE_ATTR = "data-bracket-preview-scale";

function stripBracketPreviewScaleForCapture(cloned: HTMLElement) {
  cloned.querySelectorAll<HTMLElement>(`[${BRACKET_PREVIEW_SCALE_ATTR}]`).forEach((el) => {
    el.style.removeProperty("zoom");
    el.style.removeProperty("transform");
    el.style.removeProperty("transform-origin");
  });
}

function sampleColorsFromImageBitmap(bitmap: ImageBitmap): { primary: string; accent: string } {
  const canvas = document.createElement("canvas");
  const w = Math.min(64, bitmap.width);
  const h = Math.min(64, bitmap.height);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { primary: "#590275", accent: "#ffcb29" };
  ctx.drawImage(bitmap, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  let maxSat = 0;
  let accentR = 255;
  let accentG = 200;
  let accentB = 40;
  for (let i = 0; i < data.length; i += 16) {
    const rr = data[i] ?? 0;
    const gg = data[i + 1] ?? 0;
    const bb = data[i + 2] ?? 0;
    const max = Math.max(rr, gg, bb) / 255;
    const min = Math.min(rr, gg, bb) / 255;
    const sat = max === 0 ? 0 : (max - min) / max;
    r += rr;
    g += gg;
    b += bb;
    n += 1;
    if (sat > maxSat && max > 0.2) {
      maxSat = sat;
      accentR = rr;
      accentG = gg;
      accentB = bb;
    }
  }
  if (n === 0) return { primary: "#590275", accent: "#ffcb29" };
  r = Math.round(r / n);
  g = Math.round(g / n);
  b = Math.round(b / n);
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return {
    primary: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
    accent: `#${toHex(accentR)}${toHex(accentG)}${toHex(accentB)}`,
  };
}

async function extractPaletteFromFile(file: File): Promise<{ primary: string; accent: string } | null> {
  try {
    const bmp = await createImageBitmap(file);
    const out = sampleColorsFromImageBitmap(bmp);
    bmp.close();
    return out;
  } catch {
    return null;
  }
}

export default function TournamentBracketsClient({ organizationId }: { organizationId: ContentOrgId }) {
  const router = useRouter();
  const pathname = usePathname();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectSortMode, setProjectSortMode] = useState<ProjectSortMode>("priority");
  const [projectSortDirection, setProjectSortDirection] = useState<ProjectSortDirection>("asc");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [draftName, setDraftName] = useState("End of Year Bracket");
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [projectPriorityDraft, setProjectPriorityDraft] = useState("0");
  const [referenceUrl, setReferenceUrl] = useState("");
  /** 0.6–1.0; only affects on-screen admin preview (`zoom`). Stripped for PDF raster capture. */
  const [bracketPreviewZoom, setBracketPreviewZoom] = useState(0.88);
  const [pendingWizardScroll, setPendingWizardScroll] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/tournament-brackets/projects?organizationId=${encodeURIComponent(organizationId)}`,
        { cache: "no-store" },
      );
      const json = await readApiJson<{ data?: ProjectRow[]; error?: string; hint?: string }>(res);
      if (!res.ok) throw new Error(apiErrorMessage(json, "Failed to load projects"));
      setProjects(json.data ?? []);
      setError("");
    } catch (e: unknown) {
      throw new Error(formatClientFetchError(e, "Failed to load projects"));
    }
  }, [organizationId]);

  const loadProject = useCallback(async (id: string, opts?: { silent?: boolean }) => {
    try {
      const res = await fetch(`/api/admin/tournament-brackets/projects/${id}`, { cache: "no-store" });
      const json = await readApiJson<{ data?: ProjectDetail; error?: string; hint?: string }>(res);
      if (!res.ok) throw new Error(apiErrorMessage(json, "Failed to load project"));
      setProject(json.data ?? null);
      if (!opts?.silent) setError("");
    } catch (e: unknown) {
      const message = formatClientFetchError(e, "Failed to load project");
      if (!opts?.silent) setError(message);
      throw new Error(message);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadProjects().catch((e: unknown) =>
        setError(formatClientFetchError(e, "Failed to load projects")),
      );
    }, 0);
    return () => window.clearTimeout(id);
  }, [loadProjects]);

  useEffect(() => {
    const id = window.setTimeout(() => setProjectId(null), 0);
    return () => window.clearTimeout(id);
  }, [organizationId]);

  useEffect(() => {
    if (projectId) return;
    const ready = sortProjectsForAdmin(
      projects.filter((p) => p.status === "READY"),
      "priority",
      "asc",
    );
    if (ready.length === 0) return;
    const id = window.setTimeout(() => setProjectId(ready[0].id), 0);
    return () => window.clearTimeout(id);
  }, [projects, projectId]);

  useEffect(() => {
    let id: number;
    if (!projectId) {
      id = window.setTimeout(() => setProject(null), 0);
      return () => window.clearTimeout(id);
    }
    id = window.setTimeout(() => {
      void loadProject(projectId).catch((e: unknown) =>
        setError(formatClientFetchError(e, "Failed to load project")),
      );
    }, 0);
    return () => window.clearTimeout(id);
  }, [projectId, loadProject]);

  const bracketSpecParse = useMemo(() => {
    if (!project) return null;
    return safeParseBracketSpec(project.spec);
  }, [project]);

  const spec = bracketSpecParse?.spec ?? null;
  const setupComplete = useMemo(() => (spec ? isBracketSetupWizardComplete(spec) : false), [spec]);

  useEffect(() => {
    if (!pendingWizardScroll || !project || !spec || setupComplete) return;
    const id = window.setTimeout(() => {
      setupWizardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setPendingWizardScroll(false);
    }, 50);
    return () => window.clearTimeout(id);
  }, [pendingWizardScroll, project, spec, setupComplete]);

  const sortedProjects = useMemo(
    () => sortProjectsForAdmin(projects, projectSortMode, projectSortDirection),
    [projects, projectSortMode, projectSortDirection],
  );
  const readyProjectsForStrip = useMemo(() => {
    const ready = sortProjectsForAdmin(
      projects.filter((p) => p.status === "READY"),
      "priority",
      "asc",
    );
    if (project && !ready.some((p) => p.id === project.id)) {
      return [project, ...ready];
    }
    return ready;
  }, [projects, project]);
  const projectPriorityOptions = useMemo(() => {
    const current = Number(projectPriorityDraft);
    const maxPriority = Math.max(
      PROJECT_PRIORITY_OPTION_FLOOR,
      projects.length - 1,
      Number.isFinite(current) ? Math.trunc(current) : 0,
    );
    return Array.from({ length: maxPriority + 1 }, (_, priority) => priority);
  }, [projectPriorityDraft, projects.length]);

  useEffect(() => {
    let id: number;
    if (!projectId) {
      id = window.setTimeout(() => setReferenceUrl(""), 0);
      return () => window.clearTimeout(id);
    }
    if (!project || project.id !== projectId) {
      id = window.setTimeout(() => setReferenceUrl(""), 0);
      return () => window.clearTimeout(id);
    }
    const s = bracketSpecParse?.spec;
    if (!s) {
      id = window.setTimeout(() => setReferenceUrl(""), 0);
      return () => window.clearTimeout(id);
    }
    id = window.setTimeout(() => setReferenceUrl(s.referenceUrl ?? ""), 0);
    return () => window.clearTimeout(id);
  }, [projectId, project, bracketSpecParse]);

  useEffect(() => {
    if (!project) return;
    const id = window.setTimeout(() => setProjectNameDraft(project.name), 0);
    return () => window.clearTimeout(id);
  }, [project]);

  useEffect(() => {
    if (!project) return;
    const id = window.setTimeout(() => setProjectPriorityDraft(String(project.priority ?? 0)), 0);
    return () => window.clearTimeout(id);
  }, [project]);

  const bracketPdfCaptureRef = useRef<HTMLDivElement>(null);
  const projectsPanelRef = useRef<HTMLDetailsElement>(null);
  const setupWizardRef = useRef<HTMLDivElement>(null);

  const svgMarkup = spec ? buildBracketSvgPreview(spec) : "";
  const bracketLayoutBuild = useMemo(() => {
    if (!spec) return { layout: null as BracketLayout | null, error: null as string | null };
    try {
      return { layout: buildBracketLayout(spec), error: null };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[bracket-layout] buildBracketLayout threw:", msg, e);
      return { layout: null, error: msg };
    }
  }, [spec]);

  const bracketLayout = bracketLayoutBuild.layout;

  const scoringSupported = useMemo(
    () => Boolean(spec && bracketLayout && canUseConnectedBracketScoring(spec, bracketLayout)),
    [spec, bracketLayout],
  );

  const bracketHasSavedScores = useMemo(() => Boolean(spec && specHasSavedScores(spec)), [spec]);

  const [scoreEditing, setScoreEditing] = useState(false);
  const [scoreDraft, setScoreDraft] = useState<Record<string, BracketMatchScores>>({});

  useEffect(() => {
    let id: number;
    if (!spec || !scoringSupported) {
      id = window.setTimeout(() => {
        setScoreDraft({});
        setScoreEditing(false);
      }, 0);
      return () => window.clearTimeout(id);
    }
    id = window.setTimeout(() => {
      setScoreDraft(scoresFromSpec(spec));
      setScoreEditing(false);
    }, 0);
    return () => window.clearTimeout(id);
  }, [project?.id, project?.updatedAt, spec, scoringSupported]);

  const scoringView: BracketScoringViewProps | null = useMemo(() => {
    if (!scoringSupported) return null;
    return {
      enabled: true,
      editing: scoreEditing,
      scores: scoreDraft,
      onScoresChange: (matchId, patch) => {
        setScoreDraft((prev) => ({
          ...prev,
          [matchId]: { ...prev[matchId], ...patch },
        }));
      },
    };
  }, [scoringSupported, scoreEditing, scoreDraft]);

  const siteThemeDefaults = useMemo(
    () => getContentOrgBrandColors(organizationId),
    [organizationId],
  );
  const bracketBranding = useMemo(
    () => getTournamentBracketBrandingForOrg(organizationId),
    [organizationId],
  );

  const resolvedBracketTheme = useMemo(
    () => resolveBracketThemeColors(spec, siteThemeDefaults),
    [spec, siteThemeDefaults],
  );

  const bracketWatermarkUrl = bracketWatermarkSrc(
    spec?.flyer?.logoUrl,
    bracketBranding.targetLogoPath,
    project?.updatedAt ?? Date.now(),
  );

  const [bracketColorDraftPrimary, setBracketColorDraftPrimary] = useState(siteThemeDefaults.primaryHex);
  const [bracketColorDraftAccent, setBracketColorDraftAccent] = useState(siteThemeDefaults.accentHex);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setBracketColorDraftPrimary(resolvedBracketTheme.primaryHex);
      setBracketColorDraftAccent(resolvedBracketTheme.accentHex);
    }, 0);
    return () => window.clearTimeout(id);
  }, [resolvedBracketTheme.primaryHex, resolvedBracketTheme.accentHex]);

  const [parkHeadingDraft, setParkHeadingDraft] = useState("");
  const [parkBodyDraft, setParkBodyDraft] = useState("");
  const [parkContactsDraft, setParkContactsDraft] = useState<{ name: string; phone: string }[]>([
    { name: "", phone: "" },
    { name: "", phone: "" },
  ]);
  const [championAgeGroupDraft, setChampionAgeGroupDraft] = useState("");
  const [thirdPlaceInfoDraft, setThirdPlaceInfoDraft] = useState({
    officialGameNumber: "",
    dateLabel: "",
    time: "",
    venue: "",
    field: "",
  });
  const [gcWidgetIdDraft, setGcWidgetIdDraft] = useState("");
  const [gcEmbedSnippetDraft, setGcEmbedSnippetDraft] = useState("");
  const [gcMaxVerticalDraft, setGcMaxVerticalDraft] = useState("4");
  const [adminGcModalMatchId, setAdminGcModalMatchId] = useState<string | null>(null);

  const gcConfigParsed = spec?.gameChanger
    ? bracketGameChangerSchema.safeParse(spec.gameChanger)
    : null;
  const gcConfig = gcConfigParsed?.success ? gcConfigParsed.data : null;
  const {
    liveGameStatuses: adminLiveStatuses,
    eventsByMatchId: adminEventsByMatchId,
    importCompleted: importGcCompletedScores,
    loading: gcSyncLoading,
  } = useGameChangerAdminSync(projectId, Boolean(gcConfig?.widgetId), () => {
    if (projectId) {
      void loadProject(projectId, { silent: true }).catch((e: unknown) => {
        console.warn("[bracket] background reload after GameChanger sync failed:", e);
      });
    }
  });

  useEffect(() => {
    let id: number;
    if (!spec) {
      id = window.setTimeout(() => {
        setParkHeadingDraft("");
        setParkBodyDraft("");
        setParkContactsDraft([
          { name: "", phone: "" },
          { name: "", phone: "" },
        ]);
        setChampionAgeGroupDraft("");
        setThirdPlaceInfoDraft({
          officialGameNumber: "",
          dateLabel: "",
          time: "",
          venue: "",
          field: "",
        });
        setGcWidgetIdDraft("");
        setGcEmbedSnippetDraft("");
        setGcMaxVerticalDraft("4");
      }, 0);
      return () => window.clearTimeout(id);
    }
    const c = spec.parkInfo?.contacts ?? [];
    id = window.setTimeout(() => {
      setParkHeadingDraft(spec.parkInfo?.heading ?? "");
      setParkBodyDraft(spec.parkInfo?.body ?? "");
      setParkContactsDraft([
        { name: c[0]?.name ?? "", phone: c[0]?.phone ?? "" },
        { name: c[1]?.name ?? "", phone: c[1]?.phone ?? "" },
      ]);
      setChampionAgeGroupDraft(spec.championAgeGroupLabel ?? "");
      setThirdPlaceInfoDraft({
        officialGameNumber: spec.thirdPlaceGame?.officialGameNumber ?? "",
        dateLabel: spec.thirdPlaceGame?.dateLabel ?? "",
        time: spec.thirdPlaceGame?.time ?? "",
        venue: spec.thirdPlaceGame?.venue ?? "",
        field: spec.thirdPlaceGame?.field ?? "",
      });
      setGcWidgetIdDraft(spec.gameChanger?.widgetId ?? "");
      setGcMaxVerticalDraft(String(spec.gameChanger?.maxVerticalGamesVisible ?? 4));
      setGcEmbedSnippetDraft("");
    }, 0);
    return () => window.clearTimeout(id);
  }, [spec]);

  async function saveGameChangerConfig() {
    if (!projectId) return;
    const widgetId = gcWidgetIdDraft.trim();
    if (!widgetId) {
      setError("Enter a GameChanger widget ID or paste the embed snippet.");
      return;
    }
    const maxN = Number.parseInt(gcMaxVerticalDraft, 10);
    setBusy(true);
    setError("");
    try {
      await patchSpec({
        gameChanger: {
          widgetId,
          autoImportFinalScores: true,
          ...(Number.isFinite(maxN) && maxN >= 1 && maxN <= 20
            ? { maxVerticalGamesVisible: maxN }
            : {}),
        },
      });
      setNotice("GameChanger scoreboard saved for this bracket.");
      await loadProject(projectId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function clearGameChangerConfig() {
    if (!projectId) return;
    setBusy(true);
    setError("");
    try {
      await patchSpec({ gameChanger: null });
      setNotice("GameChanger scoreboard removed from this bracket.");
      await loadProject(projectId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function applyGameChangerEmbedSnippet() {
    const result = parseGameChangerEmbedSnippet(gcEmbedSnippetDraft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setGcWidgetIdDraft(result.config.widgetId);
    if (result.config.maxVerticalGamesVisible != null) {
      setGcMaxVerticalDraft(String(result.config.maxVerticalGamesVisible));
    }
    setNotice("Parsed widget ID from embed snippet. Click Save GameChanger to store it.");
  }

  async function saveParkInfo() {
    if (!projectId) return;
    setBusy(true);
    setError("");
    try {
      const contactsBuilt = parkContactsDraft
        .map((row) => {
          const n = row.name.trim();
          const p = row.phone.trim();
          if (!n && !p) return null;
          return { ...(n ? { name: n } : {}), ...(p ? { phone: p } : {}) };
        })
        .filter((x): x is { name?: string; phone?: string } => x != null);
      await patchSpec({
        parkInfo: {
          heading: parkHeadingDraft.trim() || undefined,
          body: parkBodyDraft.trim() || undefined,
          contacts: contactsBuilt,
        },
      });
      setNotice("Park information saved for this bracket.");
      await loadProject(projectId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveChampionPodiumLabel() {
    if (!projectId) return;
    setBusy(true);
    setError("");
    try {
      await patchSpec({ championAgeGroupLabel: championAgeGroupDraft.trim() || null });
      setNotice("Champion banner label saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveThirdPlaceGameInfo() {
    if (!projectId || !spec) return;
    const podium = bracketLayout?.mode === "tree" ? bracketLayout.podium : null;
    const current = spec.thirdPlaceGame;
    const nextThirdPlaceGame: NonNullable<BracketSpec["thirdPlaceGame"]> = {
      home: current?.home?.trim() || podium?.thirdPlaceSlotHome || "TBD",
      away: current?.away?.trim() || podium?.thirdPlaceSlotAway || "TBD",
    };
    if (current?.homeScore != null) nextThirdPlaceGame.homeScore = current.homeScore;
    if (current?.awayScore != null) nextThirdPlaceGame.awayScore = current.awayScore;
    if (current?.winnerSide) nextThirdPlaceGame.winnerSide = current.winnerSide;

    const officialGameNumber = thirdPlaceInfoDraft.officialGameNumber.trim();
    const dateLabel = thirdPlaceInfoDraft.dateLabel.trim();
    const time = thirdPlaceInfoDraft.time.trim();
    const venue = thirdPlaceInfoDraft.venue.trim();
    const field = thirdPlaceInfoDraft.field.trim();
    if (officialGameNumber) nextThirdPlaceGame.officialGameNumber = officialGameNumber;
    if (dateLabel) nextThirdPlaceGame.dateLabel = dateLabel;
    if (time) nextThirdPlaceGame.time = time;
    if (venue) nextThirdPlaceGame.venue = venue;
    if (field) nextThirdPlaceGame.field = field;

    setBusy(true);
    setError("");
    try {
      await patchSpec({ thirdPlaceGame: nextThirdPlaceGame });
      setNotice("3rd place game information saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function createBracketProject(options?: { scrollToWizard?: boolean; name?: string }) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const name = (options?.name ?? draftName).trim() || `${seasonYear} Tournament Bracket`;
      const res = await fetch("/api/admin/tournament-brackets/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          seasonYear,
          name,
          priority: 0,
        }),
      });
      const json = await readApiJson<{ data?: { id: string }; error?: string; hint?: string }>(res);
      if (!res.ok) throw new Error(apiErrorMessage(json, "Create failed"));
      setNotice(
        options?.scrollToWizard
          ? "Bracket created — complete guided setup below."
          : "Project created.",
      );
      await loadProjects();
      if (json.data?.id) {
        if (options?.scrollToWizard) setPendingWizardScroll(true);
        setProjectId(json.data.id);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    await createBracketProject();
  }

  async function handleCreateBracket() {
    const suggested = draftName.trim() || `${seasonYear} Tournament Bracket`;
    const name = window.prompt("Bracket name", suggested);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Bracket name is required.");
      return;
    }
    setDraftName(trimmed);
    await createBracketProject({ scrollToWizard: true, name: trimmed });
  }

  async function handleDeleteProject(p: ProjectRow) {
    const ok = window.confirm(
      `Delete “${p.name}” (${p.seasonYear}, ${p.status})? This cannot be undone.`,
    );
    if (!ok) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/tournament-brackets/projects/${p.id}`, { method: "DELETE" });
      const json = await readApiJson<{ error?: string; hint?: string; data?: { deleted?: boolean } }>(res);
      if (!res.ok) throw new Error(apiErrorMessage(json, "Delete failed"));
      if (projectId === p.id) {
        setProjectId(null);
        setProject(null);
      }
      setNotice("Project deleted.");
      await loadProjects();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function patchSpec(partial: Record<string, unknown>) {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/admin/tournament-brackets/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specPatch: partial }),
      });
      const json = await readApiJson<{ error?: string; hint?: string }>(res);
      if (!res.ok) throw new Error(apiErrorMessage(json, "Save failed"));
      await loadProject(projectId);
    } catch (e: unknown) {
      throw new Error(formatClientFetchError(e, "Save failed"));
    }
  }

  async function saveProjectName() {
    if (!projectId || !project) return;
    const name = projectNameDraft.trim();
    if (!name) {
      setError("Project name cannot be empty.");
      return;
    }
    if (name === project.name) {
      setNotice("Project name unchanged.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/tournament-brackets/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await readApiJson<{ error?: string; hint?: string }>(res);
      if (!res.ok) throw new Error(apiErrorMessage(json, "Could not save project name"));
      await loadProject(projectId);
      await loadProjects();
      setNotice("Project name saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveProjectPriority() {
    if (!projectId || !project) return;
    const priority = Number(projectPriorityDraft);
    if (!Number.isFinite(priority)) {
      setError("Priority must be a number.");
      return;
    }
    const normalized = Math.trunc(priority);
    if (normalized === (project.priority ?? 0)) {
      setNotice("Project priority unchanged.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/tournament-brackets/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: normalized }),
      });
      const json = await readApiJson<{ error?: string; hint?: string }>(res);
      if (!res.ok) throw new Error(apiErrorMessage(json, "Could not save project priority"));
      await loadProject(projectId);
      await loadProjects();
      setNotice("Project priority saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function updateProjectStatus(nextStatus: ProjectStatus) {
    if (!projectId || !project) return;
    if (project.status === nextStatus) {
      setNotice(`Project is already ${nextStatus}.`);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/admin/tournament-brackets/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await readApiJson<{ error?: string; hint?: string }>(res);
      if (!res.ok) throw new Error(apiErrorMessage(json, "Could not update project status"));
      await loadProject(projectId);
      await loadProjects();
      setNotice(
        nextStatus === "READY"
          ? "Bracket posted to the public Tournaments page."
          : nextStatus === "ARCHIVED"
            ? "Bracket archived and hidden from the public Tournaments page."
            : "Bracket returned to draft and hidden from the public Tournaments page.",
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleLogoAndPalette(file: File) {
    if (!projectId) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("projectId", projectId);
      const up = await fetch("/api/admin/tournament-brackets/upload", { method: "POST", body: form });
      const upJson = await readApiJson<{ data?: { url: string }; error?: string; hint?: string }>(up);
      if (!up.ok) throw new Error(apiErrorMessage(upJson, "Upload failed"));
      const palette = await extractPaletteFromFile(file);
      const cur = safeParseBracketSpec(project?.spec).spec;
      await patchSpec({
        flyer: {
          ...cur.flyer,
          logoUrl: upJson.data?.url,
          ...(palette ? { primaryHex: palette.primary, accentHex: palette.accent } : {}),
        },
      });
      setNotice(
        palette
          ? "Logo uploaded and palette applied to flyer options."
          : "Logo uploaded. Automatic color sampling was skipped for this file type (you can set bracket colors manually).",
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleIngestFile(file: File) {
    if (!projectId) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("projectId", projectId);
      form.append("profile", "auto");
      form.append("mergeMode", "replace");
      form.append("file", file, file.name);
      const res = await fetch("/api/admin/tournament-brackets/ingest", {
        method: "POST",
        body: form,
      });
      const json = await readApiJson<{
        data?: { gamesImported?: number; warnings?: string[] };
        error?: string;
        hint?: string;
      }>(res);
      if (!res.ok) {
        throw new Error(apiErrorMessage(json, `Ingest failed (HTTP ${res.status})`));
      }
      const w = json.data?.warnings?.join(" ") ?? "";
      const n = json.data?.gamesImported ?? 0;
      setNotice(
        n > 0
          ? `Imported ${n} games.${w ? ` ${w}` : ""}`.trim()
          : `Ingest completed with 0 games.${w ? ` ${w}` : " No warnings returned."}`.trim(),
      );
      try {
        await loadProject(projectId);
      } catch (refreshErr: unknown) {
        throw new Error(
          refreshErr instanceof Error
            ? `Ingest saved but reloading the project failed: ${refreshErr.message}`
            : "Ingest saved but reloading the project failed.",
        );
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleReferenceFetch() {
    if (!projectId || !referenceUrl.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/tournament-brackets/reference-fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, url: referenceUrl.trim() }),
      });
      const json = await readApiJson<{
        error?: string;
        hint?: string;
        data?: { excerptChars?: number };
      }>(res);
      if (!res.ok) throw new Error(apiErrorMessage(json, "Fetch failed"));
      setNotice(`Reference excerpt stored (${json.data?.excerptChars ?? 0} chars).`);
      await loadProject(projectId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function exportFlyerPdf() {
    if (!spec || !project) return;

    function hexToRgb(hex: string): [number, number, number] {
      const h = hex.replace("#", "").trim();
      if (h.length !== 6) return [24, 24, 27];
      const n = Number.parseInt(h, 16);
      if (Number.isNaN(n)) return [24, 24, 27];
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    setBusy(true);
    setError("");
    try {
      const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      let y = 48;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text(project.name, 40, y);
      y += 28;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.text(`${project.organizationId.toUpperCase()} · ${project.seasonYear}`, 40, y);
      y += 36;
      if (spec.flyer?.primaryHex) {
        const [r, g, b] = hexToRgb(spec.flyer.primaryHex);
        doc.setFillColor(r, g, b);
        doc.rect(0, 0, pageW, 14, "F");
      }
      doc.setFontSize(10);
      if (spec.games.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.text("Schedule (imported games)", 40, y);
        y += 16;
        doc.setFont("helvetica", "normal");
        spec.games.slice(0, 40).forEach((g, i) => {
          doc.text(`${i + 1}. ${g.homeTeam} vs ${g.awayTeam}  ${g.dateLabel || ""} ${g.time || ""}`, 40, y);
          y += 16;
          if (y > pageH - 60) {
            doc.addPage();
            y = 48;
          }
        });
      }

      const layout = bracketLayout;
      if (layout && layout.mode === "tree" && bracketPdfCaptureRef.current) {
        try {
          const html2canvas = (await import("html2canvas")).default;
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          });
          const node = bracketPdfCaptureRef.current;
          const canvas = await html2canvas(node, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: "#eef2f7",
            scrollX: 0,
            scrollY: -window.scrollY,
            onclone: (_clonedDoc, cloned) => {
              if (cloned instanceof HTMLElement && node instanceof HTMLElement) {
                flattenBracketCloneForHtml2Canvas(node, cloned);
                stripBracketPreviewScaleForCapture(cloned);
              }
            },
          });
          const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
          if (y > pageH - 120) {
            doc.addPage();
            y = 48;
          }
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.text("Tournament", 40, y);
          y += 18;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          const margin = 40;
          const maxW = pageW - 2 * margin;
          const props = doc.getImageProperties(dataUrl);
          const dispH = (props.height * maxW) / props.width;
          const maxH = pageH - y - 48;
          const scale = dispH > maxH ? maxH / dispH : 1;
          const drawW = maxW * scale;
          const drawH = dispH * scale;
          doc.addImage(dataUrl, "JPEG", margin, y, drawW, drawH);
          y += drawH + 20;
        } catch (e) {
          console.error(e);
          if (y > pageH - 40) {
            doc.addPage();
            y = 48;
          }
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(120, 120, 120);
          doc.text(
            "Bracket snapshot could not be captured for this PDF. Use “Export bracket HTML” and print to PDF instead.",
            40,
            y,
            { maxWidth: pageW - 80 },
          );
          doc.setTextColor(0, 0, 0);
          y += 36;
        }
      } else if (layout && layout.mode === "tree" && !bracketPdfCaptureRef.current) {
        if (y > pageH - 40) {
          doc.addPage();
          y = 48;
        }
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text(
          "Bracket preview is not on screen yet (finish setup to show it). This PDF has no bracket image.",
          40,
          y,
          { maxWidth: pageW - 80 },
        );
        doc.setTextColor(0, 0, 0);
        y += 36;
      } else if (layout && layout.mode === "match_grid" && layout.games.length > 0) {
        if (y > pageH - 40) {
          doc.addPage();
          y = 48;
        }
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.text("Bracket is in schedule grid mode; use HTML export for the column bracket.", 40, y, {
          maxWidth: pageW - 80,
        });
        y += 28;
        doc.setFont("helvetica", "normal");
      }

      if (spec.flyer?.includeSponsors && spec.flyer.sponsorStrip?.length) {
        if (y > pageH - 80) {
          doc.addPage();
          y = 48;
        }
        y += 12;
        doc.setFont("helvetica", "bold");
        doc.text("Sponsors", 40, y);
        y += 18;
        doc.setFont("helvetica", "normal");
        for (const s of spec.flyer.sponsorStrip) {
          doc.text(`· ${s.label}`, 40, y);
          y += 14;
          if (y > pageH - 40) {
            doc.addPage();
            y = 48;
          }
        }
      }
      doc.save(`bracket-flyer-${project.id.slice(0, 8)}.pdf`);
      setNotice(
        "Flyer PDF downloaded (landscape letter, title, optional schedule, bracket snapshot, optional sponsors).",
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "PDF export failed.");
    } finally {
      setBusy(false);
    }
  }

  async function applyBracketThemeColors() {
    if (!projectId) return;
    setBusy(true);
    setError("");
    try {
      const p = normalizeHex6(bracketColorDraftPrimary);
      const a = normalizeHex6(bracketColorDraftAccent);
      if (!p || !a) {
        throw new Error("Enter valid hex colors (e.g. #590275).");
      }
      const siteP = normalizeHex6(siteThemeDefaults.primaryHex);
      const siteA = normalizeHex6(siteThemeDefaults.accentHex);
      const sameAsSite =
        siteP && siteA && p.toLowerCase() === siteP.toLowerCase() && a.toLowerCase() === siteA.toLowerCase();
      await patchSpec(
        sameAsSite
          ? { bracketThemePrimaryHex: null, bracketThemeAccentHex: null }
          : { bracketThemePrimaryHex: p, bracketThemeAccentHex: a },
      );
      setNotice(sameAsSite ? "Using target site colors (no custom override stored)." : "Bracket colors saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function resetBracketThemeToSiteDefaults() {
    if (!projectId) return;
    setBusy(true);
    setError("");
    try {
      await patchSpec({ bracketThemePrimaryHex: null, bracketThemeAccentHex: null });
      setNotice("Bracket colors reset to target site defaults.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveBracketScores() {
    if (!spec || !scoringSupported) return;
    const downstreamIds = new Set<string>();
    for (const matchId of Object.keys(scoreDraft)) {
      const prev = scoresFromSpec(spec)[matchId];
      const next = scoreDraft[matchId];
      if (JSON.stringify(prev) !== JSON.stringify(next)) {
        for (const id of getDownstreamMatchIdsForRescore(spec, matchId)) {
          downstreamIds.add(id);
        }
      }
    }
    const hasDownstreamScores = [...downstreamIds].some((id) => {
      const s = scoresFromSpec(spec)[id];
      return s && (s.homeScore != null || s.awayScore != null || s.winnerSide);
    });
    if (hasDownstreamScores) {
      const ok = window.confirm(
        "Changing these scores will clear results for later games that depend on them. Continue?",
      );
      if (!ok) return;
    }
    setBusy(true);
    setError("");
    try {
      const merged = mergeMatchScoresIntoSpec(spec, scoreDraft);
      const specPatch: Record<string, unknown> = { rounds: merged.rounds };
      if (merged.thirdPlaceGame) {
        specPatch.thirdPlaceGame = merged.thirdPlaceGame;
      }
      await patchSpec(specPatch);
      setNotice("Bracket scores saved.");
      setScoreEditing(false);
      if (projectId) await loadProject(projectId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function clearAllBracketScores() {
    if (!spec) return;
    if (!specHasSavedScores(spec)) {
      setNotice("No saved scores on this bracket.");
      return;
    }
    const ok = window.confirm(
      "Clear all scores? Later rounds reset to TBD; any third-place game is removed until semifinals are scored again.",
    );
    if (!ok) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const cleared = clearBracketScoringFromSpec(spec);
      await patchSpec({
        rounds: cleared.rounds,
        thirdPlaceGame: null,
      });
      setNotice("All bracket scores cleared.");
      setScoreEditing(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function exportBracketHtml() {
    if (!project || !bracketLayout) return;
    const html = buildBracketExportHtmlDocument(project.name, bracketLayout, resolvedBracketTheme, {
      logoWatermarkUrl: bracketWatermarkUrl,
      parentOrganizationLogo: {
        src: bracketBranding.parentLogoPath,
        name: bracketBranding.parentName,
      },
      parkInfo: spec?.parkInfo,
      surfaceHeadingLabel: project.name,
    });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bracket-${project.id.slice(0, 8)}.html`;
    a.rel = "noopener";
    a.click();
    URL.revokeObjectURL(url);
    setNotice("Bracket HTML downloaded.");
  }

  function renderTournamentPageControls() {
    if (!project) return null;
    return (
      <div className="mt-4 space-y-2 rounded-lg border border-zinc-700/80 bg-zinc-950/40 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tournament page</h3>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
              Current status: <span className="font-semibold text-zinc-300">{project.status}</span>. READY brackets
              appear on the public Tournaments page.
            </p>
          </div>
          <a
            href="/tournaments"
            className="text-xs font-semibold text-brand-gold hover:text-brand-gold/80"
          >
            Open page
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || project.status === "DRAFT"}
            onClick={() => void updateProjectStatus("DRAFT")}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
          >
            Save as draft
          </button>
          <button
            type="button"
            disabled={busy || project.status === "READY"}
            onClick={() => void updateProjectStatus("READY")}
            className="rounded-lg border border-emerald-600/80 bg-emerald-900/80 px-3 py-2 text-xs font-semibold text-emerald-50 hover:bg-emerald-800 disabled:opacity-40"
          >
            Post to Tournaments
          </button>
          <button
            type="button"
            disabled={busy || project.status === "ARCHIVED"}
            onClick={() => void updateProjectStatus("ARCHIVED")}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-amber-700 hover:bg-amber-950/40 hover:text-amber-100 disabled:opacity-40"
          >
            Archive
          </button>
        </div>
      </div>
    );
  }


  const focusPreview = Boolean(spec && project && setupComplete);
  const showSetupWizardAtTop = Boolean(spec && project && !setupComplete);

  function openProjectsPanel() {
    const el = projectsPanelRef.current;
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function importCompletedGameChangerScores() {
    if (!gcConfig) return;
    setBusy(true);
    setError("");
    try {
      const imported = await importGcCompletedScores();
      const n = imported.length;
      setNotice(
        n > 0
          ? `Imported ${n} completed GameChanger game${n === 1 ? "" : "s"} into the bracket.`
          : "No completed GameChanger games matched bracket games with importable scores.",
      );
      if (projectId) await loadProject(projectId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function renderScoreToolbar() {
    if (!scoringSupported) return null;
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
        {gcConfig ? (
          <button
            type="button"
            disabled={busy || gcSyncLoading}
            title="Apply final GameChanger scores to matching bracket games"
            onClick={() => void importCompletedGameChangerScores()}
            className="rounded-lg border border-emerald-600/70 bg-emerald-950/90 px-2.5 py-1 text-xs font-semibold text-emerald-100 hover:bg-emerald-900/90 disabled:opacity-40"
          >
            Import completed GameChanger scores
          </button>
        ) : null}
        <button type="button" disabled={busy || !bracketHasSavedScores} title={bracketHasSavedScores ? "Remove every saved score and reset later rounds" : "No scores saved yet"} onClick={() => void clearAllBracketScores()} className="rounded-lg border border-amber-600/70 bg-amber-950/90 px-2.5 py-1 text-xs font-semibold text-amber-100 hover:bg-amber-900/90 disabled:opacity-40">Clear scores</button>
        {scoreEditing ? (<><button type="button" disabled={busy} onClick={() => { if (spec) setScoreDraft(scoresFromSpec(spec)); setScoreEditing(false); }} className="rounded-lg border border-slate-500/80 bg-slate-900/90 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40">Cancel</button><button type="button" disabled={busy} onClick={() => void saveBracketScores()} className="rounded-lg border border-violet-500/80 bg-violet-800/95 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-40">Save scores</button></>) : (<button type="button" disabled={busy} onClick={() => setScoreEditing(true)} className="rounded-lg border border-violet-500/80 bg-violet-800/95 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-40">Edit scores</button>)}
      </div>
    );
  }

  function renderCompactProjectStrip() {
    const readyCount = readyProjectsForStrip.filter((p) => p.status === "READY").length;
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3">
        <label className="min-w-0 flex-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Ready bracket</span>
          <select
            value={projectId ?? ""}
            disabled={busy || readyProjectsForStrip.length === 0}
            onChange={(e) => {
              const nextId = e.target.value;
              if (nextId) setProjectId(nextId);
            }}
            aria-label="Switch ready bracket"
            className="mt-1 w-full min-w-0 truncate rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm font-semibold text-zinc-100 outline-none focus:border-zinc-500 disabled:opacity-40"
          >
            {readyProjectsForStrip.length === 0 ? (
              <option value="">No ready brackets yet</option>
            ) : (
              readyProjectsForStrip.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.status !== "READY" ? ` (${p.status})` : ""}
                </option>
              ))
            )}
          </select>
          <p className="mt-1 text-[11px] text-zinc-500">
            {getOrgDisplayName(organizationId)}
            {project ? ` · ${project.seasonYear}` : ` · ${seasonYear}`}
            {readyCount > 1 ? ` · ${readyCount} ready` : null}
          </p>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleCreateBracket()}
            className="rounded-lg bg-red-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
          >
            Create bracket
          </button>
          <button
            type="button"
            onClick={openProjectsPanel}
            className="rounded-lg border border-zinc-600 px-2.5 py-1 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
          >
            All projects
          </button>
          <a
            href="/tournaments"
            className="rounded-lg border border-zinc-600 px-2.5 py-1 text-xs font-semibold text-brand-gold hover:bg-zinc-800"
          >
            Public page
          </a>
        </div>
      </div>
    );
  }
  function renderSetupWizard() {
    if (!spec || !project) return null;
    return (
      <BracketSetupWizard
        spec={spec}
        projectId={project.id}
        organizationId={project.organizationId}
        seasonYear={project.seasonYear}
        busy={busy}
        setupComplete={setupComplete}
        onApply={async (patch) => {
          setBusy(true);
          setError("");
          try {
            await patchSpec(patch);
            setNotice("Bracket updated from guided setup.");
            await loadProject(project.id);
          } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
        onSkipGuidedSetup={async () => {
          setBusy(true);
          setError("");
          try {
            await patchSpec({ setupWizardCompleted: true });
            setNotice("Bracket structure and preview unlocked. Define rounds in Bracket structure.");
            await loadProject(project.id);
          } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  return (
    <section className="flex flex-col gap-4" data-admin-tournament-brackets="true">
      {error ? (
        <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="min-w-0 flex-1">{error}</p>
            <button
              type="button"
              className="shrink-0 rounded-md border border-red-600 px-2.5 py-1 text-xs font-semibold text-red-100 hover:bg-red-900/50"
              onClick={() => {
                setError("");
                void loadProjects().catch((e: unknown) =>
                  setError(formatClientFetchError(e, "Failed to load projects")),
                );
                if (projectId) {
                  void loadProject(projectId).catch((e: unknown) =>
                    setError(formatClientFetchError(e, "Failed to load project")),
                  );
                }
              }}
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-300">{notice}</div>
      ) : null}
      {project && bracketSpecParse && !bracketSpecParse.ok ? (
        <div className="rounded-lg border border-amber-600 bg-amber-950/35 p-3 text-sm text-amber-100">
          <p className="font-semibold text-amber-50">Bracket preview: saved data failed validation</p>
          <p className="mt-1 text-xs text-amber-200/90">
            Project <span className="font-mono">{project.id}</span>. The editor fell back to empty defaults, so rounds can disappear until you fix or restore the spec. Search your{" "}
            <strong>browser console</strong> or <strong>server terminal</strong> for{" "}
            <span className="font-mono">[bracket-spec]</span> when loading or saving this project.
          </p>
          <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-black/30 p-2 text-[11px] leading-snug whitespace-pre-wrap break-all text-amber-100/95">
            {bracketSpecParse.issues}
          </pre>
        </div>
      ) : null}
      {project && bracketLayoutBuild.error ? (
        <div className="rounded-lg border border-red-600 bg-red-950/35 p-3 text-sm text-red-200">
          <p className="font-semibold text-red-100">Bracket layout build crashed</p>
          <p className="mt-1 font-mono text-xs">{bracketLayoutBuild.error}</p>
          <p className="mt-2 text-xs text-red-300/90">
            Search the browser console for <span className="font-mono">[bracket-layout]</span>.
          </p>
        </div>
      ) : null}

      {renderCompactProjectStrip()}

      <details className="rounded-xl border border-zinc-800 bg-zinc-900/70">
        <summary className="cursor-pointer p-4 text-xs font-semibold uppercase text-zinc-400 marker:content-none [&::-webkit-details-marker]:hidden">
          Map team names (all brackets)
        </summary>
        <div className="border-t border-zinc-800 p-4 sm:p-5">
          <BracketTeamNameBulkMapper
            organizationId={organizationId}
            seasonYear={project?.seasonYear ?? seasonYear}
            busy={busy}
            onBusyChange={setBusy}
            onNotice={setNotice}
            onError={setError}
            onProjectUpdated={(id) => {
              void loadProjects();
              if (projectId === id) void loadProject(id);
            }}
          />
        </div>
      </details>

      {showSetupWizardAtTop ? (
        <div ref={setupWizardRef} className="space-y-4" style={{ order: focusPreview ? 1 : 0 }}>
          {renderSetupWizard()}
        </div>
      ) : null}

      <details
        ref={projectsPanelRef}
        id="bracket-projects-panel"
        className="rounded-xl border border-zinc-800 bg-zinc-900/70"
        style={{ order: focusPreview ? 3 : 0 }}
        {...(!focusPreview && setupComplete ? { open: true } : {})}
      >
        <summary className="cursor-pointer list-none p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
          <span className="text-lg font-semibold text-zinc-100">Bracket projects</span>
          <span className="mt-0.5 block text-sm text-zinc-400">
            Per-site projects for{" "}
            <span className="font-medium text-zinc-200">{getOrgDisplayName(organizationId)}</span>
          </span>
        </summary>
        <div className="space-y-4 border-t border-zinc-800 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 sm:sr-only">
            <h2 className="text-lg font-semibold text-zinc-100">Bracket projects</h2>
          </div>
          <label className="flex w-full shrink-0 flex-col gap-1.5 sm:w-auto sm:min-w-[220px]">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Managing site</span>
            <select
              value={organizationId}
              aria-label="Managing site for bracket projects"
              onChange={(e) => {
                const next = e.target.value as ContentOrgId;
                router.push(`${pathname}?org=${encodeURIComponent(next)}`);
              }}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
            >
              {CONTENT_ORGS.map((id) => (
                <option key={id} value={id}>
                  {getOrgDisplayName(id)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="border-t border-zinc-800 pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Open or create</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                Priority uses the saved project number first. Lower numbers appear first when direction is ascending.
              </p>
            </div>
            <div className="grid shrink-0 gap-2 sm:grid-cols-[minmax(190px,1fr)_minmax(150px,auto)]">
              <label className="flex flex-col gap-1 text-xs text-zinc-500">
                <span className="font-semibold uppercase tracking-wide">Sort projects</span>
                <select
                  value={projectSortMode}
                  onChange={(e) => setProjectSortMode(e.target.value as ProjectSortMode)}
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
                  aria-label="Sort bracket projects"
                >
                  <option value="priority">Priority</option>
                  <option value="recent">Updated date</option>
                  <option value="season">Season year</option>
                  <option value="name">Name</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-500">
                <span className="font-semibold uppercase tracking-wide">Direction</span>
                <select
                  value={projectSortDirection}
                  onChange={(e) => setProjectSortDirection(e.target.value as ProjectSortDirection)}
                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
                  aria-label="Sort bracket projects ascending or descending"
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </label>
            </div>
          </div>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
            {sortedProjects.map((p) => (
              <li key={p.id} className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setProjectId(p.id)}
                  className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-800 ${projectId === p.id ? "bg-red-950/40 text-red-100" : ""}`}
                >
                  {p.name}{" "}
                  <span className="text-zinc-500">
                    ({p.seasonYear}) {p.status} · Priority {p.priority ?? 0}
                  </span>
                </button>
                <button
                  type="button"
                  title="Remove project"
                  disabled={busy}
                  className="shrink-0 rounded-lg border border-zinc-700 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 hover:border-red-800 hover:bg-red-950/40 hover:text-red-200 disabled:opacity-40"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDeleteProject(p);
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {projectId && project ? (
            <div className="mt-4 space-y-3">
              <div className="space-y-2 rounded-lg border border-zinc-700/80 bg-zinc-950/40 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Rename this project</h3>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  This name appears in the list above, as the <strong className="text-zinc-400">bracket title</strong>{" "}
                  on the preview, and at the top of flyer / HTML exports.
                </p>
                <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
                  <input
                    value={projectNameDraft}
                    onChange={(e) => setProjectNameDraft(e.target.value)}
                    disabled={busy}
                    className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                    placeholder="Project name"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !projectNameDraft.trim() ||
                      projectNameDraft.trim() === project.name
                    }
                    onClick={() => void saveProjectName()}
                    className="min-h-10 shrink-0 rounded-lg bg-zinc-700 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-600 disabled:opacity-40"
                  >
                    Save name
                  </button>
                </div>
              </div>
              <div className="space-y-2 rounded-lg border border-zinc-700/80 bg-zinc-950/40 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Project priority</h3>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Used by Priority sorting in this list and on the public tournament tabs. Lower numbers sort first.
                </p>
                <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
                  <select
                    value={projectPriorityDraft}
                    onChange={(e) => setProjectPriorityDraft(e.target.value)}
                    disabled={busy}
                    className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm tabular-nums"
                    aria-label="Project priority"
                  >
                    {projectPriorityOptions.map((priority) => (
                      <option key={priority} value={String(priority)}>
                        Priority {priority}
                        {priority === 0 ? " (highest)" : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !Number.isFinite(Number(projectPriorityDraft)) ||
                      Math.trunc(Number(projectPriorityDraft)) === (project.priority ?? 0)
                    }
                    onClick={() => void saveProjectPriority()}
                    className="min-h-10 shrink-0 rounded-lg bg-zinc-700 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-600 disabled:opacity-40"
                  >
                    Save priority
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          <div className="mt-4 space-y-2 border-t border-zinc-800 pt-4">
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              placeholder="Project name"
            />
            <input
              type="number"
              value={seasonYear}
              onChange={(e) => setSeasonYear(Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleCreate()}
              className="w-full rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
            >
              New bracket project
            </button>
          </div>
        </div>
        </div>
      </details>

      <details
        className="rounded-xl border border-zinc-800 bg-zinc-900/70"
        style={{ order: focusPreview ? 4 : 0 }}
        {...(!focusPreview && setupComplete ? { open: true } : {})}
      >
        <summary className="cursor-pointer list-none p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
          <span className="text-lg font-semibold text-zinc-100">Official reference &amp; branding</span>
          <span className="mt-0.5 block text-sm text-zinc-400">
            Optional helpers—setup and Bracket structure still define the printable tree.
          </span>
        </summary>
        <div className="space-y-6 border-t border-zinc-800 p-4 sm:p-5">
        <div className="sr-only">
          <h2 className="text-lg font-semibold text-zinc-100">Official reference &amp; branding</h2>
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-5">
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">Official web page → saved text excerpt</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Many bracket workflows keep an official source (regional site, published bracket HTML) next to the
              builder. Paste an <strong className="text-zinc-400">HTTPS</strong> URL; we fetch the page once, strip tags
              to plain text, and store a capped excerpt on this project with the URL. Use it to double-check game
              numbers, team spelling, and division wording before you export—like pinning a reference PDF, without
              merging into the tree.
            </p>
            <p className="mt-2 text-[11px] text-zinc-500">
              Allowed host suffixes:{" "}
              {ALLOWED_REFERENCE_HOST_SUFFIXES.map((h) => (
                <code key={h} className="mr-2 rounded bg-zinc-950 px-1 py-0.5 text-zinc-400">
                  *.{h}
                </code>
              ))}
            </p>
          </div>
          <label className="block text-xs font-medium text-zinc-500">
            Page URL
            <input
              type="url"
              inputMode="url"
              value={referenceUrl}
              onChange={(e) => setReferenceUrl(e.target.value)}
              disabled={!projectId || busy}
              placeholder="https://www.littleleague.org/…"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            />
          </label>
          {referenceUrl.trim() && !isReferenceUrlAllowed(referenceUrl) ? (
            <p className="text-xs text-amber-200/90">
              This host is not on the allowlist above. Use an official bracket or tournament page from one of those
              domains, or leave the field blank.
            </p>
          ) : null}
          {spec?.fetchedReferenceExcerpt ? (
            <p className="text-xs text-emerald-200/90">
              Excerpt on file: {spec.fetchedReferenceExcerpt.length.toLocaleString()} characters
              {spec.referenceUrl ? (
                <>
                  {" "}
                  from{" "}
                  <a
                    href={spec.referenceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-emerald-700/80 hover:text-emerald-100"
                  >
                    saved URL
                  </a>
                </>
              ) : null}
              . Save again to replace.
            </p>
          ) : null}
          <button
            type="button"
            disabled={
              !projectId ||
              busy ||
              !referenceUrl.trim() ||
              !isReferenceUrlAllowed(referenceUrl.trim())
            }
            onClick={() => void handleReferenceFetch()}
            className="rounded-lg border border-sky-800/70 bg-sky-950/35 px-3 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-900/40 disabled:opacity-40"
          >
            Fetch page &amp; save excerpt to project
          </button>
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-5">
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">League logo (flyer, colors, bracket watermark)</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Upload a <strong className="text-zinc-400">PNG, JPEG, WebP, or SVG</strong> league mark. We store the
              image URL on the project and sample two colors from raster images for the flyer header strip (SVG skips
              auto-colors; set bracket colors manually if needed). The same logo is drawn very faintly behind the
              bracket preview and public page when present. For raster files, prefer at least ~672px on the long edge
              (larger is fine — the watermark scales down).
            </p>
          </div>
          <label className="block text-xs font-medium text-zinc-500">
            Image file
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg"
              disabled={!projectId || busy}
              className="mt-1 block w-full text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleLogoAndPalette(f);
                e.target.value = "";
              }}
            />
          </label>
          {spec?.flyer?.logoUrl ? (
            <div className="space-y-1">
              <p className="text-xs text-zinc-500">
                Current file:{" "}
                <a
                  href={spec.flyer.logoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-300 underline hover:text-sky-200"
                >
                  Open uploaded logo
                </a>
              </p>
              {spec.flyer.logoUrl.startsWith("/uploads/") &&
              typeof window !== "undefined" &&
              !/localhost|127\.0\.0\.1/.test(window.location.hostname) ? (
                <p className="text-xs leading-relaxed text-amber-400/90">
                  This file was saved from local dev and is not on the live server. Upload the logo again
                  here on the live site so the public bracket watermark can load it.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-5">
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">Park information (bracket block)</h3>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Optional heading, notes (addresses, parking, gate policy), and up to two points of contact (name +
              phone) appear on the printable bracket below the title—same content in preview, HTML export, and flyer PDF
              snapshot.
            </p>
          </div>
          <label className="block text-xs font-medium text-zinc-500">
            Block heading
            <input
              value={parkHeadingDraft}
              onChange={(e) => setParkHeadingDraft(e.target.value)}
              disabled={!projectId || busy}
              placeholder="e.g. Jambalaya Park"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-zinc-500">
            Details (one line per paragraph)
            <textarea
              value={parkBodyDraft}
              onChange={(e) => setParkBodyDraft(e.target.value)}
              disabled={!projectId || busy}
              rows={4}
              placeholder={"123 Main St…\nParking: lot B"}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs leading-relaxed"
            />
          </label>
          <div className="space-y-3">
            <p className="text-xs font-medium text-zinc-500">Point of contact (optional — two slots)</p>
            {[0, 1].map((slot) => (
              <div
                key={slot}
                className="grid gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-2 sm:grid-cols-2"
              >
                <label className="block text-[11px] text-zinc-500">
                  Name {slot + 1}
                  <input
                    value={parkContactsDraft[slot]?.name ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setParkContactsDraft((prev) => {
                        const next = [...prev];
                        next[slot] = { ...(next[slot] ?? { name: "", phone: "" }), name: v };
                        return next;
                      });
                    }}
                    disabled={!projectId || busy}
                    placeholder="Jane Smith"
                    className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block text-[11px] text-zinc-500">
                  Phone {slot + 1}
                  <input
                    type="tel"
                    value={parkContactsDraft[slot]?.phone ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setParkContactsDraft((prev) => {
                        const next = [...prev];
                        next[slot] = { ...(next[slot] ?? { name: "", phone: "" }), phone: v };
                        return next;
                      });
                    }}
                    disabled={!projectId || busy}
                    placeholder="555-123-4567"
                    className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm tabular-nums"
                  />
                </label>
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={!projectId || busy}
            onClick={() => void saveParkInfo()}
            className="rounded-lg border border-zinc-600 px-3 py-2 text-xs font-semibold text-zinc-100 hover:bg-zinc-800 disabled:opacity-40"
          >
            Save park block
          </button>
        </div>

        <details className="border-t border-zinc-800 pt-5 group">
          <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-300 marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="underline decoration-zinc-600 underline-offset-2 group-open:text-zinc-100">
              Optional: import schedule spreadsheet (advanced)
            </span>
            <span className="ml-2 text-xs font-normal text-zinc-500">- XLSX / XLS / PDF</span>
          </summary>
          <div className="mt-3 space-y-2 border-l-2 border-zinc-700 pl-4">
            <p className="text-xs leading-relaxed text-zinc-500">
              <strong className="text-zinc-400">Excel (.xlsx / .xls):</strong> when the sheet matches the AP tournament
              schedule template, rows import into the flat <strong className="text-zinc-400">games</strong> list (grid /
              flyer PDF), not into the column bracket. <strong className="text-zinc-400">PDF:</strong> stored for notes
              only—pairings are not parsed from PDF.
            </p>
            <label className="block text-xs font-medium text-zinc-500">
              Schedule file
              <input
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/pdf"
                disabled={!projectId || busy}
                className="mt-1 block w-full text-sm"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleIngestFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </details>
        </div>
      </details>

      <div className="space-y-4" style={{ order: focusPreview ? 1 : 0 }}>
        {spec && project ? (
          <>
            {setupComplete ? (
              <div className="flex flex-col gap-4">
                <details
                  className={`rounded-xl border border-zinc-800 bg-zinc-900/70 ${focusPreview ? "order-2" : ""}`}
                  open={project.status === "READY"}
                >
                  <summary className="cursor-pointer p-4 text-xs font-semibold uppercase text-zinc-400 marker:content-none [&::-webkit-details-marker]:hidden">
                    Team name mapping
                  </summary>
                  <div className="border-t border-zinc-800 p-4 sm:p-5">
                    <BracketTeamNameMappingEditor
                      spec={spec}
                      projectId={project.id}
                      busy={busy}
                      onSave={async (patch) => {
                        setBusy(true);
                        setError("");
                        try {
                          await patchSpec(patch);
                          setNotice("Team names updated.");
                          await loadProject(project.id);
                        } catch (e: unknown) {
                          setError(e instanceof Error ? e.message : String(e));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  </div>
                </details>
                <details className={`rounded-xl border border-zinc-800 bg-zinc-900/70 ${focusPreview ? "order-2" : ""}`} {...(!focusPreview ? { open: true } : {})}><summary className="cursor-pointer p-4 text-xs font-semibold uppercase text-zinc-400 marker:content-none [&::-webkit-details-marker]:hidden">Bracket structure</summary><div className="border-t border-zinc-800 p-4 sm:p-5">                <BracketStructureEditor
                  spec={spec}
                  projectId={project.id}
                  projectUpdatedAt={project.updatedAt}
                  organizationId={project.organizationId}
                  seasonYear={project.seasonYear}
                  busy={busy}
                  structureLocked={project.status === "READY"}
                  onSave={async (patch) => {
                    setBusy(true);
                    setError("");
                    try {
                      await patchSpec({ ...patch });
                      setNotice(
                        project.status === "READY"
                          ? "Bracket schedule saved."
                          : "Bracket structure saved.",
                      );
                      await loadProject(project.id);
                    } catch (e: unknown) {
                      setError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                /></div></details><div className={`rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5 ${focusPreview ? "-order-1" : ""}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Bracket preview</h2>
                    <div className="flex flex-col gap-2 sm:items-end">{renderScoreToolbar()}<div className="grid gap-2 sm:flex sm:flex-wrap">
                      <button
                        type="button"
                        disabled={!bracketLayout}
                        onClick={exportBracketHtml}
                        className="min-h-10 rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-800 disabled:opacity-40"
                      >
                        Export bracket HTML
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void exportFlyerPdf()}
                        className="min-h-10 rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-800 disabled:opacity-40"
                      >
                        Export flyer PDF
                      </button>
                    </div>
                    </div>
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-zinc-500">Preview settings</summary>
                  <div className="mt-3 space-y-3 rounded-lg border border-zinc-700 bg-zinc-950/50 p-3">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                        Bracket appearance (LLBWS-style)
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                        Layout follows the printable Little League–style column bracket. Colors default to the
                        selected site ({getOrgDisplayName(organizationId)}): primary for structure ink,
                        accent for highlights. Overrides apply to this preview and HTML export only.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-end sm:gap-4">
                      <label className="block text-xs font-medium text-zinc-500">
                        Primary
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            type="color"
                            value={bracketColorDraftPrimary}
                            onChange={(e) => setBracketColorDraftPrimary(e.target.value)}
                            disabled={busy}
                            className="h-9 w-12 cursor-pointer rounded border border-zinc-600 bg-zinc-950 disabled:opacity-40"
                            aria-label="Bracket primary color"
                          />
                          <input
                            type="text"
                            value={bracketColorDraftPrimary}
                            onChange={(e) => setBracketColorDraftPrimary(e.target.value)}
                            disabled={busy}
                            spellCheck={false}
                            className="w-28 rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 font-mono text-xs"
                            placeholder="#590275"
                          />
                        </div>
                      </label>
                      <label className="block text-xs font-medium text-zinc-500">
                        Accent
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            type="color"
                            value={bracketColorDraftAccent}
                            onChange={(e) => setBracketColorDraftAccent(e.target.value)}
                            disabled={busy}
                            className="h-9 w-12 cursor-pointer rounded border border-zinc-600 bg-zinc-950 disabled:opacity-40"
                            aria-label="Bracket accent color"
                          />
                          <input
                            type="text"
                            value={bracketColorDraftAccent}
                            onChange={(e) => setBracketColorDraftAccent(e.target.value)}
                            disabled={busy}
                            spellCheck={false}
                            className="w-28 rounded border border-zinc-600 bg-zinc-950 px-2 py-1.5 font-mono text-xs"
                            placeholder="#ffcb29"
                          />
                        </div>
                      </label>
                    </div>
                    <div className="grid gap-2 sm:flex sm:flex-wrap">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void applyBracketThemeColors()}
                        className="min-h-10 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 disabled:opacity-40"
                      >
                        Apply colors
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void resetBracketThemeToSiteDefaults()}
                        className="min-h-10 rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                      >
                        Reset to site defaults
                      </button>
                    </div>
                    <div className="mt-3 space-y-3 border-t border-zinc-700 pt-3">
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          GameChanger live scoreboard
                        </h4>
                        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                          Paste the embed code from GameChanger (Tournament → Tools → Create Scoreboard). Published
                          brackets show live scores on cards; tapping a game opens that game&apos;s live scoreboard.
                          Final GameChanger games auto-import into bracket scores while you have this project open;
                          use Import completed GameChanger scores in the score toolbar to apply all finals now.
                        </p>
                      </div>
                      <label className="block text-[11px] text-zinc-500">
                        Widget ID
                        <input
                          value={gcWidgetIdDraft}
                          onChange={(e) => setGcWidgetIdDraft(e.target.value)}
                          disabled={busy}
                          placeholder="58152785-6fd8-4c3a-be34-187a3fdf97ff"
                          className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-sm"
                          spellCheck={false}
                        />
                      </label>
                      <label className="block text-[11px] text-zinc-500">
                        Max games visible in modal (vertical)
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={gcMaxVerticalDraft}
                          onChange={(e) => setGcMaxVerticalDraft(e.target.value)}
                          disabled={busy}
                          className="mt-0.5 w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
                        />
                      </label>
                      <label className="block text-[11px] text-zinc-500">
                        Paste embed snippet
                        <textarea
                          value={gcEmbedSnippetDraft}
                          onChange={(e) => setGcEmbedSnippetDraft(e.target.value)}
                          disabled={busy}
                          rows={4}
                          placeholder={'<script>window.GC.scoreboard.init({ widgetId: "…" })…'}
                          className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-[11px]"
                        />
                      </label>
                      <div className="grid gap-2 sm:flex sm:flex-wrap">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={applyGameChangerEmbedSnippet}
                          className="min-h-10 rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                        >
                          Parse snippet
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void saveGameChangerConfig()}
                          className="min-h-10 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 disabled:opacity-40"
                        >
                          Save GameChanger
                        </button>
                        {gcConfig ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void clearGameChangerConfig()}
                            className="min-h-10 rounded-lg border border-red-900/60 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-950/40 disabled:opacity-40"
                          >
                            Remove GameChanger
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {spec.bracketFormat === "single_elimination" ? (
                      <div className="mt-3 space-y-3 border-t border-zinc-700 pt-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          Podium (single elimination)
                        </h4>
                        <p className="text-[11px] leading-relaxed text-zinc-500">
                          When the bracket has two semifinals and one final, you can show a champion column with the
                          champion plaque and a 3rd place plaque, plus a third-place game anchored under the final
                          (preview, HTML export, and flyer PDF).
                        </p>
                        <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-300">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={Boolean(spec.singleElimIncludeThirdPlace)}
                            disabled={busy}
                            onChange={(e) =>
                              void patchSpec({ singleElimIncludeThirdPlace: e.target.checked }).catch((err: unknown) =>
                                setError(err instanceof Error ? err.message : String(err)),
                              )
                            }
                          />
                          <span>Include 3rd place game (semifinal losers)</span>
                        </label>
                        <label className="block text-xs font-medium text-zinc-500">
                          Champion banner label (shown as{" "}
                          <span className="font-mono text-zinc-400">{"{label} Champion"}</span>). Leave blank to use the
                          division title when set, otherwise “Tournament”.
                          <input
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
                            value={championAgeGroupDraft}
                            disabled={busy}
                            onChange={(e) => setChampionAgeGroupDraft(e.target.value)}
                            spellCheck={false}
                            placeholder={spec.divisionLabel?.trim() || "e.g. 12U"}
                          />
                        </label>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void saveChampionPodiumLabel()}
                          className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-600 disabled:opacity-40"
                        >
                          Save champion label
                        </button>
                        {spec.singleElimIncludeThirdPlace ? (
                          <div className="mt-3 space-y-3 rounded-lg border border-zinc-800/80 bg-zinc-950/35 p-3">
                            <div>
                              <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                3rd place game information
                              </h5>
                              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                                Updates the game number, date, time, park, and field shown on the 3rd place game in
                                the bracket preview and HTML export.
                              </p>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              <label className="block text-[11px] text-zinc-500">
                                Game #
                                <input
                                  value={thirdPlaceInfoDraft.officialGameNumber}
                                  onChange={(e) =>
                                    setThirdPlaceInfoDraft((prev) => ({
                                      ...prev,
                                      officialGameNumber: e.target.value,
                                    }))
                                  }
                                  disabled={busy}
                                  placeholder="37"
                                  className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
                                />
                              </label>
                              <label className="block text-[11px] text-zinc-500">
                                Date label
                                <input
                                  value={thirdPlaceInfoDraft.dateLabel}
                                  onChange={(e) =>
                                    setThirdPlaceInfoDraft((prev) => ({ ...prev, dateLabel: e.target.value }))
                                  }
                                  disabled={busy}
                                  placeholder="Sat 6/7"
                                  className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
                                />
                              </label>
                              <label className="block text-[11px] text-zinc-500">
                                Time
                                <input
                                  value={thirdPlaceInfoDraft.time}
                                  onChange={(e) =>
                                    setThirdPlaceInfoDraft((prev) => ({ ...prev, time: e.target.value }))
                                  }
                                  disabled={busy}
                                  placeholder="6:00 PM"
                                  className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
                                />
                              </label>
                              <label className="block text-[11px] text-zinc-500">
                                Park / venue
                                <input
                                  value={thirdPlaceInfoDraft.venue}
                                  onChange={(e) =>
                                    setThirdPlaceInfoDraft((prev) => ({ ...prev, venue: e.target.value }))
                                  }
                                  disabled={busy}
                                  placeholder="Tee Joe Gonzales Park"
                                  className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
                                />
                              </label>
                              <label className="block text-[11px] text-zinc-500">
                                Field
                                <input
                                  value={thirdPlaceInfoDraft.field}
                                  onChange={(e) =>
                                    setThirdPlaceInfoDraft((prev) => ({ ...prev, field: e.target.value }))
                                  }
                                  disabled={busy}
                                  placeholder="Field 2"
                                  className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm"
                                />
                              </label>
                            </div>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void saveThirdPlaceGameInfo()}
                              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-zinc-800 disabled:opacity-40"
                            >
                              Save 3rd place game info
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  </details>
                  {bracketLayout ? (
                    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-zinc-700/50 bg-zinc-950/35 px-3 py-2 text-xs text-zinc-400 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
                      <label className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <span className="shrink-0 font-medium text-zinc-500">Preview zoom</span>
                        <input
                          type="range"
                          min={60}
                          max={100}
                          step={1}
                          value={Math.round(bracketPreviewZoom * 100)}
                          onChange={(e) => setBracketPreviewZoom(Number(e.target.value) / 100)}
                          className="h-2 min-w-0 flex-1 accent-violet-500"
                          aria-label="Bracket preview zoom"
                        />
                        <span className="w-10 shrink-0 tabular-nums text-zinc-300">
                          {Math.round(bracketPreviewZoom * 100)}%
                        </span>
                      </label>
                      <p className="max-w-md text-[10px] leading-snug text-zinc-600">
                        Shrinks the live preview only. Flyer PDF and HTML export use full size.
                      </p>
                    </div>
                  ) : null}
                  <div className="mt-2 w-full min-w-0 overflow-x-auto overflow-y-visible rounded-lg border border-slate-600/50 bg-slate-300/30 p-2 sm:p-3">{bracketLayout ? (
                      <div
                        ref={bracketPdfCaptureRef}
                        className="block w-full min-w-0 max-w-full align-top"
                      >
                        <div
                          {...{ [BRACKET_PREVIEW_SCALE_ATTR]: "" }}
                          className="w-full min-w-0 max-w-full"
                          style={{ zoom: bracketPreviewZoom }}
                        >
                          <TournamentBracketView
                            layout={bracketLayout}
                            colorScheme="light"
                            themeColors={resolvedBracketTheme}
                            logoWatermarkUrl={bracketWatermarkUrl}
                            parentOrganizationLogo={{
                              src: bracketBranding.parentLogoPath,
                              name: bracketBranding.parentName,
                            }}
                            parkInfo={spec?.parkInfo}
                            scoring={scoringView}
                            surfaceTitleOverride={projectNameDraft.trim() || project.name}
                            liveGameStatuses={adminLiveStatuses}
                            gameChangerEnabled={Boolean(gcConfig)}
                            onMatchClick={
                              gcConfig ? (matchId) => setAdminGcModalMatchId(matchId) : undefined
                            }
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <details className="mt-3"><summary className="cursor-pointer font-semibold text-zinc-500">Publish &amp; legacy</summary><div className="mt-3 space-y-3">{renderTournamentPageControls()}<details><summary className="cursor-pointer text-zinc-400">Legacy SVG</summary><div className="mt-2 overflow-auto rounded-lg border border-slate-600/50 bg-slate-300/30 p-3 [&>svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svgMarkup }} /></details></div></details>
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-500">
                Complete the questionnaire above (or skip it) to edit Bracket structure and see the live preview.
              </p>
            )}

            {focusPreview && setupComplete ? (
              <details className="rounded-xl border border-zinc-800 bg-zinc-900/70">
                <summary className="cursor-pointer list-none p-4 text-xs font-semibold uppercase tracking-wide text-zinc-400 marker:content-none [&::-webkit-details-marker]:hidden">
                  Guided setup
                </summary>
                <div className="border-t border-zinc-800 p-4 sm:p-5">{renderSetupWizard()}</div>
              </details>
            ) : null}

            <details
              className="rounded-xl border border-zinc-800 bg-zinc-900/70"
              {...(!focusPreview ? { open: true } : {})}
            >
              <summary className="cursor-pointer list-none p-4 text-xs font-semibold uppercase tracking-wide text-zinc-400 marker:content-none [&::-webkit-details-marker]:hidden">
                Flyer / sponsors
              </summary>
              <div className="space-y-3 border-t border-zinc-800 p-5">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(spec.flyer?.includeSponsors)}
                    onChange={(e) =>
                      void patchSpec({ flyer: { ...spec.flyer, includeSponsors: e.target.checked } })
                    }
                  />
                  Include sponsor strip on flyer
                </label>
                <select
                  value={spec.flyer?.sponsorLayout ?? "none"}
                  onChange={(e) =>
                    void patchSpec({
                      flyer: {
                        ...spec.flyer,
                        sponsorLayout: e.target.value as BracketSpec["flyer"]["sponsorLayout"],
                      },
                    })
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm"
                >
                  <option value="none">No strip layout</option>
                  <option value="footer">Footer</option>
                  <option value="sidebar">Sidebar</option>
                </select>
              </div>
            </details>

            {spec.ingestionWarnings.length > 0 ? (
              <div className="rounded-2xl border border-amber-900/50 bg-amber-950/20 p-4 text-sm text-amber-100">
                <p className="font-semibold">Ingestion warnings</p>
                <ul className="mt-2 list-disc pl-5">
                  {spec.ingestionWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-lg border border-zinc-700 bg-zinc-950/40 p-4 text-sm text-zinc-400">
            Select or create a bracket project above to open guided setup, structure, and preview.
          </div>
        )}
      </div>

      {gcConfig && adminGcModalMatchId && bracketLayout ? (
        <GameChangerScoreboardModal
          open
          gameChanger={gcConfig}
          matchLabel={bracketMatchLabelForId(bracketLayout, adminGcModalMatchId)}
          bracketMatch={bracketMatchRefForId(bracketLayout, adminGcModalMatchId)}
          gcEvent={adminEventsByMatchId[adminGcModalMatchId]}
          liveStatus={adminLiveStatuses?.[adminGcModalMatchId] ?? null}
          onClose={() => setAdminGcModalMatchId(null)}
        />
      ) : null}
    </section>
  );
}
