"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import BoardContactRequestsPanel from "@/components/admin/surveys/BoardContactRequestsPanel";
import SurveyBuilder, { type SurveyBuilderMode } from "@/components/admin/surveys/SurveyBuilder";
import SurveyResultsPanel from "@/components/admin/surveys/SurveyResultsPanel";
import { isSurveyOrgId, surveyOrgLabel } from "@/lib/surveys/constants";
import { surveyPublicPath } from "@/lib/surveys/publicPath";

type SurveySeason = "SPRING" | "FALL";

type SurveyListItem = {
  id: string;
  title: string;
  slug: string;
  season: SurveySeason;
  seasonYear: number;
  organizationId: string;
  isPublished: boolean;
  lastSubmittedAt: string | null;
  _count: { responses: number };
};

type DeskSection = "surveys" | "build" | "results" | "contacts";

const SECTIONS: { id: DeskSection; label: string }[] = [
  { id: "surveys", label: "Surveys" },
  { id: "build", label: "Build" },
  { id: "results", label: "Results" },
  { id: "contacts", label: "Contacts" },
];

type SurveyDeskProps = {
  organizationId: string;
  isMasterAdmin: boolean;
  defaultSeason: SurveySeason;
  defaultYear: number;
};

async function safeJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

function parseSection(raw: string | null): DeskSection {
  if (raw === "contacts" || raw === "build" || raw === "results" || raw === "surveys") return raw;
  if (raw === "analytics") return "results";
  return "surveys";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "No responses yet";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

export default function SurveyDesk({
  organizationId,
  isMasterAdmin,
  defaultSeason,
  defaultYear,
}: SurveyDeskProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const section = parseSection(searchParams.get("view"));
  const selectedSurveyId = searchParams.get("survey");
  const createParam = searchParams.get("new");
  const duplicateFromId = searchParams.get("from");

  const [surveys, setSurveys] = useState<SurveyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [openContactCount, setOpenContactCount] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [duplicatePickerOpen, setDuplicatePickerOpen] = useState(false);

  const defaultOrg = isSurveyOrgId(organizationId) ? organizationId : "fallball";

  const setQuery = useCallback(
    (patch: { view?: DeskSection; survey?: string | null; new?: string | null; from?: string | null }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (patch.view !== undefined) {
        if (patch.view === "surveys") params.delete("view");
        else params.set("view", patch.view);
      }
      if (patch.survey !== undefined) {
        if (patch.survey) params.set("survey", patch.survey);
        else params.delete("survey");
      }
      if (patch.new !== undefined) {
        if (patch.new) params.set("new", patch.new);
        else params.delete("new");
      }
      if (patch.from !== undefined) {
        if (patch.from) params.set("from", patch.from);
        else params.delete("from");
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const refreshSurveys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/surveys?includeUnpublished=true");
      const data = await safeJson(res);
      const list = Array.isArray(data.surveys) ? (data.surveys as SurveyListItem[]) : [];
      setSurveys(list);
    } catch (err) {
      console.error("Error loading surveys:", err);
      setSurveys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSurveys();
  }, [refreshSurveys]);

  useEffect(() => {
    async function loadContacts() {
      try {
        const res = await fetch("/api/admin/surveys/board-contact-requests?onlyOpen=true");
        const data = await safeJson(res);
        const requests = Array.isArray(data.requests) ? data.requests : [];
        setOpenContactCount(requests.length);
      } catch {
        setOpenContactCount(0);
      }
    }
    loadContacts();
  }, [section]);

  const selectedSurvey = surveys.find((s) => s.id === selectedSurveyId) ?? null;

  const liveCount = surveys.filter((s) => s.isPublished).length;
  const draftCount = surveys.filter((s) => !s.isPublished).length;
  const totalResponses = surveys.reduce((sum, s) => sum + (s._count?.responses ?? 0), 0);

  const builderMode: SurveyBuilderMode | null = useMemo(() => {
    if (section !== "build") return null;
    if (createParam === "blank" || createParam === "template" || createParam === "duplicate") return createParam;
    if (selectedSurveyId) return "edit";
    return null;
  }, [section, createParam, selectedSurveyId]);

  async function handleTogglePublish(survey: SurveyListItem) {
    setActionError(null);
    const next = !survey.isPublished;
    const ok = window.confirm(
      next
        ? `Make "${survey.title}" live? Families will be able to open the public link.`
        : `Unpublish "${survey.title}"? The public link will stop working for families. Admins can still preview.`,
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/surveys/${survey.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: next }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to update survey");
      await refreshSurveys();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update survey");
    }
  }

  async function handleDelete(survey: SurveyListItem) {
    if (!window.confirm(`Delete "${survey.title}"? This cannot be undone.`)) return;
    setActionError(null);
    try {
      let res = await fetch(`/api/admin/surveys/${survey.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      let data = await safeJson(res);
      if (res.status === 409 && typeof data.responseCount === "number") {
        const confirmForce = window.confirm(
          `This survey has ${data.responseCount} submitted response(s). Deleting it permanently destroys those responses too. Continue?`,
        );
        if (!confirmForce) return;
        res = await fetch(`/api/admin/surveys/${survey.id}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: true }),
        });
        data = await safeJson(res);
      }
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Failed to delete survey");
      setQuery({ survey: null, view: "surveys", new: null, from: null });
      await refreshSurveys();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete survey");
    }
  }

  async function copyLink(survey: SurveyListItem) {
    const path = surveyPublicPath(survey.slug, survey.organizationId, survey.isPublished);
    await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    setCopiedId(survey.id);
    window.setTimeout(() => setCopiedId(null), 1500);
  }

  function startCreate(mode: "blank" | "template" | "duplicate") {
    setActionError(null);
    if (mode === "duplicate") {
      if (surveys.length === 0) return;
      setDuplicatePickerOpen(true);
      return;
    }
    setQuery({ view: "build", new: mode, survey: null, from: null });
  }

  function confirmDuplicate(fromId: string) {
    setDuplicatePickerOpen(false);
    setQuery({ view: "build", new: "duplicate", from: fromId, survey: null });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatusCard label="Live" value={liveCount} tone="emerald" />
        <StatusCard label="Drafts" value={draftCount} tone="amber" />
        <StatusCard label="Responses" value={totalResponses} tone="zinc" />
        <StatusCard label="Open board contacts" value={openContactCount} tone={openContactCount ? "amber" : "zinc"} />
      </div>

      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((item) => {
          const disabled = item.id === "results" && !selectedSurveyId && surveys.length === 0;
          const isActive = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (item.id === "build" && !builderMode) {
                  setQuery({ view: "build", new: null, from: null });
                  return;
                }
                if (item.id === "results") {
                  const id = selectedSurveyId ?? surveys[0]?.id ?? null;
                  setQuery({ view: "results", survey: id, new: null, from: null });
                  return;
                }
                if (item.id === "surveys") {
                  setQuery({ view: "surveys", new: null, from: null });
                  return;
                }
                setQuery({ view: item.id, new: null, from: null });
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                isActive
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                  : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {item.label}
              {item.id === "contacts" && openContactCount > 0 ? ` (${openContactCount})` : ""}
            </button>
          );
        })}
      </div>

      {actionError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-medium text-red-300">
          {actionError}
        </div>
      )}

      {section === "contacts" && <BoardContactRequestsPanel isMasterAdmin={isMasterAdmin} />}

      {section === "results" && selectedSurvey && <SurveyResultsPanel survey={selectedSurvey} />}
      {section === "results" && !selectedSurvey && (
        <p className="rounded-xl border border-zinc-800 px-4 py-8 text-center text-sm text-zinc-400">
          Select a survey from the Surveys tab to see results.
        </p>
      )}

      {section === "build" && builderMode && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-6">
          <SurveyBuilder
            mode={builderMode}
            surveyId={builderMode === "edit" ? selectedSurveyId : null}
            duplicateFromId={builderMode === "duplicate" ? duplicateFromId : null}
            isMasterAdmin={isMasterAdmin}
            defaultOrganizationId={defaultOrg}
            defaultSeason={defaultSeason}
            defaultYear={defaultYear}
            onSaved={(id) => {
              refreshSurveys();
              setQuery({ view: "surveys", survey: id, new: null, from: null });
            }}
            onCancel={() => setQuery({ view: "surveys", new: null, from: null })}
          />
        </div>
      )}

      {section === "build" && !builderMode && (
        <CreateChoices
          hasSurveys={surveys.length > 0}
          onChoose={startCreate}
        />
      )}

      {section === "surveys" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => startCreate("template")}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              Parent Survey template
            </button>
            <button
              type="button"
              onClick={() => startCreate("duplicate")}
              disabled={surveys.length === 0}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
            >
              Duplicate existing
            </button>
            <button
              type="button"
              onClick={() => startCreate("blank")}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-zinc-800"
            >
              Start blank
            </button>
          </div>

          {duplicatePickerOpen && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
              <p className="text-sm font-semibold text-zinc-200">Which survey should we copy?</p>
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) confirmDuplicate(e.target.value);
                }}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
              >
                <option value="">Select a survey…</option>
                {surveys.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                    {s.isPublished ? "" : " (Draft)"}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setDuplicatePickerOpen(false)} className="text-xs text-zinc-400 hover:text-white">
                Cancel
              </button>
            </div>
          )}

          {loading ? (
            <div className="rounded-xl border border-zinc-800 px-4 py-8 text-center text-sm text-zinc-400">Loading surveys…</div>
          ) : surveys.length === 0 ? (
            <CreateChoices hasSurveys={false} onChoose={startCreate} />
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {surveys.map((survey) => {
                const path = surveyPublicPath(survey.slug, survey.organizationId, survey.isPublished);
                return (
                  <article
                    key={survey.id}
                    className={`rounded-2xl border bg-zinc-900/50 p-4 sm:p-5 ${
                      selectedSurveyId === survey.id ? "border-emerald-500/40" : "border-zinc-800"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-white">{survey.title}</h3>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              survey.isPublished
                                ? "bg-emerald-500/15 text-emerald-300"
                                : "bg-amber-500/15 text-amber-300"
                            }`}
                          >
                            {survey.isPublished ? "Live" : "Draft"}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400">
                          {survey.season === "FALL" ? "Fall" : "Spring"} {survey.seasonYear} · {surveyOrgLabel(survey.organizationId)} ·{" "}
                          {survey._count.responses} response{survey._count.responses === 1 ? "" : "s"} · {fmtDate(survey.lastSubmittedAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => copyLink(survey)}
                          className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-800"
                        >
                          {copiedId === survey.id ? "Copied" : "Copy link"}
                        </button>
                        <a
                          href={path}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-800"
                        >
                          {survey.isPublished ? "View" : "Preview"}
                        </a>
                        <button
                          type="button"
                          onClick={() => setQuery({ view: "build", survey: survey.id, new: null, from: null })}
                          className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-800"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuery({ view: "results", survey: survey.id, new: null, from: null })}
                          className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-800"
                        >
                          Results
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTogglePublish(survey)}
                          className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-800"
                        >
                          {survey.isPublished ? "Unpublish" : "Make live"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(survey)}
                          className="rounded-lg border border-red-500/30 px-2.5 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-500/10"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusCard({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "zinc" }) {
  const toneClass =
    tone === "emerald" ? "text-emerald-300" : tone === "amber" ? "text-amber-300" : "text-zinc-100";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function CreateChoices({
  hasSurveys,
  onChoose,
}: {
  hasSurveys: boolean;
  onChoose: (mode: "blank" | "template" | "duplicate") => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <CreateCard
        title="Parent Survey template"
        body="Start from the 15-question seasonal parent survey. You can edit every question before it goes live."
        onClick={() => onChoose("template")}
      />
      <CreateCard
        title="Duplicate existing"
        body={hasSurveys ? "Copy last season (or any survey) and change what you need." : "Create a survey first, then you can duplicate it next time."}
        onClick={() => onChoose("duplicate")}
        disabled={!hasSurveys}
      />
      <CreateCard
        title="Start blank"
        body="Title, then add sections and questions one by one. Best for a short custom form."
        onClick={() => onChoose("blank")}
      />
    </div>
  );
}

function CreateCard({
  title,
  body,
  onClick,
  disabled,
}: {
  title: string;
  body: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 text-left hover:border-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <h3 className="text-sm font-bold text-white">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-zinc-400">{body}</p>
    </button>
  );
}
