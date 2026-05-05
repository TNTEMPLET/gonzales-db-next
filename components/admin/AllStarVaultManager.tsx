"use client";

import { useEffect, useRef, useState } from "react";

type Cycle = {
  id: string;
  organizationId: "gonzales" | "ascension";
  seasonYear: number;
  ageGroup: string;
  title: string | null;
  hasShowcase: boolean;
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
  accessMode: "INVITE_LIST" | "AGE_GROUP_COACHES";
  publishedAt: string | null;
  closedAt: string | null;
  ballotLinkToken?: string | null;
};

type Candidate = {
  id: string;
  playerFullName: string;
  team: string;
  jerseyNumber: string;
  showcaseBibNumber: string | null;
};

type CycleCoachOption = {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  assignedTeam: string | null;
  coachRole: "HEAD_COACH" | "ASSISTANT_COACH" | null;
};

type VaultAccess = {
  id: string;
  organizationId: "gonzales" | "ascension";
  role: "FULL_ACCESS" | "VIEW_ONLY";
  isImplicit?: boolean;
  registeredUser: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    name: string | null;
  };
};

type UserOption = {
  id: string;
  email: string;
  name: string;
};

type SubmittedBallot = {
  id: string;
  coachUserId: string;
  submittedAt: string;
  voteItemCount: number;
  coachUser: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    name: string | null;
  };
};

type VoteSummaryRow = {
  candidateId: string;
  playerFullName: string;
  team: string;
  jerseyNumber: string;
  showcaseBibNumber: string | null;
  voteCount: number;
  averageRating: number;
};

type AllStarVaultManagerProps = {
  initialOrg: "gonzales" | "ascension";
  isMasterMode: boolean;
};

function formatOrganizationLabel(org: "gonzales" | "ascension") {
  return org === "gonzales" ? "Gonzales DYB" : "Ascension LLB";
}

function isCycleOpenAndPublished(cycle: Cycle | null) {
  if (!cycle || cycle.status !== "PUBLISHED") return false;
  const now = Date.now();
  const openAt = cycle.publishedAt ? new Date(cycle.publishedAt).getTime() : null;
  const closeAt = cycle.closedAt ? new Date(cycle.closedAt).getTime() : null;
  if (openAt !== null && !Number.isNaN(openAt) && now < openAt) return false;
  if (closeAt !== null && !Number.isNaN(closeAt) && now >= closeAt) return false;
  return true;
}

export default function AllStarVaultManager({
  initialOrg,
  isMasterMode,
}: AllStarVaultManagerProps) {
  const latestCycleIdRef = useRef("");
  const [org, setOrg] = useState<"gonzales" | "ascension">(initialOrg);
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [headCoaches, setHeadCoaches] = useState<Array<{ id: string; coachName: string | null; coachEmail: string | null }>>([]);
  const [cycleCoachOptions, setCycleCoachOptions] = useState<CycleCoachOption[]>([]);
  const [vaultAccess, setVaultAccess] = useState<VaultAccess[]>([]);
  const [submittedBallots, setSubmittedBallots] = useState<SubmittedBallot[]>([]);
  const [voteSummary, setVoteSummary] = useState<VoteSummaryRow[]>([]);
  const [voteSummarySubmissionCount, setVoteSummarySubmissionCount] = useState(0);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [inviteLinks, setInviteLinks] = useState<
    Array<{
      inviteId: string;
      invitedEmail: string;
      invitedCoachName: string | null;
      link: string | null;
      createdAt: string;
      openedAt: string | null;
      revokedAt: string | null;
      expiresAt: string | null;
    }>
  >([]);
  const [ballotVotingLink, setBallotVotingLink] = useState<string | null>(null);
  const [inviteActionId, setInviteActionId] = useState<string | null>(null);
  const [vaultAccessRoleBusyId, setVaultAccessRoleBusyId] = useState<string | null>(
    null,
  );
  const [canDeleteCycles, setCanDeleteCycles] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [newCycleAgeGroup, setNewCycleAgeGroup] = useState("12U LLB");
  const [ageGroupOptions, setAgeGroupOptions] = useState<string[]>([]);
  const [newCycleAccessMode, setNewCycleAccessMode] = useState<"INVITE_LIST" | "AGE_GROUP_COACHES">("AGE_GROUP_COACHES");
  const [newCycleHasShowcase, setNewCycleHasShowcase] = useState(true);
  const [cycleOpenAt, setCycleOpenAt] = useState("");
  const [cycleCloseAt, setCycleCloseAt] = useState("");

  const [candidateFile, setCandidateFile] = useState<File | null>(null);
  const [showAddCandidateModal, setShowAddCandidateModal] = useState(false);
  const [candidateName, setCandidateName] = useState("");
  const [candidateTeam, setCandidateTeam] = useState("");
  const [candidateJerseyNumber, setCandidateJerseyNumber] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [selectedCoachUserId, setSelectedCoachUserId] = useState("");
  const [selectedInviteCoachIds, setSelectedInviteCoachIds] = useState<string[]>([]);
  const [inviteCoachSearch, setInviteCoachSearch] = useState("");
  const [vaultUserId, setVaultUserId] = useState("");
  const [vaultRole, setVaultRole] = useState<"FULL_ACCESS" | "VIEW_ONLY">("VIEW_ONLY");
  const [inviteEmails, setInviteEmails] = useState("");

  useEffect(() => {
    setOrg(initialOrg);
    setSelectedCycleId("");
    setError("");
    setNotice("");
  }, [initialOrg]);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    void loadCycles();
    void loadAgeGroups();
    void loadVaultAccess();
    void loadUserOptions();
  }, [org, seasonYear]);

  useEffect(() => {
    latestCycleIdRef.current = selectedCycleId;
    if (selectedCycleId) {
      setCandidates([]);
      setHeadCoaches([]);
      setCycleCoachOptions([]);
      setSubmittedBallots([]);
      setVoteSummary([]);
      setVoteSummarySubmissionCount(0);
      setSelectedCoachUserId("");
      void (async () => {
        try {
          await Promise.all([
            loadCycleDetails(selectedCycleId),
            loadCycleCoaches(selectedCycleId),
            loadSubmittedBallots(selectedCycleId),
            loadInvites(selectedCycleId),
            ...(isCycleOpenAndPublished(
              cycles.find((entry) => entry.id === selectedCycleId) || null,
            )
              ? [loadVoteSummary(selectedCycleId)]
              : []),
          ]);
        } catch (err: unknown) {
          if (latestCycleIdRef.current !== selectedCycleId) return;
          setError(err instanceof Error ? err.message : "Failed to load cycle data");
        }
      })();
    } else {
      setCandidates([]);
      setHeadCoaches([]);
      setCycleCoachOptions([]);
      setSubmittedBallots([]);
      setVoteSummary([]);
      setVoteSummarySubmissionCount(0);
      setSelectedCoachUserId("");
      setSelectedInviteCoachIds([]);
      setInviteLinks([]);
      setBallotVotingLink(null);
      setCycleOpenAt("");
      setCycleCloseAt("");
    }
  }, [selectedCycleId, cycles]);

  useEffect(() => {
    if (!selectedCycleId) return;
    const cycle = cycles.find((entry) => entry.id === selectedCycleId);
    setCycleOpenAt(toDateTimeLocalValue(cycle?.publishedAt || null));
    setCycleCloseAt(toDateTimeLocalValue(cycle?.closedAt || null));
    if (cycle) {
      setNewCycleHasShowcase(Boolean(cycle.hasShowcase));
    }
  }, [cycles, selectedCycleId]);

  useEffect(() => {
    const cycle = cycles.find((entry) => entry.id === selectedCycleId) || null;
    if (!selectedCycleId || !isCycleOpenAndPublished(cycle)) return;
    const timer = window.setInterval(() => {
      void loadVoteSummary(selectedCycleId);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [selectedCycleId, cycles]);
  /* eslint-enable react-hooks/exhaustive-deps */

  async function safeJson(response: Response) {
    const text = await response.text();
    if (!text.trim()) return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(
        `Request failed (${response.status}): response was not valid JSON.`,
      );
    }
  }

  async function loadCycles() {
    try {
      const response = await fetch(`/api/admin/all-star/cycles?org=${org}&seasonYear=${seasonYear}`, { cache: "no-store" });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to load cycles"));
      const data = Array.isArray(json.data) ? (json.data as Cycle[]) : [];
      setCycles(data);
      const canDelete =
        typeof json.permissions === "object" &&
        json.permissions !== null &&
        (json.permissions as { canDeleteCycles?: unknown }).canDeleteCycles ===
          true;
      setCanDeleteCycles(canDelete);
      if (!selectedCycleId && data[0]?.id) {
        setSelectedCycleId(data[0].id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load cycles");
    }
  }

  async function loadAgeGroups() {
    try {
      const response = await fetch(`/api/admin/age-groups?org=${org}`, {
        cache: "no-store",
      });
      const json = await safeJson(response);
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to load age groups"));
      }
      const options = Array.isArray(json.ageGroups)
        ? (json.ageGroups as unknown[])
            .filter(
              (value): value is string =>
                typeof value === "string" && value.trim().length > 0,
            )
            .map((value) => value.trim())
        : [];
      setAgeGroupOptions(options);
      if (!newCycleAgeGroup || !options.includes(newCycleAgeGroup)) {
        setNewCycleAgeGroup(options[0] || "");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load age groups");
      setAgeGroupOptions([]);
    }
  }

  async function loadVaultAccess() {
    try {
      const response = await fetch(`/api/admin/all-star/vault-access?org=${org}`, {
        cache: "no-store",
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to load vault access"));
      setVaultAccess(Array.isArray(json.data) ? (json.data as VaultAccess[]) : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load vault access");
      setVaultAccess([]);
    }
  }

  async function loadUserOptions() {
    const response = await fetch(`/api/admin/all-star/user-options?org=${org}`, {
      cache: "no-store",
    });
    const json = await safeJson(response);
    if (!response.ok) {
      throw new Error(String(json.error || "Failed to load user options"));
    }
    const combined = Array.isArray(json.data) ? json.data : [];
    const unique = new Map<string, UserOption>();
    for (const user of combined) {
      if (unique.has(user.id)) continue;
      const name =
        (user.firstName || user.lastName
          ? [user.firstName, user.lastName].filter(Boolean).join(" ")
          : user.name) || user.email;
      unique.set(user.id, { id: user.id, email: user.email, name });
    }
    setUserOptions(Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function loadCycleDetails(cycleId: string) {
    const [candidatesRes, coachesRes] = await Promise.all([
      fetch(`/api/admin/all-star/candidates?cycleId=${cycleId}`, { cache: "no-store" }),
      fetch(`/api/admin/all-star/head-coaches?cycleId=${cycleId}`, { cache: "no-store" }),
    ]);
    const candidatesJson = await safeJson(candidatesRes);
    const coachesJson = await safeJson(coachesRes);
    if (!candidatesRes.ok || !coachesRes.ok) throw new Error("Failed to load cycle details");
    if (latestCycleIdRef.current !== cycleId) return;
    setCandidates(Array.isArray(candidatesJson.data) ? (candidatesJson.data as Candidate[]) : []);
    setHeadCoaches(
      Array.isArray(coachesJson.data)
        ? (coachesJson.data as Array<{ id: string; coachName: string | null; coachEmail: string | null }>)
        : [],
    );
  }

  async function loadCycleCoaches(cycleId: string) {
    const response = await fetch(
      `/api/admin/all-star/coaches?cycleId=${cycleId}`,
      { cache: "no-store" },
    );
    const json = await safeJson(response);
    if (!response.ok) {
      throw new Error(String(json.error || "Failed to load coaches"));
    }
    const coaches = Array.isArray(json.data)
      ? (json.data as CycleCoachOption[])
      : [];
    if (latestCycleIdRef.current !== cycleId) return;
    setCycleCoachOptions(coaches);
    setSelectedCoachUserId((current) =>
      current && coaches.some((coach) => coach.id === current)
        ? current
        : coaches[0]?.id || "",
    );
  }

  async function loadSubmittedBallots(cycleId: string) {
    const response = await fetch(
      `/api/admin/all-star/submitted-ballots?cycleId=${cycleId}`,
      { cache: "no-store" },
    );
    const json = await safeJson(response);
    if (!response.ok) {
      throw new Error(String(json.error || "Failed to load submitted ballots"));
    }
    if (latestCycleIdRef.current !== cycleId) return;
    setSubmittedBallots(
      Array.isArray(json.data) ? (json.data as SubmittedBallot[]) : [],
    );
  }

  async function loadInvites(cycleId: string) {
    const response = await fetch(
      `/api/admin/all-star/invites?cycleId=${cycleId}`,
      { cache: "no-store" },
    );
    const json = await safeJson(response);
    if (!response.ok) {
      throw new Error(String(json.error || "Failed to load invites"));
    }
    if (latestCycleIdRef.current !== cycleId) return;
    const ballotLink =
      typeof (json as { ballotVotingLink?: unknown }).ballotVotingLink === "string"
        ? (json as { ballotVotingLink: string }).ballotVotingLink
        : null;
    setBallotVotingLink(ballotLink);
    const data = Array.isArray(json.data)
      ? (json.data as Array<{
          id: string;
          invitedEmail: string;
          invitedCoachName: string | null;
          link: string | null;
          createdAt: string;
          openedAt: string | null;
          revokedAt: string | null;
          expiresAt: string | null;
        }>)
      : [];
    setInviteLinks(
      data.map((row) => ({
        inviteId: row.id,
        invitedEmail: row.invitedEmail,
        invitedCoachName: row.invitedCoachName,
        link: row.link,
        createdAt: row.createdAt,
        openedAt: row.openedAt,
        revokedAt: row.revokedAt,
        expiresAt: row.expiresAt,
      })),
    );
  }

  async function copyInviteLink(link: string | null) {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setError("");
      setNotice("Link copied to clipboard.");
    } catch {
      setNotice("");
      setError("Could not copy to clipboard.");
    }
  }

  async function revokeInviteRow(inviteId: string) {
    if (!selectedCycleId) return;
    setInviteActionId(inviteId);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/all-star/invites?org=${encodeURIComponent(org)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inviteId }),
        },
      );
      const json = await safeJson(response);
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to revoke invite"));
      }
      setNotice("Invite revoked.");
      await loadInvites(selectedCycleId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to revoke invite");
    } finally {
      setInviteActionId(null);
    }
  }

  async function reenableInviteRow(inviteId: string) {
    if (!selectedCycleId) return;
    setInviteActionId(inviteId);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/all-star/invites?org=${encodeURIComponent(org)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inviteId, action: "re_enable" }),
        },
      );
      const json = await safeJson(response);
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to re-enable invite"));
      }
      setNotice("Invite re-enabled.");
      await loadInvites(selectedCycleId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to re-enable invite");
    } finally {
      setInviteActionId(null);
    }
  }

  async function generateSharedBallotLink() {
    if (!selectedCycleId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/admin/all-star/ballot-link?org=${encodeURIComponent(org)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cycleId: selectedCycleId }),
        },
      );
      const json = await safeJson(response);
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to generate ballot link"));
      }
      setNotice(
        "Shared ballot link is ready. Send this single URL to coaches; each coach signs in with an email on your roster.",
      );
      await loadInvites(selectedCycleId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate ballot link");
    } finally {
      setBusy(false);
    }
  }

  async function loadVoteSummary(cycleId: string) {
    const response = await fetch(
      `/api/admin/all-star/votes-summary?cycleId=${cycleId}`,
      { cache: "no-store" },
    );
    const json = await safeJson(response);
    if (!response.ok) {
      throw new Error(String(json.error || "Failed to load vote summary"));
    }
    if (latestCycleIdRef.current !== cycleId) return;
    setVoteSummary(Array.isArray(json.data) ? (json.data as VoteSummaryRow[]) : []);
    const count =
      typeof json.meta === "object" &&
      json.meta !== null &&
      typeof (json.meta as { submissionCount?: unknown }).submissionCount ===
        "number"
        ? (json.meta as { submissionCount: number }).submissionCount
        : 0;
    setVoteSummarySubmissionCount(count);
  }

  async function createCycle() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/all-star/cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: org,
          seasonYear,
          ageGroup: newCycleAgeGroup,
          accessMode: newCycleAccessMode,
          hasShowcase: newCycleHasShowcase,
        }),
      });
      const json = await safeJson(response);
      if (!response.ok) {
        throw new Error(
          String((json as { error?: unknown }).error || "Failed to create cycle"),
        );
      }
      const autoImport = json.autoImport as
        | { created?: number; skipped?: number; processed?: number; imported?: boolean }
        | undefined;
      const cycleId = String(
        ((json as { cycle?: { id?: unknown } }).cycle?.id as string | undefined) || "",
      );
      if (!cycleId) {
        throw new Error("Failed to create cycle");
      }
      if (autoImport?.imported) {
        setNotice(
          `Ballot cycle saved. Imported ${autoImport.created || 0} players from teams (${autoImport.skipped || 0} skipped).`,
        );
      } else {
        setNotice("Ballot cycle saved.");
      }
      await loadCycles();
      setSelectedCycleId(cycleId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create cycle");
    } finally {
      setBusy(false);
    }
  }

  async function updateCycleStatus(status: Cycle["status"]) {
    if (!selectedCycleId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/all-star/cycles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleId: selectedCycleId, status }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to update cycle");
      setNotice(`Cycle moved to ${status}.`);
      await loadCycles();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update cycle");
    } finally {
      setBusy(false);
    }
  }

  async function saveCycleOpenWindow() {
    if (!selectedCycleId) return;
    const publishedAt = cycleOpenAt ? new Date(cycleOpenAt).toISOString() : null;
    const closedAt = cycleCloseAt ? new Date(cycleCloseAt).toISOString() : null;
    if (!publishedAt || !closedAt) {
      setError("Open and close date/time are required.");
      return;
    }
    if (new Date(closedAt) <= new Date(publishedAt)) {
      setError("Close date/time must be later than open date/time.");
      return;
    }

    await saveCycleOpenWindowByIso(publishedAt, closedAt, "Cycle open window saved.");
  }

  async function setOpenNowForHours(hours: number) {
    if (!selectedCycleId) return;
    const now = new Date();
    const close = new Date(now.getTime() + hours * 60 * 60 * 1000);
    const publishedAtIso = now.toISOString();
    const closedAtIso = close.toISOString();

    setCycleOpenAt(toDateTimeLocalValue(publishedAtIso));
    setCycleCloseAt(toDateTimeLocalValue(closedAtIso));
    await saveCycleOpenWindowByIso(
      publishedAtIso,
      closedAtIso,
      `Cycle opened for ${hours} hour${hours === 1 ? "" : "s"}.`,
    );
  }

  async function saveCycleOpenWindowByIso(
    publishedAt: string,
    closedAt: string,
    successNotice: string,
  ) {
    if (!selectedCycleId) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/all-star/cycles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycleId: selectedCycleId,
          status: "PUBLISHED",
          publishedAt,
          closedAt,
        }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to save cycle window"));
      setNotice(successNotice);
      await loadCycles();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save cycle window");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCycle() {
    if (!selectedCycleId || !canDeleteCycles) return;
    if (!window.confirm("Delete this cycle and all related votes/candidates?")) {
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/all-star/cycles", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleId: selectedCycleId }),
      });
      const json = await safeJson(response);
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to delete cycle"));
      }
      setNotice("Cycle deleted.");
      setSelectedCycleId("");
      setCandidates([]);
      setHeadCoaches([]);
      await loadCycles();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete cycle");
    } finally {
      setBusy(false);
    }
  }

  async function importCandidates() {
    if (!selectedCycleId || !candidateFile) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.append("cycleId", selectedCycleId);
      form.append("file", candidateFile);
      const response = await fetch("/api/admin/all-star/candidates/import", { method: "POST", body: form });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to import candidates");
      setNotice(`Candidates imported: ${json.created} created, ${json.skipped} skipped.`);
      setCandidateFile(null);
      await loadCycleDetails(selectedCycleId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to import candidates");
    } finally {
      setBusy(false);
    }
  }

  async function reimportCandidatesFromTeams() {
    if (!selectedCycleId) return;
    if (
      !window.confirm(
        "Re-import all players from Teams for this cycle's organization and age group?",
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.append("cycleId", selectedCycleId);
      form.append("source", "teams");
      const response = await fetch("/api/admin/all-star/candidates/import", {
        method: "POST",
        body: form,
      });
      const json = await safeJson(response);
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to import candidates from teams"));
      }
      const created = Number((json as { created?: unknown }).created || 0);
      const skipped = Number((json as { skipped?: unknown }).skipped || 0);
      setNotice(`Teams re-import complete: ${created} created, ${skipped} skipped.`);
      await loadCycleDetails(selectedCycleId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to import candidates from teams");
    } finally {
      setBusy(false);
    }
  }

  async function addCandidate() {
    if (!selectedCycleId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/all-star/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycleId: selectedCycleId,
          playerFullName: candidateName,
          team: candidateTeam,
          jerseyNumber: candidateJerseyNumber,
        }),
      });
      const json = await safeJson(response);
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to add candidate"));
      }
      setNotice("Candidate added.");
      setCandidateName("");
      setCandidateTeam("");
      setCandidateJerseyNumber("");
      setShowAddCandidateModal(false);
      await loadCycleDetails(selectedCycleId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add candidate");
    } finally {
      setBusy(false);
    }
  }

  async function removeCandidate(candidateId: string) {
    if (!selectedCycleId) return;
    if (!window.confirm("Remove this candidate? Bib numbers will be re-numbered.")) {
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/all-star/candidates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId }),
      });
      const json = await safeJson(response);
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to remove candidate"));
      }
      setNotice("Candidate removed.");
      await loadCycleDetails(selectedCycleId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove candidate");
    } finally {
      setBusy(false);
    }
  }

  async function addHeadCoach() {
    if (!selectedCycleId || !selectedCoachUserId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/all-star/head-coaches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycleId: selectedCycleId,
          registeredUserId: selectedCoachUserId,
        }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to add coach"));
      setNotice("Coach assignment saved.");
      await loadCycleDetails(selectedCycleId);
      await loadCycleCoaches(selectedCycleId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add coach");
    } finally {
      setBusy(false);
    }
  }

  async function removeHeadCoach(assignmentId: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/all-star/head-coaches", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to remove head coach");
      setNotice("Head coach assignment removed.");
      if (selectedCycleId) await loadCycleDetails(selectedCycleId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove head coach");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSubmittedBallot(submissionId: string) {
    if (!selectedCycleId) return;
    if (
      !window.confirm(
        "Delete this submitted ballot? The coach will be able to submit again.",
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/all-star/submitted-ballots", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId }),
      });
      const json = await safeJson(response);
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to delete submitted ballot"));
      }
      setNotice("Submitted ballot deleted.");
      await loadSubmittedBallots(selectedCycleId);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to delete submitted ballot",
      );
    } finally {
      setBusy(false);
    }
  }

  async function refreshSubmittedBallots() {
    if (!selectedCycleId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await loadSubmittedBallots(selectedCycleId);
      setNotice("Submitted ballots refreshed.");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to refresh submitted ballots",
      );
    } finally {
      setBusy(false);
    }
  }

  async function refreshVoteSummary() {
    if (!selectedCycleId) return;
    const cycle = cycles.find((entry) => entry.id === selectedCycleId) || null;
    if (!isCycleOpenAndPublished(cycle)) {
      setError(
        "Votes summary refresh is only available while the selected cycle is open and published.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await loadVoteSummary(selectedCycleId);
      setNotice("Votes summary refreshed.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to refresh votes summary");
    } finally {
      setBusy(false);
    }
  }

  function toDateTimeLocalValue(value: string | null) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hour}:${minute}`;
  }

  async function grantVaultAccess() {
    if (!vaultUserId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/all-star/vault-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registeredUserId: vaultUserId,
          organizationId: org,
          role: vaultRole,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to grant vault access");
      setNotice("Vault access updated.");
      setVaultUserId("");
      await loadVaultAccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to grant vault access");
    } finally {
      setBusy(false);
    }
  }

  async function removeVaultAccess(registeredUserId: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/all-star/vault-access", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registeredUserId, organizationId: org }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to remove vault access");
      setNotice("Vault access removed.");
      await loadVaultAccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove vault access");
    } finally {
      setBusy(false);
    }
  }

  async function saveVaultAccessRole(
    registeredUserId: string,
    role: "FULL_ACCESS" | "VIEW_ONLY",
  ) {
    setVaultAccessRoleBusyId(registeredUserId);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/all-star/vault-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registeredUserId,
          organizationId: org,
          role,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to update vault access");
      setNotice("Vault access updated.");
      await loadVaultAccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update vault access");
    } finally {
      setVaultAccessRoleBusyId(null);
    }
  }

  async function createInvites() {
    if (!selectedCycleId) return;
    const selectedCoachEmails = cycleCoachOptions
      .filter((coach) => selectedInviteCoachIds.includes(coach.id))
      .map((coach) => coach.email.trim().toLowerCase())
      .filter(Boolean);
    const manualEmails = inviteEmails
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((email) => email.toLowerCase());
    let emails = Array.from(new Set([...selectedCoachEmails, ...manualEmails]));
    if (!emails.length && !isInviteListCycle) {
      emails = Array.from(
        new Set(
          cycleCoachOptions
            .map((coach) => coach.email.trim().toLowerCase())
            .filter(Boolean),
        ),
      );
    }
    if (!emails.length) {
      setError(
        isInviteListCycle
          ? "Select at least one coach or enter at least one email."
          : "No coach emails found for this cycle.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/all-star/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleId: selectedCycleId, emails }),
      });
      const json = (await response.json()) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) throw new Error(json.error || "Failed to save invite roster");
      setNotice(
        json.message ||
          "Invite roster updated. Use “Generate / refresh shared ballot link” if you need the voting URL.",
      );
      await loadInvites(selectedCycleId);
      setInviteEmails("");
      setSelectedInviteCoachIds([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create invites");
    } finally {
      setBusy(false);
    }
  }

  const filteredCandidates = candidates.filter((candidate) => {
    const query = candidateSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      candidate.playerFullName.toLowerCase().includes(query) ||
      candidate.team.toLowerCase().includes(query) ||
      candidate.jerseyNumber.toLowerCase().includes(query) ||
      String(candidate.showcaseBibNumber || "")
        .toLowerCase()
        .includes(query)
    );
  });
  const seasonOptions = Array.from(
    new Set([
      seasonYear - 1,
      seasonYear,
      seasonYear + 1,
      seasonYear + 2,
      ...cycles.map((cycle) => cycle.seasonYear),
    ]),
  ).sort((a, b) => b - a);
  const selectedCycle = cycles.find((entry) => entry.id === selectedCycleId) || null;
  const canRefreshVoteSummary = isCycleOpenAndPublished(selectedCycle);
  const isInviteListCycle = selectedCycle?.accessMode === "INVITE_LIST";
  const filteredInviteCoachOptions = cycleCoachOptions.filter((coach) => {
    const query = inviteCoachSearch.trim().toLowerCase();
    if (!query) return true;
    const label =
      (coach.firstName || coach.lastName
        ? [coach.firstName, coach.lastName].filter(Boolean).join(" ")
        : coach.name) || coach.email;
    const roleLabel =
      coach.coachRole === "HEAD_COACH"
        ? "head coach"
        : coach.coachRole === "ASSISTANT_COACH"
          ? "assistant coach"
          : "";
    return (
      label.toLowerCase().includes(query) ||
      coach.email.toLowerCase().includes(query) ||
      roleLabel.includes(query)
    );
  });

  return (
    <section className="space-y-6">
      {error ? <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">{error}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-300">{notice}</div> : null}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <h2 className="text-lg font-semibold">Cycle Management</h2>
        <div className="flex flex-wrap items-center justify-start gap-3">
          {isMasterMode ? (
            <select value={org} onChange={(e) => setOrg(e.target.value as "gonzales" | "ascension")} className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm min-w-[170px]">
              <option value="gonzales">Gonzales DYB</option>
              <option value="ascension">Ascension LLB</option>
            </select>
          ) : (
            <div className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 min-w-[170px]">
              {formatOrganizationLabel(org)}
            </div>
          )}
          <select
            value={seasonYear}
            onChange={(e) => setSeasonYear(Number(e.target.value))}
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm min-w-[120px]"
          >
            {seasonOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          <select
            value={newCycleAgeGroup}
            onChange={(e) => setNewCycleAgeGroup(e.target.value)}
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm min-w-[160px] max-w-[220px]"
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
          <select value={newCycleAccessMode} onChange={(e) => setNewCycleAccessMode(e.target.value as "INVITE_LIST" | "AGE_GROUP_COACHES")} className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm min-w-[210px]">
            <option value="AGE_GROUP_COACHES">Age-group coaches only</option>
            <option value="INVITE_LIST">Invite-list only</option>
          </select>
          <select
            value={newCycleHasShowcase ? "yes" : "no"}
            onChange={(e) => setNewCycleHasShowcase(e.target.value === "yes")}
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm min-w-[150px]"
          >
            <option value="yes">Showcase: Yes</option>
            <option value="no">Showcase: No</option>
          </select>
          <button type="button" disabled={busy || !newCycleAgeGroup} onClick={() => void createCycle()} className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60">Save Cycle</button>
        </div>
        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Selected Cycle
          </p>
          <div className="flex flex-wrap gap-3">
          <select value={selectedCycleId} onChange={(e) => setSelectedCycleId(e.target.value)} className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm min-w-60">
            <option value="">Select cycle…</option>
            {cycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {formatOrganizationLabel(cycle.organizationId)} | {cycle.seasonYear} | {cycle.ageGroup} | {cycle.status}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy || !selectedCycleId} onClick={() => void updateCycleStatus("PUBLISHED")} className="rounded-lg border border-emerald-700 text-emerald-300 px-3 py-2 text-sm disabled:opacity-60">Publish</button>
          <button type="button" disabled={busy || !selectedCycleId} onClick={() => void updateCycleStatus("CLOSED")} className="rounded-lg border border-amber-700 text-amber-300 px-3 py-2 text-sm disabled:opacity-60">Close</button>
          <button type="button" disabled={busy || !selectedCycleId || !canDeleteCycles} onClick={() => void deleteCycle()} className="rounded-lg border border-red-700 text-red-300 px-3 py-2 text-sm disabled:opacity-60">Delete Cycle</button>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <input
            type="datetime-local"
            value={cycleOpenAt}
            onChange={(e) => setCycleOpenAt(e.target.value)}
            className="rounded-lg bg-zinc-900 border-2 border-zinc-600 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500 scheme-dark"
          />
          <input
            type="datetime-local"
            value={cycleCloseAt}
            onChange={(e) => setCycleCloseAt(e.target.value)}
            className="rounded-lg bg-zinc-900 border-2 border-zinc-600 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-500 scheme-dark"
          />
          <button
            type="button"
            disabled={busy || !selectedCycleId || !cycleOpenAt || !cycleCloseAt}
            onClick={() => void saveCycleOpenWindow()}
            className="rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-2 text-sm disabled:opacity-60"
          >
            Set Open Time Period
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !selectedCycleId}
            onClick={() => void setOpenNowForHours(1)}
            className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 disabled:opacity-60"
          >
            Open Now (1h)
          </button>
          <button
            type="button"
            disabled={busy || !selectedCycleId}
            onClick={() => void setOpenNowForHours(4)}
            className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 disabled:opacity-60"
          >
            Open Now (4h)
          </button>
          <button
            type="button"
            disabled={busy || !selectedCycleId}
            onClick={() => void setOpenNowForHours(24)}
            className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 disabled:opacity-60"
          >
            Open Now (24h)
          </button>
        </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <h2 className="text-lg font-semibold">Candidates Import</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <a href="/api/admin/all-star/candidates/template" className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5">Download Template</a>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setCandidateFile(e.target.files?.[0] || null)} className="text-sm" />
          <button type="button" disabled={busy || !selectedCycleId || !candidateFile} onClick={() => void importCandidates()} className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60">Import Candidates</button>
          <button
            type="button"
            disabled={busy || !selectedCycleId}
            onClick={() => void reimportCandidatesFromTeams()}
            className="rounded-lg border border-zinc-600 text-zinc-200 hover:bg-zinc-800 px-4 py-2 text-sm disabled:opacity-60"
          >
            Re-import from Teams
          </button>
          <button type="button" disabled={busy || !selectedCycleId} onClick={() => setShowAddCandidateModal(true)} className="rounded-lg border border-zinc-600 text-zinc-200 hover:bg-zinc-800 px-4 py-2 text-sm disabled:opacity-60">Add Candidate</button>
        </div>
        <input
          value={candidateSearch}
          onChange={(e) => setCandidateSearch(e.target.value)}
          placeholder="Search candidates by name, team, jersey, or bib"
          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
        />
        <div className="max-h-64 overflow-auto rounded-lg border border-zinc-800">
          {filteredCandidates.length === 0 ? (
            <p className="text-zinc-500 text-sm p-3">
              {candidates.length === 0
                ? "No candidates loaded."
                : "No candidates match your search."}
            </p>
          ) : (
            filteredCandidates.map((candidate) => (
              <div key={candidate.id} className="px-3 py-2 border-b border-zinc-800 last:border-b-0 text-sm flex items-center justify-between gap-3">
                <p className="min-w-0">
                  <span className="font-medium">{candidate.playerFullName}</span> · {candidate.team}
                  {candidate.jerseyNumber?.trim() &&
                  !["tbd", "n/a", "na"].includes(candidate.jerseyNumber.trim().toLowerCase())
                    ? ` · #${candidate.jerseyNumber}`
                    : ""}
                  {selectedCycle?.hasShowcase && candidate.showcaseBibNumber
                    ? ` · Bib ${candidate.showcaseBibNumber}`
                    : ""}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeCandidate(candidate.id)}
                  className="text-xs rounded-lg border border-red-700 text-red-300 px-3 py-1.5 disabled:opacity-60"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <h2 className="text-lg font-semibold">Coaches</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <select
            value={selectedCoachUserId}
            onChange={(e) => setSelectedCoachUserId(e.target.value)}
            className="md:col-span-2 rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          >
            <option value="">Select coach…</option>
            {cycleCoachOptions.map((coach) => {
              const label =
                (coach.firstName || coach.lastName
                  ? [coach.firstName, coach.lastName].filter(Boolean).join(" ")
                  : coach.name) || coach.email;
              const roleLabel =
                coach.coachRole === "HEAD_COACH"
                  ? "Head Coach"
                  : coach.coachRole === "ASSISTANT_COACH"
                    ? "Assistant Coach"
                    : "Coach";
              const teamLabel = coach.assignedTeam ? ` - ${coach.assignedTeam}` : "";
              return (
                <option key={coach.id} value={coach.id}>
                  {label} ({coach.email}) · {roleLabel}{teamLabel}
                </option>
              );
            })}
          </select>
          <button type="button" disabled={busy || !selectedCycleId || !selectedCoachUserId} onClick={() => void addHeadCoach()} className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60">Add Coach</button>
        </div>
        <div className="max-h-48 overflow-auto rounded-lg border border-zinc-800">
          {headCoaches.length === 0 ? <p className="text-zinc-500 text-sm p-3">No coaches assigned.</p> : headCoaches.map((coach) => (
            <div key={coach.id} className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 last:border-b-0">
              <p className="text-sm">{coach.coachName || coach.coachEmail || "Assigned coach"}</p>
              <button type="button" disabled={busy} onClick={() => void removeHeadCoach(coach.id)} className="text-xs rounded-lg border border-red-700 text-red-300 px-3 py-1.5 disabled:opacity-60">Remove</button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <h2 className="text-lg font-semibold">Submitted Ballots</h2>
        <p className="text-xs text-zinc-400">
          Review submitted ballots for the selected cycle. Deleting a ballot unlocks that coach to submit again.
        </p>
        <div>
          <button
            type="button"
            disabled={busy || !selectedCycleId}
            onClick={() => void refreshSubmittedBallots()}
            className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 disabled:opacity-60"
          >
            Refresh
          </button>
        </div>
        <div className="max-h-56 overflow-auto rounded-lg border border-zinc-800">
          {!selectedCycleId ? (
            <p className="text-zinc-500 text-sm p-3">Select a cycle to view submitted ballots.</p>
          ) : submittedBallots.length === 0 ? (
            <p className="text-zinc-500 text-sm p-3">No submitted ballots yet.</p>
          ) : (
            submittedBallots.map((submission) => {
              const coachName =
                (submission.coachUser.firstName || submission.coachUser.lastName
                  ? [submission.coachUser.firstName, submission.coachUser.lastName]
                      .filter(Boolean)
                      .join(" ")
                  : submission.coachUser.name) || submission.coachUser.email;

              return (
                <div key={submission.id} className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 last:border-b-0 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm truncate">
                      <span className="font-medium">{coachName}</span> ({submission.coachUser.email})
                    </p>
                    <p className="text-xs text-zinc-400">
                      Submitted {new Date(submission.submittedAt).toLocaleString()} · {submission.voteItemCount} ratings
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deleteSubmittedBallot(submission.id)}
                    className="text-xs rounded-lg border border-red-700 text-red-300 px-3 py-1.5 disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <h2 className="text-lg font-semibold">Votes Panel</h2>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-zinc-400">
            Live candidate standings sorted by vote count, then average rating.
            Auto-refresh runs every 15 seconds while a cycle is open and published.
          </p>
          <button
            type="button"
            disabled={busy || !selectedCycleId || !canRefreshVoteSummary}
            onClick={() => void refreshVoteSummary()}
            className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 disabled:opacity-60"
          >
            Refresh
          </button>
        </div>
        <p className="text-xs text-zinc-500">Submitted ballots: {voteSummarySubmissionCount}</p>
        <div className="max-h-64 overflow-auto rounded-lg border border-zinc-800">
          {!selectedCycleId ? (
            <p className="text-zinc-500 text-sm p-3">Select a cycle to view vote standings.</p>
          ) : voteSummary.length === 0 ? (
            <p className="text-zinc-500 text-sm p-3">No vote data yet.</p>
          ) : (
            voteSummary.map((row, index) => (
              <div key={row.candidateId} className="px-3 py-2 border-b border-zinc-800 last:border-b-0 text-sm flex items-center justify-between gap-3">
                <p className="min-w-0 truncate">
                  <span className="text-zinc-500 mr-2">#{index + 1}</span>
                  <span className="font-medium">{row.playerFullName}</span> · {row.team} · #{row.jerseyNumber}
                  {selectedCycle?.hasShowcase && row.showcaseBibNumber
                    ? ` · Bib ${row.showcaseBibNumber}`
                    : ""}
                </p>
                <p className="text-xs text-zinc-300 whitespace-nowrap">
                  Votes: {row.voteCount} · Avg: {row.averageRating.toFixed(2)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <h2 className="text-lg font-semibold">All-Star Vault Access</h2>
        {isMasterMode ? (
          <p className="text-xs text-zinc-400">
            On the master admin site you can review access for the selected organization and update or remove
            existing grants. New access is granted from that organization’s admin site. Only Master Admin accounts
            receive automatic full access (shown below when applicable).
          </p>
        ) : (
          <div className="flex flex-wrap gap-3 items-center">
            <select value={vaultUserId} onChange={(e) => setVaultUserId(e.target.value)} className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm min-w-80">
              <option value="">Select account…</option>
              {userOptions.map((user) => (
                <option key={user.id} value={user.id}>{user.name} ({user.email})</option>
              ))}
            </select>
            <select value={vaultRole} onChange={(e) => setVaultRole(e.target.value as "FULL_ACCESS" | "VIEW_ONLY")} className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm">
              <option value="VIEW_ONLY">View Only</option>
              <option value="FULL_ACCESS">Full Access</option>
            </select>
            <button type="button" disabled={busy || !vaultUserId} onClick={() => void grantVaultAccess()} className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60">Grant Access</button>
          </div>
        )}
        <div className="max-h-56 overflow-auto rounded-lg border border-zinc-800">
          {vaultAccess.length === 0 ? <p className="text-zinc-500 text-sm p-3">No vault access grants yet.</p> : vaultAccess.map((access) => (
            <div key={access.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 border-b border-zinc-800 last:border-b-0">
              <p className="text-sm min-w-0 flex-1">{access.registeredUser.email}</p>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {isMasterMode && !access.isImplicit ? (
                  <select
                    value={access.role}
                    disabled={busy || vaultAccessRoleBusyId === access.registeredUser.id}
                    onChange={(e) =>
                      void saveVaultAccessRole(
                        access.registeredUser.id,
                        e.target.value as "FULL_ACCESS" | "VIEW_ONLY",
                      )
                    }
                    className="rounded-lg bg-zinc-950 border border-zinc-700 px-2 py-1.5 text-xs disabled:opacity-60"
                  >
                    <option value="VIEW_ONLY">View Only</option>
                    <option value="FULL_ACCESS">Full Access</option>
                  </select>
                ) : (
                  <span className="text-xs text-zinc-400">
                    {access.role === "FULL_ACCESS" ? "Full Access" : "View Only"}
                  </span>
                )}
                <button
                  type="button"
                  disabled={busy || access.isImplicit === true}
                  onClick={() => void removeVaultAccess(access.registeredUser.id)}
                  className="text-xs rounded-lg border border-red-700 text-red-300 px-3 py-1.5 disabled:opacity-60"
                  title={
                    access.isImplicit
                      ? "Automatic Master Admin access cannot be revoked here."
                      : undefined
                  }
                >
                  {access.isImplicit ? "Master default" : "Revoke"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <h2 className="text-lg font-semibold">Invites And Exports</h2>
        <div className="rounded-lg border border-zinc-700 bg-zinc-950/40 p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-200">Shared ballot link</p>
              <p className="text-xs text-zinc-400 mt-1">
                One URL per ballot. Coaches open it, sign in (same email as their roster entry), then vote.
                Age-group ballots use the same link once generated — keep your coach roster current below.
              </p>
            </div>
            <button
              type="button"
              disabled={busy || !selectedCycleId}
              onClick={() => void generateSharedBallotLink()}
              className="text-xs rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-3 py-2 font-semibold disabled:opacity-60 shrink-0"
            >
              Generate / refresh link
            </button>
          </div>
          {ballotVotingLink ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <code className="text-xs text-brand-gold break-all flex-1">{ballotVotingLink}</code>
              <button
                type="button"
                disabled={busy}
                onClick={() => void copyInviteLink(ballotVotingLink)}
                className="text-xs rounded-lg border border-zinc-600 text-zinc-200 hover:bg-zinc-800 px-3 py-1.5 shrink-0"
              >
                Copy link
              </button>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">
              Generate a link to create the shared voting URL. Refreshing creates a new URL and invalidates the previous one.
            </p>
          )}
        </div>
        {isInviteListCycle ? (
          <div className="space-y-2">
            <p className="text-xs text-zinc-400">
              Select coaches authorized for this ballot (invite-list cycles).
            </p>
            <input
              value={inviteCoachSearch}
              onChange={(event) => setInviteCoachSearch(event.target.value)}
              placeholder="Filter coaches by name, email, or role"
              className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
            />
            <div className="max-h-44 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950/30 divide-y divide-zinc-800">
              {filteredInviteCoachOptions.length === 0 ? (
                <p className="text-zinc-500 text-sm p-3">
                  {cycleCoachOptions.length === 0
                    ? "No coaches available for this cycle."
                    : "No coaches match your filter."}
                </p>
              ) : (
                filteredInviteCoachOptions.map((coach) => {
                  const label =
                    (coach.firstName || coach.lastName
                      ? [coach.firstName, coach.lastName].filter(Boolean).join(" ")
                      : coach.name) || coach.email;
                  const roleLabel =
                    coach.coachRole === "HEAD_COACH"
                      ? "Head Coach"
                      : coach.coachRole === "ASSISTANT_COACH"
                        ? "Assistant Coach"
                        : "Coach";
                  const checked = selectedInviteCoachIds.includes(coach.id);
                  return (
                    <label
                      key={coach.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-zinc-900/50"
                    >
                      <span className="min-w-0 truncate">
                        {label}{" "}
                        <span className="text-zinc-400">
                          ({coach.email}) · {roleLabel}
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          setSelectedInviteCoachIds((current) =>
                            event.target.checked
                              ? Array.from(new Set([...current, coach.id]))
                              : current.filter((id) => id !== coach.id),
                          )
                        }
                      />
                    </label>
                  );
                })
              )}
            </div>
          </div>
        ) : null}
        <textarea value={inviteEmails} onChange={(e) => setInviteEmails(e.target.value)} placeholder={isInviteListCycle ? "Optional extra emails: coach1@email.com, coach2@email.com" : "Optional extra emails (coaches auto-filled from cycle when left blank)"} rows={3} className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm" />
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={busy || !selectedCycleId} onClick={() => void createInvites()} className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60">Save invite roster</button>
          <a href={selectedCycleId ? `/api/admin/all-star/exports/csv?cycleId=${selectedCycleId}` : "#"} className="rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-4 py-2 text-sm">Export CSV</a>
          <a href={selectedCycleId ? `/api/admin/all-star/exports/pdf?cycleId=${selectedCycleId}` : "#"} className="rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-4 py-2 text-sm">Export PDF</a>
        </div>
        {inviteLinks.length > 0 ? (
          <div className="rounded-lg border border-zinc-800 max-h-56 overflow-auto">
            {inviteLinks.map((invite) => {
              const rowBusy = inviteActionId === invite.inviteId;
              return (
                <div
                  key={invite.inviteId}
                  className="px-3 py-2 border-b border-zinc-800 last:border-b-0"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-xs text-zinc-400">
                        {invite.invitedCoachName || "Coach"} — {invite.invitedEmail}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        Added: {new Date(invite.createdAt).toLocaleString()}
                        {invite.openedAt ? " • Opened ballot" : ""}
                        {invite.revokedAt ? " • Revoked from roster" : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      {invite.revokedAt ? (
                        <button
                          type="button"
                          disabled={busy || rowBusy}
                          onClick={() => void reenableInviteRow(invite.inviteId)}
                          className="text-xs rounded-lg border border-emerald-800 text-emerald-200 hover:bg-emerald-950/40 px-3 py-1.5 disabled:opacity-60"
                        >
                          {rowBusy ? "…" : "Re-enable"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy || rowBusy}
                          onClick={() => void revokeInviteRow(invite.inviteId)}
                          className="text-xs rounded-lg border border-red-800 text-red-200 hover:bg-red-950/30 px-3 py-1.5 disabled:opacity-60"
                        >
                          {rowBusy ? "…" : "Remove from roster"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {showAddCandidateModal ? (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 p-5 space-y-4">
            <h3 className="text-lg font-semibold">Add Candidate</h3>
            <p className="text-xs text-zinc-400">
              Bib numbers are assigned automatically (starting at 001) and
              re-numbered when candidates are removed.
            </p>
            <div className="space-y-3">
              <input
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                placeholder="Player full name"
                className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
              />
              <input
                value={candidateTeam}
                onChange={(e) => setCandidateTeam(e.target.value)}
                placeholder="Team"
                className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
              />
              <input
                value={candidateJerseyNumber}
                onChange={(e) => setCandidateJerseyNumber(e.target.value)}
                placeholder="Jersey number"
                className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setShowAddCandidateModal(false)}
                className="rounded-lg border border-zinc-600 text-zinc-300 px-4 py-2 text-sm disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  busy ||
                  !selectedCycleId ||
                  !candidateName.trim() ||
                  !candidateTeam.trim() ||
                  !candidateJerseyNumber.trim()
                }
                onClick={() => void addCandidate()}
                className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                Add Candidate
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
