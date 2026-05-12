"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  buildAllStarAgeOptionsForAgeGroup,
  buildSeasonYearOptions,
  formatOrganizationLabel,
  requiresDyb12uAgeBandFilter,
  safeJson,
  toDateTimeLocalValue,
  type ContentOrgId,
} from "@/lib/allStar/cycleSetupHelpers";
import {
  buildCreateCyclePayload,
  buildInviteEmails,
  buildVisibleSetupSteps,
  createDefaultSetupAnswers,
  getNextSetupStep,
  getPreviousSetupStep,
  getSetupStepIndex,
  getSetupStepLabel,
  resolveSetupWizardCycleTitle,
  resolveVotingWindowFromPreset,
  validateSetupStep,
  type SetupWizardAnswers,
  type SetupWizardStepId,
} from "@/lib/allStar/setupWizard";

type CycleCoachOption = {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
};

type SetupCycle = {
  id: string;
  organizationId: ContentOrgId;
  seasonYear: number;
  ageGroup: string;
  allStarAgeGroupId: string | null;
  allStarAgeGroupLabel: string | null;
  title: string | null;
  hasShowcase: boolean;
  requiredRatingsPerCoach: number;
  accessMode: "INVITE_LIST" | "AGE_GROUP_COACHES";
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
};

type DuplicateConflict = {
  message: string;
  cycle: SetupCycle | null;
  hasVoteSubmissions: boolean;
};

function coachDisplayName(coach: CycleCoachOption) {
  const fromParts =
    coach.firstName || coach.lastName
      ? [coach.firstName, coach.lastName].filter(Boolean).join(" ").trim()
      : "";
  return fromParts || coach.name?.trim() || coach.email;
}

export default function AllStarBallotSetupWizard({
  initialOrg,
  isMasterMode,
  initialCycleId = "",
}: {
  initialOrg: ContentOrgId;
  isMasterMode: boolean;
  initialCycleId?: string;
}) {
  const router = useRouter();
  const currentYear = new Date().getFullYear();
  const [answers, setAnswers] = useState<SetupWizardAnswers>(() =>
    createDefaultSetupAnswers(initialOrg, currentYear),
  );
  const [currentStep, setCurrentStep] = useState<SetupWizardStepId>("context");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ageGroupOptions, setAgeGroupOptions] = useState<string[]>([]);
  const [coachOptions, setCoachOptions] = useState<CycleCoachOption[]>([]);
  const [cycleId, setCycleId] = useState("");
  const [candidateCount, setCandidateCount] = useState(0);
  const [candidateFile, setCandidateFile] = useState<File | null>(null);
  const [ballotLink, setBallotLink] = useState("");
  const [duplicateConflict, setDuplicateConflict] = useState<DuplicateConflict | null>(null);
  const [resumeExistingDraft, setResumeExistingDraft] = useState(false);

  const visibleSteps = useMemo(
    () => buildVisibleSetupSteps(answers),
    [answers.organizationId, answers.ageGroup, answers.allStarAgeGroupId],
  );
  const stepNumber = getSetupStepIndex(currentStep, answers) + 1;
  const allStarAgeOptions = useMemo(
    () => buildAllStarAgeOptionsForAgeGroup(answers.ageGroup),
    [answers.ageGroup],
  );
  const seasonOptions = useMemo(
    () => buildSeasonYearOptions(answers.seasonYear),
    [answers.seasonYear],
  );
  const selectedCoachEmails = useMemo(
    () =>
      coachOptions
        .filter((coach) => answers.selectedCoachIds.includes(coach.id))
        .map((coach) => coach.email.trim().toLowerCase())
        .filter(Boolean),
    [answers.selectedCoachIds, coachOptions],
  );

  useEffect(() => {
    setAnswers((current) => ({ ...current, organizationId: initialOrg }));
  }, [initialOrg]);

  useEffect(() => {
    void loadAgeGroups(answers.organizationId);
  }, [answers.organizationId]);

  useEffect(() => {
    if (!initialCycleId) return;
    void loadDraftCycle(initialCycleId);
  }, [initialCycleId]);

  useEffect(() => {
    if (!cycleId) return;
    void refreshCandidateCount(cycleId);
    void loadCoaches(cycleId);
  }, [cycleId]);

  useEffect(() => {
    if (
      answers.allStarAgeGroupId &&
      !allStarAgeOptions.some((option) => option.id === answers.allStarAgeGroupId)
    ) {
      setAnswers((current) => ({
        ...current,
        allStarAgeGroupId: "",
        allStarAgeGroupLabel: "",
      }));
    }
  }, [allStarAgeOptions, answers.allStarAgeGroupId]);

  useEffect(() => {
    if (currentStep !== "coachAccess" || coachOptions.length === 0) return;
    setAnswers((current) => {
      const optionIds = coachOptions.map((coach) => coach.id);
      const retained = current.selectedCoachIds.filter((id) => optionIds.includes(id));
      if (current.accessMode === "AGE_GROUP_COACHES") {
        if (retained.length > 0) {
          return retained.length === current.selectedCoachIds.length
            ? current
            : { ...current, selectedCoachIds: retained };
        }
        return { ...current, selectedCoachIds: optionIds };
      }
      return retained.length === current.selectedCoachIds.length
        ? current
        : { ...current, selectedCoachIds: retained };
    });
  }, [coachOptions, currentStep, answers.accessMode]);

  async function loadAgeGroups(org: ContentOrgId) {
    try {
      const response = await fetch(`/api/admin/age-groups?org=${org}`, { cache: "no-store" });
      const json = await safeJson(response);
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to load age groups"));
      }
      const options = Array.isArray(json.ageGroups)
        ? (json.ageGroups as unknown[])
            .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            .map((value) => value.trim())
        : [];
      setAgeGroupOptions(options);
      setAnswers((current) => ({
        ...current,
        ageGroup: current.ageGroup && options.includes(current.ageGroup) ? current.ageGroup : options[0] || "",
      }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load age groups");
      setAgeGroupOptions([]);
    }
  }

  async function loadDraftCycle(targetCycleId: string) {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({
        org: initialOrg,
        ensureCycleId: targetCycleId,
      });
      const response = await fetch(`/api/admin/all-star/cycles?${params}`, { cache: "no-store" });
      const json = await safeJson(response);
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to load ballot cycle"));
      }
      const rows = Array.isArray(json.data) ? (json.data as SetupCycle[]) : [];
      const cycle = rows.find((row) => row.id === targetCycleId);
      if (!cycle) {
        throw new Error("Draft ballot cycle was not found.");
      }
      if (cycle.status !== "DRAFT") {
        throw new Error("Only draft ballots can be resumed in setup.");
      }
      setCycleId(cycle.id);
      setAnswers((current) => ({
        ...current,
        organizationId: cycle.organizationId,
        seasonYear: cycle.seasonYear,
        ageGroup: cycle.ageGroup,
        allStarAgeGroupId: cycle.allStarAgeGroupId || "",
        allStarAgeGroupLabel: cycle.allStarAgeGroupLabel || "",
        title: cycle.title || "",
        hasShowcase: cycle.hasShowcase,
        requiredRatingsPerCoach: cycle.requiredRatingsPerCoach,
        accessMode: cycle.accessMode,
      }));
      setCurrentStep("roster");
      setNotice("Resuming draft ballot setup.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load draft ballot");
    } finally {
      setBusy(false);
    }
  }

  async function refreshCandidateCount(targetCycleId: string) {
    const response = await fetch(`/api/admin/all-star/candidates?cycleId=${targetCycleId}`, {
      cache: "no-store",
    });
    const json = await safeJson(response);
    if (!response.ok) {
      throw new Error(String(json.error || "Failed to load candidates"));
    }
    const rows = Array.isArray(json.data) ? json.data : [];
    setCandidateCount(rows.length);
  }

  async function loadCoaches(targetCycleId: string) {
    const response = await fetch(`/api/admin/all-star/coaches?cycleId=${targetCycleId}`, {
      cache: "no-store",
    });
    const json = await safeJson(response);
    if (!response.ok) {
      throw new Error(String(json.error || "Failed to load coaches"));
    }
    const coaches = Array.isArray(json.data) ? (json.data as CycleCoachOption[]) : [];
    setCoachOptions(coaches);
  }

  async function ensureCycleCreated() {
    if (cycleId) return cycleId;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/all-star/cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCreateCyclePayload(answers, { resumeExistingDraft })),
      });
      const json = await safeJson(response);
      if (response.status === 409) {
        const cycle =
          typeof json.cycle === "object" && json.cycle !== null
            ? (json.cycle as SetupCycle)
            : null;
        setDuplicateConflict({
          message: String(json.error || "A matching ballot already exists."),
          cycle,
          hasVoteSubmissions: json.hasVoteSubmissions === true,
        });
        return "";
      }
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to create ballot cycle"));
      }
      const createdId = String((json.cycle as { id?: unknown } | undefined)?.id || "");
      if (!createdId) {
        throw new Error("Failed to create ballot cycle");
      }
      setCycleId(createdId);
      setDuplicateConflict(null);
      setResumeExistingDraft(false);
      const autoImport = json.autoImport as
        | { created?: number; skipped?: number; imported?: boolean }
        | undefined;
      if (autoImport?.imported) {
        setNotice(
          `Imported ${autoImport.created || 0} players from teams (${autoImport.skipped || 0} skipped).`,
        );
      } else {
        setNotice("Ballot cycle saved.");
      }
      await refreshCandidateCount(createdId);
      return createdId;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create ballot cycle");
      return "";
    } finally {
      setBusy(false);
    }
  }

  async function uploadSpreadsheet(targetCycleId: string) {
    if (!candidateFile) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("cycleId", targetCycleId);
      form.append("file", candidateFile);
      const response = await fetch("/api/admin/all-star/candidates/import", {
        method: "POST",
        body: form,
      });
      const json = await safeJson(response);
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to import candidates"));
      }
      setCandidateFile(null);
      setNotice(
        `Spreadsheet import complete: ${Number(json.created || 0)} created, ${Number(json.skipped || 0)} skipped.`,
      );
      await refreshCandidateCount(targetCycleId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to import candidates");
    } finally {
      setBusy(false);
    }
  }

  async function saveInvites(targetCycleId: string) {
    const emails = buildInviteEmails(selectedCoachEmails, answers.extraInviteEmails);
    if (emails.length === 0) return;
    const response = await fetch("/api/admin/all-star/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cycleId: targetCycleId, emails }),
    });
    const json = await safeJson(response);
    if (!response.ok) {
      throw new Error(String(json.error || "Failed to save invite roster"));
    }
    setNotice(String(json.message || "Invite roster saved."));
  }

  async function ensureBallotLink(targetCycleId: string) {
    const response = await fetch(
      `/api/admin/all-star/ballot-link?org=${encodeURIComponent(answers.organizationId)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleId: targetCycleId }),
      },
    );
    const json = await safeJson(response);
    if (!response.ok) {
      throw new Error(String(json.error || "Failed to generate ballot link"));
    }
    const invitesResponse = await fetch(`/api/admin/all-star/invites?cycleId=${targetCycleId}`, {
      cache: "no-store",
    });
    const invitesJson = await safeJson(invitesResponse);
    const link =
      typeof invitesJson.ballotVotingLink === "string" ? invitesJson.ballotVotingLink : "";
    setBallotLink(link);
  }

  async function syncBallotDetailsToCycle(targetCycleId: string) {
    const response = await fetch("/api/admin/all-star/cycles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cycleId: targetCycleId,
        title: resolveSetupWizardCycleTitle(answers) || null,
        hasShowcase: answers.hasShowcase,
        requiredRatingsPerCoach: answers.requiredRatingsPerCoach,
      }),
    });
    const json = await safeJson(response);
    if (!response.ok) {
      throw new Error(String(json.error || "Failed to save ballot details"));
    }
  }

  async function publishCycle(targetCycleId: string) {
    const { publishedAt, closedAt } = resolveVotingWindowFromPreset(
      answers.votingPreset,
      answers.publishedAtLocal,
      answers.closedAtLocal,
    );
    const response = await fetch("/api/admin/all-star/cycles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cycleId: targetCycleId,
        status: "PUBLISHED",
        publishedAt,
        closedAt,
        accessMode: answers.accessMode,
        hasShowcase: answers.hasShowcase,
        requiredRatingsPerCoach: answers.requiredRatingsPerCoach,
        title: resolveSetupWizardCycleTitle(answers) || null,
      }),
    });
    const json = await safeJson(response);
    if (!response.ok) {
      throw new Error(String(json.error || "Failed to publish ballot"));
    }
  }

  async function handleContinue() {
    setError("");
    setNotice("");
    const validationError = validateSetupStep(currentStep, answers, {
      cycleId,
      candidateCount,
      selectedCoachEmails,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    if (currentStep === "ballotDetails" && cycleId) {
      setBusy(true);
      try {
        await syncBallotDetailsToCycle(cycleId);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to save ballot details");
        setBusy(false);
        return;
      }
      setBusy(false);
    }

    if (currentStep === "voterAccess") {
      const createdId = await ensureCycleCreated();
      if (!createdId) return;
    }

    if (currentStep === "roster" && cycleId && candidateFile) {
      await uploadSpreadsheet(cycleId);
    }

    if (currentStep === "coachAccess" && cycleId) {
      setBusy(true);
      try {
        await saveInvites(cycleId);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to save invite roster");
        setBusy(false);
        return;
      }
      setBusy(false);
    }

    if (currentStep === "review" && cycleId) {
      setBusy(true);
      try {
        await ensureBallotLink(cycleId);
        await publishCycle(cycleId);
        const params = new URLSearchParams({
          org: answers.organizationId,
          cycleId,
          tab: "overview",
        });
        router.push(`/admin/all-star/cycle-management?${params.toString()}`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to publish ballot");
      } finally {
        setBusy(false);
      }
      return;
    }

    const next = getNextSetupStep(currentStep, answers);
    if (next) {
      setCurrentStep(next);
    }
  }

  function handleBack() {
    setError("");
    const previous = getPreviousSetupStep(currentStep, answers);
    if (previous) {
      setCurrentStep(previous);
    }
  }

  async function handleResumeDuplicate() {
    if (!duplicateConflict?.cycle || duplicateConflict.hasVoteSubmissions) return;
    if (duplicateConflict.cycle.status !== "DRAFT") return;
    setResumeExistingDraft(true);
    setDuplicateConflict(null);
    setCycleId(duplicateConflict.cycle.id);
    setNotice("Resuming the existing draft ballot.");
    await refreshCandidateCount(duplicateConflict.cycle.id);
    await loadCoaches(duplicateConflict.cycle.id);
    setCurrentStep("roster");
  }

  function updateAnswers(patch: Partial<SetupWizardAnswers>) {
    setAnswers((current) => ({ ...current, ...patch }));
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
          Step {stepNumber} of {visibleSteps.length}
        </p>
        <h2 className="text-2xl font-semibold">{getSetupStepLabel(currentStep)}</h2>
        <p className="text-sm text-zinc-400">
          Answer each question to build a custom All-Star ballot without touching existing active ballots.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </div>
      ) : null}
      {duplicateConflict ? (
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/20 px-4 py-3 text-sm text-amber-100 space-y-3">
          <p>{duplicateConflict.message}</p>
          {duplicateConflict.cycle && !duplicateConflict.hasVoteSubmissions && duplicateConflict.cycle.status === "DRAFT" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleResumeDuplicate()}
              className="rounded-lg border border-amber-700 px-3 py-2 text-sm hover:bg-amber-950/40 disabled:opacity-60"
            >
              Resume existing draft
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        {currentStep === "context" ? (
          <div className="space-y-4">
            {isMasterMode ? (
              <label className="block space-y-2">
                <span className="text-sm text-zinc-300">Which organization is this ballot for?</span>
                <select
                  value={answers.organizationId}
                  onChange={(event) =>
                    updateAnswers({ organizationId: event.target.value as ContentOrgId })
                  }
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                >
                  <option value="gonzales">Gonzales DYB</option>
                  <option value="ascension">Ascension LLB</option>
                </select>
              </label>
            ) : (
              <p className="text-sm text-zinc-300">
                Organization: <span className="font-semibold">{formatOrganizationLabel(answers.organizationId)}</span>
              </p>
            )}
            <label className="block space-y-2">
              <span className="text-sm text-zinc-300">Which season year?</span>
              <select
                value={answers.seasonYear}
                onChange={(event) => updateAnswers({ seasonYear: Number(event.target.value) })}
                className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
              >
                {seasonOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {currentStep === "ageGroup" ? (
          <label className="block space-y-2">
            <span className="text-sm text-zinc-300">Which age group should coaches vote on?</span>
            <select
              value={answers.ageGroup}
              onChange={(event) => updateAnswers({ ageGroup: event.target.value })}
              className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
            >
              {ageGroupOptions.length === 0 ? (
                <option value="">No age groups available</option>
              ) : (
                ageGroupOptions.map((ageGroup) => (
                  <option key={ageGroup} value={ageGroup}>
                    {ageGroup}
                  </option>
                ))
              )}
            </select>
          </label>
        ) : null}

        {currentStep === "poolFilters" ? (
          <div className="space-y-4">
            {allStarAgeOptions.length > 0 ? (
              <label className="block space-y-2">
                <span className="text-sm text-zinc-300">Should this ballot use a specific All-Star age band?</span>
                <select
                  value={answers.allStarAgeGroupId}
                  onChange={(event) => {
                    const selected = allStarAgeOptions.find((option) => option.id === event.target.value);
                    updateAnswers({
                      allStarAgeGroupId: selected?.id || "",
                      allStarAgeGroupLabel: selected?.label || "",
                    });
                  }}
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                >
                  <option value="">All eligible ages in this division</option>
                  {allStarAgeOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {requiresDyb12uAgeBandFilter(answers.organizationId, answers.ageGroup) &&
            !answers.allStarAgeGroupId ? (
              <label className="block space-y-2">
                <span className="text-sm text-zinc-300">For Gonzales 12U DYB, which player pool should import?</span>
                <select
                  value={answers.ageBandFilter}
                  onChange={(event) =>
                    updateAnswers({
                      ageBandFilter: event.target.value as SetupWizardAnswers["ageBandFilter"],
                    })
                  }
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                >
                  <option value="BOTH">11U and 12U players</option>
                  <option value="11U">11U players only</option>
                  <option value="12U">12U players only</option>
                </select>
              </label>
            ) : null}
          </div>
        ) : null}

        {currentStep === "ballotDetails" ? (
          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm text-zinc-300">What should admins call this ballot?</span>
              <input
                value={answers.title}
                onChange={(event) => updateAnswers({ title: event.target.value })}
                placeholder="Optional internal label"
                className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm text-zinc-300">How many candidates must each coach rate?</span>
              <input
                type="number"
                min={1}
                max={50}
                value={answers.requiredRatingsPerCoach}
                onChange={(event) =>
                  updateAnswers({
                    requiredRatingsPerCoach: Number.parseInt(event.target.value, 10) || 0,
                  })
                }
                className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm text-zinc-300">Will coaches score showcase events for this ballot?</span>
              <select
                value={answers.hasShowcase ? "yes" : "no"}
                onChange={(event) => updateAnswers({ hasShowcase: event.target.value === "yes" })}
                className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
              >
                <option value="yes">Yes, include showcase scoring</option>
                <option value="no">No showcase scoring</option>
              </select>
            </label>
          </div>
        ) : null}

        {currentStep === "voterAccess" ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-300">Who should be allowed to submit a ballot?</p>
            <label className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
              <input
                type="radio"
                checked={answers.accessMode === "AGE_GROUP_COACHES"}
                onChange={() =>
                  updateAnswers({
                    accessMode: "AGE_GROUP_COACHES",
                    selectedCoachIds: coachOptions.map((coach) => coach.id),
                  })
                }
              />
              <span className="text-sm">
                <span className="font-semibold text-zinc-100">Age-group coaches</span>
                <span className="block text-zinc-400">
                  Coaches tied to this age group can vote after signing in. Best for standard league ballots.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
              <input
                type="radio"
                checked={answers.accessMode === "INVITE_LIST"}
                onChange={() => updateAnswers({ accessMode: "INVITE_LIST", selectedCoachIds: [] })}
              />
              <span className="text-sm">
                <span className="font-semibold text-zinc-100">Invite list only</span>
                <span className="block text-zinc-400">
                  Only coaches you add to the invite roster can vote, even if they coach in the age group.
                </span>
              </span>
            </label>
          </div>
        ) : null}

        {currentStep === "roster" ? (
          <div className="space-y-4">
            <p className="text-sm text-zinc-300">
              Candidate roster for this ballot: <span className="font-semibold text-zinc-100">{candidateCount}</span>
            </p>
            <div className="space-y-3">
              <label className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                <input
                  type="radio"
                  checked={answers.rosterSource === "teams"}
                  onChange={() => updateAnswers({ rosterSource: "teams" })}
                />
                <span className="text-sm">
                  <span className="font-semibold text-zinc-100">Use team rosters</span>
                  <span className="block text-zinc-400">
                    Import players from teams for this organization, season, and age group.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                <input
                  type="radio"
                  checked={answers.rosterSource === "spreadsheet"}
                  onChange={() => updateAnswers({ rosterSource: "spreadsheet" })}
                />
                <span className="text-sm">
                  <span className="font-semibold text-zinc-100">Upload a spreadsheet</span>
                  <span className="block text-zinc-400">Import candidates from CSV or XLSX on the next continue.</span>
                </span>
              </label>
              {answers.rosterSource === "spreadsheet" ? (
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(event) => setCandidateFile(event.target.files?.[0] || null)}
                  className="block w-full text-sm text-zinc-300"
                />
              ) : null}
              <label className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                <input
                  type="radio"
                  checked={answers.rosterSource === "empty"}
                  onChange={() => updateAnswers({ rosterSource: "empty" })}
                />
                <span className="text-sm">
                  <span className="font-semibold text-zinc-100">Start with an empty roster</span>
                  <span className="block text-zinc-400">
                    Finish setup now and add candidates later in cycle management.
                  </span>
                </span>
              </label>
            </div>
          </div>
        ) : null}

        {currentStep === "coachAccess" ? (
          <div className="space-y-4">
            <p className="text-sm text-zinc-300">
              {answers.accessMode === "INVITE_LIST"
                ? "Choose which coaches in this age group should be on the invite roster before publish."
                : "Review coaches in this age group. Everyone checked is saved to the invite roster before publish; uncheck anyone you want to leave off the roster."}
            </p>
            <div className="max-h-72 overflow-auto rounded-lg border border-zinc-800">
                  {coachOptions.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-zinc-500">No coaches found for this age group yet.</p>
                  ) : (
                    coachOptions.map((coach) => (
                      <label
                        key={coach.id}
                        className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2 last:border-b-0"
                      >
                        <span className="text-sm text-zinc-200">
                          {coachDisplayName(coach)} <span className="text-zinc-500">({coach.email})</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={answers.selectedCoachIds.includes(coach.id)}
                          onChange={(event) =>
                            updateAnswers({
                              selectedCoachIds: event.target.checked
                                ? Array.from(new Set([...answers.selectedCoachIds, coach.id]))
                                : answers.selectedCoachIds.filter((id) => id !== coach.id),
                            })
                          }
                        />
                      </label>
                    ))
                  )}
                </div>
            <label className="block space-y-2">
              <span className="text-sm text-zinc-300">Extra coach emails (optional)</span>
              <textarea
                value={answers.extraInviteEmails}
                onChange={(event) => updateAnswers({ extraInviteEmails: event.target.value })}
                rows={3}
                placeholder="coach1@example.com, coach2@example.com"
                className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
              />
            </label>
          </div>
        ) : null}

        {currentStep === "schedule" ? (
          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm text-zinc-300">How long should voting stay open?</span>
              <select
                value={answers.votingPreset}
                onChange={(event) => {
                  const preset = event.target.value as SetupWizardAnswers["votingPreset"];
                  if (preset === "custom") {
                    updateAnswers({ votingPreset: preset });
                    return;
                  }
                  const window = resolveVotingWindowFromPreset(preset, "", "");
                  updateAnswers({
                    votingPreset: preset,
                    publishedAtLocal: toDateTimeLocalValue(window.publishedAt),
                    closedAtLocal: toDateTimeLocalValue(window.closedAt),
                  });
                }}
                className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
              >
                <option value="1h">Open now for 1 hour</option>
                <option value="4h">Open now for 4 hours</option>
                <option value="24h">Open now for 24 hours</option>
                <option value="custom">Custom open and close times</option>
              </select>
            </label>
            {answers.votingPreset === "custom" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm text-zinc-300">Opens</span>
                  <input
                    type="datetime-local"
                    value={answers.publishedAtLocal}
                    onChange={(event) => updateAnswers({ publishedAtLocal: event.target.value })}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm text-zinc-300">Closes</span>
                  <input
                    type="datetime-local"
                    value={answers.closedAtLocal}
                    onChange={(event) => updateAnswers({ closedAtLocal: event.target.value })}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                  />
                </label>
              </div>
            ) : null}
          </div>
        ) : null}

        {currentStep === "review" ? (
          <div className="space-y-3 text-sm text-zinc-300">
            <p>
              <span className="text-zinc-500">Organization:</span> {formatOrganizationLabel(answers.organizationId)}
            </p>
            <p>
              <span className="text-zinc-500">Season:</span> {answers.seasonYear}
            </p>
            <p>
              <span className="text-zinc-500">Age group:</span> {answers.ageGroup}
            </p>
            <p>
              <span className="text-zinc-500">Candidates:</span> {candidateCount}
            </p>
            <p>
              <span className="text-zinc-500">Voter access:</span>{" "}
              {answers.accessMode === "INVITE_LIST" ? "Invite list only" : "Age-group coaches"}
            </p>
            <p>
              <span className="text-zinc-500">Invite roster:</span>{" "}
              {buildInviteEmails(selectedCoachEmails, answers.extraInviteEmails).length} coaches
            </p>
            <p>
              <span className="text-zinc-500">Ratings per coach:</span> {answers.requiredRatingsPerCoach}
            </p>
            <p>
              <span className="text-zinc-500">Showcase:</span> {answers.hasShowcase ? "Yes" : "No"}
            </p>
            {ballotLink ? (
              <p className="break-all">
                <span className="text-zinc-500">Ballot link:</span> {ballotLink}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          disabled={busy || !getPreviousSetupStep(currentStep, answers)}
          onClick={handleBack}
          className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
        >
          Back
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleContinue()}
          className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {currentStep === "review" ? "Publish ballot" : "Continue"}
        </button>
      </div>
    </div>
  );
}
