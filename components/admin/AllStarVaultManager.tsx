"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  readAdminViewPreviewRole,
  type AdminViewPreviewRole,
} from "@/components/admin/AdminRolePreviewControl";

function EditCycleIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-4 w-4"}
      aria-hidden
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function ViewCycleIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-4 w-4"}
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

type Cycle = {
  id: string;
  organizationId: "gonzales" | "ascension";
  seasonYear: number;
  ageGroup: string;
  allStarAgeGroupId: string | null;
  allStarAgeGroupLabel: string | null;
  title: string | null;
  hasShowcase: boolean;
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
  accessMode: "INVITE_LIST" | "AGE_GROUP_COACHES";
  publishedAt: string | null;
  closedAt: string | null;
  ballotLinkToken?: string | null;
};

type AllStarAgeOption = {
  id: string;
  label: string;
};

function parsePrimaryAgeFromAgeGroup(ageGroup: string) {
  const match = ageGroup.trim().toUpperCase().match(/^(\d{1,2})U\b/);
  if (!match?.[1]) return null;
  const age = Number.parseInt(match[1], 10);
  if (!Number.isFinite(age) || age < 4 || age > 18) return null;
  return age;
}

function buildAllStarAgeOptionsForAgeGroup(ageGroup: string): AllStarAgeOption[] {
  const primaryAge = parsePrimaryAgeFromAgeGroup(ageGroup);
  if (!primaryAge) return [];
  const secondaryAge = primaryAge - 1;
  const options: AllStarAgeOption[] = [];
  if (secondaryAge >= 4) {
    options.push({ id: `${secondaryAge}U`, label: `${secondaryAge}U` });
  }
  options.push({ id: `${primaryAge}U`, label: `${primaryAge}U` });
  return options;
}

type Candidate = {
  id: string;
  playerFullName: string;
  team: string;
  jerseyNumber: string;
  showcaseBibNumber: string | null;
  isActive?: boolean;
  excludedFromSecondPhase: boolean;
  secondPhaseOverrideReason: string | null;
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
  role: "FULL_ACCESS" | "LIMITED_ADMIN";
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

type CandidateBulkUpdateDraft = {
  team: string;
  jerseyNumber: string;
  isActive: "UNCHANGED" | "ACTIVE" | "INACTIVE";
  excludedFromSecondPhase: "UNCHANGED" | "YES" | "NO";
  secondPhaseOverrideReason: string;
};

type ModulePreset = "OPERATIONS" | "ROSTER" | "ACCESS";
type EditModuleKey =
  | "cycle"
  | "candidates"
  | "coaches"
  | "submitted"
  | "votes"
  | "sample"
  | "access"
  | "invites";

type EditModuleVisibility = Record<EditModuleKey, boolean>;

function getVisibilityForLimitedVaultBallotToolkit(): EditModuleVisibility {
  return {
    cycle: false,
    candidates: false,
    coaches: false,
    submitted: true,
    votes: true,
    sample: false,
    access: false,
    invites: true,
  };
}

function getVisibilityForPreset(preset: ModulePreset): EditModuleVisibility {
  if (preset === "ROSTER") {
    return {
      cycle: true,
      candidates: true,
      coaches: true,
      submitted: true,
      votes: true,
      sample: true,
      access: false,
      invites: false,
    };
  }
  if (preset === "ACCESS") {
    return {
      cycle: true,
      candidates: false,
      coaches: false,
      submitted: false,
      votes: false,
      sample: false,
      access: true,
      invites: true,
    };
  }
  return {
    cycle: true,
    candidates: true,
    coaches: false,
    submitted: false,
    votes: true,
    sample: false,
    access: false,
    invites: false,
  };
}

type AllStarVaultManagerProps = {
  initialOrg: "gonzales" | "ascension";
  isMasterMode: boolean;
  initialSelectedCycleId?: string;
  showSnapshotBoardOnInitialFullAccess?: boolean;
  /** Org admins with the All-Star module, or vault Full Access. Limited vault grants use false. */
  canManageAllStarVault?: boolean;
  /**
   * Vault grant is LIMITED_ADMIN only (no org All-Star module, no FULL_ACCESS vault).
   * Enables ballot tools: submissions, vote standings, shared link, ballot deletion.
   */
  isLimitedVaultAccess?: boolean;
};

function formatOrganizationLabel(org: "gonzales" | "ascension") {
  return org === "gonzales" ? "Gonzales DYB" : "Ascension LLB";
}

function getCycleTierLabel(title: string | null) {
  return (title || "").toLowerCase().includes("second team")
    ? "SECOND_TEAM"
    : "FIRST_TEAM";
}

function getCycleTierDisplayLabel(
  organizationId: "gonzales" | "ascension",
  title: string | null,
) {
  const normalizedTitle = (title || "").trim().toUpperCase();
  if (organizationId === "gonzales" && normalizedTitle === "11U DYB") {
    return "GOLD";
  }
  const tier = getCycleTierLabel(title);
  if (organizationId === "ascension") {
    return tier === "SECOND_TEAM" ? "RED" : "NAVY";
  }
  return tier === "SECOND_TEAM" ? "GOLD" : "PURPLE";
}

function getCycleTierBadgeClass(
  organizationId: "gonzales" | "ascension",
  title: string | null,
) {
  const displayLabel = getCycleTierDisplayLabel(organizationId, title);
  if (displayLabel === "RED") {
    return "border-red-700 bg-red-950/40 text-red-200";
  }
  if (displayLabel === "NAVY") {
    return "border-sky-700 bg-sky-950/30 text-sky-200";
  }
  if (displayLabel === "GOLD") {
    return "border-amber-700 bg-amber-950/30 text-amber-200";
  }
  return "border-purple-700 bg-purple-950/30 text-purple-200";
}

function getCycleStatusBadgeClass(status: Cycle["status"]) {
  if (status === "PUBLISHED") {
    return "border-emerald-700 bg-emerald-950/40 text-emerald-200";
  }
  if (status === "CLOSED") {
    return "border-amber-700 bg-amber-950/40 text-amber-200";
  }
  if (status === "DRAFT") {
    return "border-sky-700 bg-sky-950/40 text-sky-200";
  }
  return "border-zinc-700 bg-zinc-950 text-zinc-300";
}

function getCycleDisplayTitle(cycle: { title: string | null; seasonYear: number; ageGroup: string } | null) {
  if (!cycle) return "No cycle selected";
  const title = cycle.title?.trim();
  if (title) return title;
  return `${cycle.seasonYear} ${cycle.ageGroup}`;
}

function getCycleOptionSuffix(cycle: {
  organizationId: "gonzales" | "ascension";
  title: string | null;
  seasonYear: number;
  ageGroup: string;
}) {
  const title = cycle.title?.trim();
  if (!title) return "";
  const tier = getCycleTierLabel(cycle.title);
  if (tier === "SECOND_TEAM" && title.toLowerCase() === "second team") return "";
  if (title.toLowerCase() === getDisplayedCycleAgeGroup(cycle).trim().toLowerCase()) return "";
  return ` | ${title}`;
}

function getDisplayedCycleAgeGroup(cycle: {
  organizationId: "gonzales" | "ascension";
  ageGroup: string;
  title: string | null;
}) {
  const normalizedTitle = (cycle.title || "").trim().toUpperCase();
  if (
    cycle.organizationId === "gonzales" &&
    cycle.ageGroup.trim().toUpperCase().startsWith("12U") &&
    normalizedTitle === "11U DYB"
  ) {
    return "11U DYB";
  }
  return cycle.ageGroup;
}

function getDisplayedCycleAgeGroupWithAllStarAge(cycle: {
  organizationId: "gonzales" | "ascension";
  ageGroup: string;
  title: string | null;
  allStarAgeGroupLabel?: string | null;
}) {
  const baseAgeGroup = getDisplayedCycleAgeGroup(cycle);
  const allStarAge = cycle.allStarAgeGroupLabel?.trim();
  if (!allStarAge) return baseAgeGroup;
  return `${baseAgeGroup} [${allStarAge}]`;
}

function getTop12WithCutoffTies(rows: VoteSummaryRow[]) {
  if (rows.length <= 12) return rows;
  const cutoffVotes = rows[11]!.voteCount;
  let end = 12;
  while (end < rows.length && rows[end]!.voteCount === cutoffVotes) {
    end += 1;
  }
  return rows.slice(0, end);
}

function requiresDyb12uAgeBandFilter(orgId: "gonzales" | "ascension", ageGroup: string) {
  return orgId === "gonzales" && ageGroup.trim().toUpperCase().startsWith("12U");
}

function BaseballRatingIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" className="fill-zinc-100" stroke="currentColor" strokeWidth={1.2} />
      <path className="stroke-red-600" strokeWidth={1.15} strokeLinecap="round" d="M9 4.5C7.5 7 7.5 17 9 19.5" />
      <path className="stroke-red-600" strokeWidth={1.15} strokeLinecap="round" d="M15 4.5C16.5 7 16.5 17 15 19.5" />
      <path className="stroke-red-600" strokeWidth={1} strokeLinecap="round" d="M9 8.5L7 9" />
      <path className="stroke-red-600" strokeWidth={1} strokeLinecap="round" d="M9 12L6.8 12" />
      <path className="stroke-red-600" strokeWidth={1} strokeLinecap="round" d="M9 15.5L7 15" />
      <path className="stroke-red-600" strokeWidth={1} strokeLinecap="round" d="M15 8.5L17 9" />
      <path className="stroke-red-600" strokeWidth={1} strokeLinecap="round" d="M15 12L17.2 12" />
      <path className="stroke-red-600" strokeWidth={1} strokeLinecap="round" d="M15 15.5L17 15" />
    </svg>
  );
}

function normalizeBallotEmail(email: string) {
  return email.trim().toLowerCase();
}

function displayNameFromCoachFields(
  firstName: string | null,
  lastName: string | null,
  name: string | null,
  email: string,
) {
  const fromParts =
    firstName || lastName ? [firstName, lastName].filter(Boolean).join(" ").trim() : "";
  const fromName = name?.trim() || "";
  return fromParts || fromName || email;
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

function hasVisibleJerseyNumber(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  return !["tbd", "n/a", "na"].includes(normalized);
}

export default function AllStarVaultManager({
  initialOrg,
  isMasterMode,
  initialSelectedCycleId = "",
  showSnapshotBoardOnInitialFullAccess = true,
  canManageAllStarVault = true,
  isLimitedVaultAccess = false,
}: AllStarVaultManagerProps) {
  const router = useRouter();
  const latestCycleIdRef = useRef("");
  const cycleManagementRef = useRef<HTMLDivElement | null>(null);
  const vaultShellRef = useRef<HTMLElement | null>(null);
  const editModulesShellRef = useRef<HTMLDivElement | null>(null);
  const scrollEditModulesIntoViewAfterExpand = useRef(false);
  const [previewRole, setPreviewRole] = useState<AdminViewPreviewRole>("NONE");
  const [org, setOrg] = useState<"gonzales" | "ascension">(initialOrg);
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState(initialSelectedCycleId);
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
      invitedUserId: string | null;
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
  const [showEditModules, setShowEditModules] = useState(false);
  const [modulePreset, setModulePreset] = useState<ModulePreset>("OPERATIONS");
  const [moduleVisibility, setModuleVisibility] = useState<EditModuleVisibility>(
    getVisibilityForPreset("OPERATIONS"),
  );
  const [showAdvancedCycleActions, setShowAdvancedCycleActions] = useState(false);

  const previewCanViewAllStar =
    previewRole === "BOARD_MEMBER" || previewRole === "PARK_DIRECTOR" ? false : true;
  const previewCanManageAllStar =
    previewRole === "ALL_STAR_VIEW_ONLY" ||
    previewRole === "BOARD_MEMBER" ||
    previewRole === "PARK_DIRECTOR"
      ? false
      : true;
  const canManageAllStarVaultUi = canManageAllStarVault && previewCanManageAllStar;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const manageDisabled = busy || !canManageAllStarVaultUi;

  const [newCycleAgeGroup, setNewCycleAgeGroup] = useState("12U LLB");
  const [ageGroupOptions, setAgeGroupOptions] = useState<string[]>([]);
  const [createCycleWizardStep, setCreateCycleWizardStep] = useState<1 | 2>(1);
  const [newCycleTitle, setNewCycleTitle] = useState("");
  const [newCycleAllStarAgeGroupId, setNewCycleAllStarAgeGroupId] = useState("");
  const [newCycleAccessMode, setNewCycleAccessMode] = useState<"INVITE_LIST" | "AGE_GROUP_COACHES">("AGE_GROUP_COACHES");
  const [newCycleHasShowcase, setNewCycleHasShowcase] = useState(true);
  const [newCycleAgeBandFilter, setNewCycleAgeBandFilter] = useState<"11U" | "12U" | "BOTH">("BOTH");
  const [teamsReimportAgeBandFilter, setTeamsReimportAgeBandFilter] = useState<"11U" | "12U" | "BOTH">("BOTH");
  const [cycleOpenAt, setCycleOpenAt] = useState("");
  const [cycleCloseAt, setCycleCloseAt] = useState("");
  const ageDrivenAllStarOptions = useMemo(
    () => buildAllStarAgeOptionsForAgeGroup(newCycleAgeGroup),
    [newCycleAgeGroup],
  );

  const [candidateFile, setCandidateFile] = useState<File | null>(null);
  const [showAddCandidateModal, setShowAddCandidateModal] = useState(false);
  const [candidateName, setCandidateName] = useState("");
  const [candidateTeam, setCandidateTeam] = useState("");
  const [candidateJerseyNumber, setCandidateJerseyNumber] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateFilterName, setCandidateFilterName] = useState("");
  const [candidateFilterTeam, setCandidateFilterTeam] = useState("");
  const [candidateFilterJersey, setCandidateFilterJersey] = useState("");
  const [candidateFilterJerseyPresence, setCandidateFilterJerseyPresence] = useState<
    "ANY" | "HAS_VALUE" | "NO_VALUE"
  >("ANY");
  const [candidateFilterBibPresence, setCandidateFilterBibPresence] = useState<
    "ANY" | "HAS_VALUE" | "NO_VALUE"
  >("ANY");
  const [candidateFilterActive, setCandidateFilterActive] = useState<"ANY" | "ACTIVE" | "INACTIVE">(
    "ANY",
  );
  const [candidateFilterSecondPhase, setCandidateFilterSecondPhase] = useState<
    "ANY" | "EXCLUDED" | "NOT_EXCLUDED"
  >("ANY");
  const [showCandidateTools, setShowCandidateTools] = useState(false);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [pendingBulkDelete, setPendingBulkDelete] = useState<{
    mode: "SELECTED" | "FILTERED";
    ids: string[];
  } | null>(null);
  const [bulkDeleteConfirmText, setBulkDeleteConfirmText] = useState("");
  const [candidateBulkAction, setCandidateBulkAction] = useState<
    "NONE" | "REMOVE_SELECTED" | "REMOVE_FILTERED" | "APPLY_UPDATE" | "REFRESH_BIBS"
  >("NONE");
  const [candidateBulkDraft, setCandidateBulkDraft] = useState<CandidateBulkUpdateDraft>({
    team: "",
    jerseyNumber: "",
    isActive: "UNCHANGED",
    excludedFromSecondPhase: "UNCHANGED",
    secondPhaseOverrideReason: "",
  });
  const [selectedCoachUserId, setSelectedCoachUserId] = useState("");
  const [selectedInviteCoachIds, setSelectedInviteCoachIds] = useState<string[]>([]);
  const [inviteCoachSearch, setInviteCoachSearch] = useState("");
  const [vaultUserId, setVaultUserId] = useState("");
  const [vaultRole, setVaultRole] = useState<"FULL_ACCESS" | "LIMITED_ADMIN">("LIMITED_ADMIN");
  const [inviteEmails, setInviteEmails] = useState("");
  const [showBallotRosterStatusModal, setShowBallotRosterStatusModal] = useState(false);
  const [limitedOverviewSnapshots, setLimitedOverviewSnapshots] = useState<
    Record<string, VoteSummaryRow[]>
  >({});
  const [limitedOverviewSubmissionCounts, setLimitedOverviewSubmissionCounts] = useState<
    Record<string, number>
  >({});
  const [limitedOverviewMoreCycleId, setLimitedOverviewMoreCycleId] = useState("");

  useEffect(() => {
    setPreviewRole(readAdminViewPreviewRole());
    const onPreviewUpdate = () => setPreviewRole(readAdminViewPreviewRole());
    window.addEventListener("admin-view-preview-updated", onPreviewUpdate);
    window.addEventListener("storage", onPreviewUpdate);
    return () => {
      window.removeEventListener("admin-view-preview-updated", onPreviewUpdate);
      window.removeEventListener("storage", onPreviewUpdate);
    };
  }, []);

  useEffect(() => {
    if (!showEditModules || !scrollEditModulesIntoViewAfterExpand.current) return;
    scrollEditModulesIntoViewAfterExpand.current = false;
    const id = window.requestAnimationFrame(() => {
      editModulesShellRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [showEditModules]);

  useEffect(() => {
    setOrg(initialOrg);
    setSelectedCycleId("");
    setError("");
    setNotice("");
  }, [initialOrg]);

  useEffect(() => {
    if (isLimitedVaultAccess) {
      setModuleVisibility(getVisibilityForLimitedVaultBallotToolkit());
      return;
    }
    setModuleVisibility(getVisibilityForPreset(modulePreset));
  }, [modulePreset, isLimitedVaultAccess]);

  useEffect(() => {
    if (
      newCycleAllStarAgeGroupId &&
      !ageDrivenAllStarOptions.some((option) => option.id === newCycleAllStarAgeGroupId)
    ) {
      setNewCycleAllStarAgeGroupId("");
    }
  }, [ageDrivenAllStarOptions, newCycleAllStarAgeGroupId]);

  useEffect(() => {
    if (cycles.length === 0) return;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        cycles.map(async (cycle) => {
          try {
            const response = await fetch(
              `/api/admin/all-star/votes-summary?cycleId=${cycle.id}${isMasterMode ? `&org=${encodeURIComponent(org)}` : ""}`,
              { cache: "no-store" },
            );
            const json = await safeJson(response);
            if (!response.ok) {
              return [cycle.id, [] as VoteSummaryRow[], 0] as const;
            }
            const rows = Array.isArray(json.data) ? (json.data as VoteSummaryRow[]) : [];
            const submissionCount =
              typeof json.meta === "object" &&
              json.meta !== null &&
              typeof (json.meta as { submissionCount?: unknown }).submissionCount === "number"
                ? (json.meta as { submissionCount: number }).submissionCount
                : 0;
            return [cycle.id, rows, submissionCount] as const;
          } catch {
            return [cycle.id, [] as VoteSummaryRow[], 0] as const;
          }
        }),
      );
      if (cancelled) return;
      setLimitedOverviewSnapshots(
        Object.fromEntries(entries.map(([id, rows]) => [id, rows])),
      );
      setLimitedOverviewSubmissionCounts(
        Object.fromEntries(entries.map(([id, _rows, submissionCount]) => [id, submissionCount])),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [cycles, isMasterMode, org]);

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    void loadCycles();
    void loadAgeGroups();
    if (canManageAllStarVault) {
      void loadVaultAccess();
      void loadUserOptions();
    } else {
      setVaultAccess([]);
      setUserOptions([]);
    }
  }, [org, seasonYear, canManageAllStarVault]);

  useEffect(() => {
    latestCycleIdRef.current = selectedCycleId;
    setSelectedCandidateIds([]);
    setShowAdvancedCycleActions(false);
    if (selectedCycleId) {
      const selectedCycleMeta = cycles.find((entry) => entry.id === selectedCycleId) || null;
      const shouldLoadInvites = selectedCycleMeta?.accessMode === "INVITE_LIST";
      setCandidates([]);
      setHeadCoaches([]);
      setCycleCoachOptions([]);
      setSubmittedBallots([]);
      setVoteSummary([]);
      setVoteSummarySubmissionCount(0);
      setSelectedCoachUserId("");
      if (!shouldLoadInvites) {
        setInviteLinks([]);
        setBallotVotingLink(null);
      }
      void (async () => {
        try {
          const loads = [
            loadCycleDetails(selectedCycleId),
            loadCycleCoaches(selectedCycleId),
            loadSubmittedBallots(selectedCycleId),
            loadVoteSummary(selectedCycleId),
          ];
          if (shouldLoadInvites) {
            loads.push(loadInvites(selectedCycleId));
          }
          await Promise.all(loads);
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
    setLimitedOverviewMoreCycleId("");
  }, [selectedCycleId]);

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
          invitedUserId?: string | null;
          invitedUser?: { id: string } | null;
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
        invitedUserId:
          typeof row.invitedUserId === "string" && row.invitedUserId
            ? row.invitedUserId
            : row.invitedUser?.id ?? null,
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
      `/api/admin/all-star/votes-summary?cycleId=${cycleId}${isMasterMode ? `&org=${encodeURIComponent(org)}` : ""}`,
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
    const shouldUseAgeBandFilter = requiresDyb12uAgeBandFilter(org, newCycleAgeGroup);
    if (shouldUseAgeBandFilter && !newCycleAgeBandFilter) {
      setError("Choose 11U, 12U, or BOTH before creating a 12U DYB cycle.");
      return;
    }
    const autoTitle =
      shouldUseAgeBandFilter && newCycleAgeBandFilter === "11U" && org === "gonzales"
        ? "11U DYB"
        : undefined;
    const selectedAllStarAge = ageDrivenAllStarOptions.find(
      (option) => option.id === newCycleAllStarAgeGroupId,
    );
    const normalizedTitle = newCycleTitle.trim() || autoTitle;
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
          title: normalizedTitle,
          allStarAgeGroupId: selectedAllStarAge?.id || null,
          allStarAgeGroupLabel: selectedAllStarAge?.label || null,
          accessMode: newCycleAccessMode,
          hasShowcase: newCycleHasShowcase,
          autoImportAgeBandFilter: shouldUseAgeBandFilter
            ? newCycleAgeBandFilter
            : "BOTH",
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
      setCreateCycleWizardStep(1);
      setNewCycleTitle("");
      setNewCycleAllStarAgeGroupId("");
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
      if (selectedCycle && requiresDyb12uAgeBandFilter(selectedCycle.organizationId, selectedCycle.ageGroup)) {
        form.append("ageBandFilter", teamsReimportAgeBandFilter);
      }
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

  async function applyBulkCandidateUpdate() {
    if (!selectedCycleId || selectedCandidateIds.length === 0) return;
    const changes: Record<string, unknown> = {};
    if (candidateBulkDraft.team.trim()) changes.team = candidateBulkDraft.team.trim();
    if (candidateBulkDraft.jerseyNumber.trim()) {
      changes.jerseyNumber = candidateBulkDraft.jerseyNumber.trim();
    }
    if (candidateBulkDraft.isActive !== "UNCHANGED") {
      changes.isActive = candidateBulkDraft.isActive === "ACTIVE";
    }
    if (candidateBulkDraft.excludedFromSecondPhase !== "UNCHANGED") {
      changes.excludedFromSecondPhase = candidateBulkDraft.excludedFromSecondPhase === "YES";
    }
    if (candidateBulkDraft.secondPhaseOverrideReason.trim()) {
      changes.secondPhaseOverrideReason = candidateBulkDraft.secondPhaseOverrideReason.trim();
    }
    if (Object.keys(changes).length === 0) {
      setError("Choose at least one field value for bulk update.");
      return;
    }

    setBusy(true);
    setCandidateBulkAction("APPLY_UPDATE");
    setError("");
    setNotice(`Applying bulk updates to ${selectedCandidateIds.length} candidate(s)...`);
    try {
      const response = await fetch("/api/admin/all-star/candidates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "bulk-update",
          cycleId: selectedCycleId,
          candidateIds: selectedCandidateIds,
          changes,
        }),
      });
      const json = await safeJson(response);
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to bulk update candidates"));
      }
      const updated = Number((json as { updated?: unknown }).updated || 0);
      setNotice(`Bulk candidate update complete: ${updated} row(s) updated.`);
      setCandidateBulkDraft({
        team: "",
        jerseyNumber: "",
        isActive: "UNCHANGED",
        excludedFromSecondPhase: "UNCHANGED",
        secondPhaseOverrideReason: "",
      });
      setSelectedCandidateIds([]);
      await loadCycleDetails(selectedCycleId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to bulk update candidates");
    } finally {
      setCandidateBulkAction("NONE");
      setBusy(false);
    }
  }

  async function refreshCandidateBibNumbers() {
    if (!selectedCycleId) return;
    setBusy(true);
    setCandidateBulkAction("REFRESH_BIBS");
    setError("");
    setNotice("Refreshing bib numbers...");
    try {
      const response = await fetch("/api/admin/all-star/candidates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "resequence-bibs", cycleId: selectedCycleId }),
      });
      const json = await safeJson(response);
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to refresh bib numbers"));
      }
      setNotice("Bib numbers refreshed.");
      await loadCycleDetails(selectedCycleId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to refresh bib numbers");
    } finally {
      setCandidateBulkAction("NONE");
      setBusy(false);
    }
  }

  function bulkRemoveCandidates() {
    if (!selectedCycleId || selectedCandidateIds.length === 0) return;
    setError("");
    setNotice("");
    setBulkDeleteConfirmText("");
    setPendingBulkDelete({ mode: "SELECTED", ids: [...selectedCandidateIds] });
  }

  function bulkRemoveFilteredCandidates() {
    if (!selectedCycleId || filteredCandidates.length === 0) return;
    setError("");
    setNotice("");
    setBulkDeleteConfirmText("");
    setPendingBulkDelete({
      mode: "FILTERED",
      ids: filteredCandidates.map((candidate) => candidate.id),
    });
  }

  async function confirmBulkDeleteFromModal() {
    if (!selectedCycleId || !pendingBulkDelete || pendingBulkDelete.ids.length === 0) {
      setPendingBulkDelete(null);
      return;
    }
    const requiresTypedConfirm = pendingBulkDelete.ids.length >= 10;
    if (requiresTypedConfirm && bulkDeleteConfirmText !== "DELETE") {
      setError("Type DELETE to confirm removals of 10+ candidates.");
      return;
    }
    setBusy(true);
    setCandidateBulkAction(
      pendingBulkDelete.mode === "FILTERED" ? "REMOVE_FILTERED" : "REMOVE_SELECTED",
    );
    setError("");
    setNotice(
      pendingBulkDelete.mode === "FILTERED"
        ? `Removing ${pendingBulkDelete.ids.length} filtered candidate(s)...`
        : `Removing ${pendingBulkDelete.ids.length} selected candidate(s)...`,
    );
    try {
      const response = await fetch("/api/admin/all-star/candidates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds: pendingBulkDelete.ids }),
      });
      const json = await safeJson(response);
      if (!response.ok) {
        throw new Error(
          String(
            json.error ||
              (pendingBulkDelete.mode === "FILTERED"
                ? "Failed to bulk remove filtered candidates"
                : "Failed to bulk remove candidates"),
          ),
        );
      }
      const deleted = Number((json as { deleted?: unknown }).deleted || 0);
      setNotice(
        pendingBulkDelete.mode === "FILTERED"
          ? `Bulk remove filtered complete: ${deleted} candidate(s) removed.`
          : `Bulk remove complete: ${deleted} candidate(s) removed.`,
      );
      setSelectedCandidateIds([]);
      setPendingBulkDelete(null);
      setBulkDeleteConfirmText("");
      await loadCycleDetails(selectedCycleId);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : pendingBulkDelete.mode === "FILTERED"
            ? "Failed to bulk remove filtered candidates"
            : "Failed to bulk remove candidates",
      );
    } finally {
      setCandidateBulkAction("NONE");
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

  function openCycleFromCard(cycleId: string) {
    setLimitedOverviewMoreCycleId("");
    setSelectedCycleId(cycleId);
    setShowEditModules(false);
  }

  /** Full and limited admins: emerald icon toggles edit/view modules (scroll into view when opening). */
  function toggleEditModulesPanel() {
    setShowEditModules((prev) => {
      const next = !prev;
      if (next) {
        scrollEditModulesIntoViewAfterExpand.current = true;
      }
      return next;
    });
  }

  function createNewCycleFromBoard() {
    const params = new URLSearchParams({ org });
    router.push(`/admin/all-star/cycle-management?${params.toString()}`);
  }

  function backToCycleSnapshotBoard() {
    setLimitedOverviewMoreCycleId("");
    setSelectedCycleId("");
    setShowEditModules(false);
    setError("");
    setNotice("");
    window.requestAnimationFrame(() => {
      vaultShellRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function openLimitedOverviewMore(cycleId: string) {
    const rows = limitedOverviewSnapshots[cycleId] || [];
    if (rows.length === 0) return;
    setLimitedOverviewMoreCycleId((current) => (current === cycleId ? "" : cycleId));
  }

  function closeLimitedOverviewMore() {
    setLimitedOverviewMoreCycleId("");
  }

  async function generateSecondTeamPhase() {
    if (!selectedCycleId) return;
    if (
      !window.confirm(
        "Generate second-team phase now? This uses FIRST_TEAM standings and excludes the top 12 by current vote ordering (editable after generation).",
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/all-star/second-phase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleId: selectedCycleId, action: "generate" }),
      });
      const json = await safeJson(response);
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to generate second-team phase"));
      }
      const secondCycleId =
        typeof (json as { secondCycleId?: unknown }).secondCycleId === "string"
          ? (json as { secondCycleId: string }).secondCycleId
          : "";
      setNotice(
        typeof (json as { created?: unknown }).created === "boolean" &&
          (json as { created: boolean }).created === false
          ? "Second-team cycle already exists. Switched to existing cycle."
          : "Second-team cycle created from first-team standings.",
      );
      await loadCycles();
      if (secondCycleId) {
        setSelectedCycleId(secondCycleId);
      } else {
        await loadCycleDetails(selectedCycleId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate second-team phase");
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
    role: "FULL_ACCESS" | "LIMITED_ADMIN",
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
        body: JSON.stringify({
          cycleId: selectedCycleId,
          emails,
        }),
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
    const matchesSearch =
      !query ||
      (
      candidate.playerFullName.toLowerCase().includes(query) ||
      candidate.team.toLowerCase().includes(query) ||
      candidate.jerseyNumber.toLowerCase().includes(query) ||
      String(candidate.showcaseBibNumber || "")
        .toLowerCase()
        .includes(query)
      );
    if (!matchesSearch) return false;

    const nameFilter = candidateFilterName.trim().toLowerCase();
    if (nameFilter && !candidate.playerFullName.toLowerCase().includes(nameFilter)) return false;

    const teamFilter = candidateFilterTeam.trim().toLowerCase();
    if (teamFilter && !candidate.team.toLowerCase().includes(teamFilter)) return false;

    const jerseyFilter = candidateFilterJersey.trim().toLowerCase();
    if (jerseyFilter && !candidate.jerseyNumber.toLowerCase().includes(jerseyFilter)) return false;

    const hasJerseyValue = hasVisibleJerseyNumber(candidate.jerseyNumber);
    if (candidateFilterJerseyPresence === "HAS_VALUE" && !hasJerseyValue) return false;
    if (candidateFilterJerseyPresence === "NO_VALUE" && hasJerseyValue) return false;

    const hasBibValue = Boolean(candidate.showcaseBibNumber && String(candidate.showcaseBibNumber).trim());
    if (candidateFilterBibPresence === "HAS_VALUE" && !hasBibValue) return false;
    if (candidateFilterBibPresence === "NO_VALUE" && hasBibValue) return false;

    const isActive = candidate.isActive !== false;
    if (candidateFilterActive === "ACTIVE" && !isActive) return false;
    if (candidateFilterActive === "INACTIVE" && isActive) return false;

    if (candidateFilterSecondPhase === "EXCLUDED" && !candidate.excludedFromSecondPhase) return false;
    if (candidateFilterSecondPhase === "NOT_EXCLUDED" && candidate.excludedFromSecondPhase) {
      return false;
    }

    return true;
  });
  const allFilteredSelected =
    filteredCandidates.length > 0 &&
    filteredCandidates.every((candidate) => selectedCandidateIds.includes(candidate.id));
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

  useEffect(() => {
    setSelectedCandidateIds((prev) => prev.filter((id) => candidates.some((candidate) => candidate.id === id)));
  }, [candidates]);

  const ballotRosterStatus = useMemo(() => {
    if (!selectedCycleId || !selectedCycle) return null;

    const submittedByUserId = new Set(submittedBallots.map((s) => s.coachUserId));
    const submittedEmails = new Set(
      submittedBallots.map((s) => normalizeBallotEmail(s.coachUser.email)),
    );

    type RosterRow = { key: string; displayName: string; email: string };

    if (selectedCycle.accessMode === "INVITE_LIST") {
      const active = inviteLinks.filter((i) => !i.revokedAt);
      const submitted: RosterRow[] = [];
      const pending: RosterRow[] = [];
      for (const inv of active) {
        const row: RosterRow = {
          key: inv.inviteId,
          displayName: inv.invitedCoachName?.trim() || inv.invitedEmail,
          email: inv.invitedEmail,
        };
        const uid = inv.invitedUserId;
        const didSubmit =
          (uid != null && submittedByUserId.has(uid)) ||
          submittedEmails.has(normalizeBallotEmail(inv.invitedEmail));
        (didSubmit ? submitted : pending).push(row);
      }
      return {
        rosterLabel: "Invite roster",
        rosterLabelShort: "invite roster",
        total: active.length,
        submittedCount: submitted.length,
        submitted,
        pending,
      };
    }

    const roster: RosterRow[] = cycleCoachOptions.map((c) => ({
      key: c.id,
      displayName: displayNameFromCoachFields(
        c.firstName,
        c.lastName,
        c.name,
        c.email,
      ),
      email: c.email,
    }));
    const submitted: RosterRow[] = [];
    const pending: RosterRow[] = [];
    for (const row of roster) {
      const didSubmit = submittedByUserId.has(row.key);
      (didSubmit ? submitted : pending).push(row);
    }
    return {
      rosterLabel: "Coaches in league (this age group)",
      rosterLabelShort: "league coaches",
      total: roster.length,
      submittedCount: submitted.length,
      submitted,
      pending,
    };
  }, [
    selectedCycleId,
    selectedCycle,
    inviteLinks,
    cycleCoachOptions,
    submittedBallots,
  ]);

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

  const isAuditorFocusedPreview = previewRole === "ALL_STAR_VIEW_ONLY";
  /** Includes limited vault grant and master preview of limited-admin lens (session still has full rights). */
  const canDeleteSubmittedBallots =
    canManageAllStarVaultUi ||
    isLimitedVaultAccess ||
    (canManageAllStarVault && isAuditorFocusedPreview);
  const showFullAdminView = previewCanViewAllStar && !isAuditorFocusedPreview;
  const orgQuery = isMasterMode ? `&org=${encodeURIComponent(org)}` : "";
  const sampleBallotCandidates = candidates
    .filter((candidate) => candidate.isActive !== false)
    .slice(0, 12);
  const limitedOverviewCycles = [...cycles].sort((a, b) => {
    if (b.seasonYear !== a.seasonYear) return b.seasonYear - a.seasonYear;
    return b.id.localeCompare(a.id);
  });
  const boardTitle = showFullAdminView
    ? "Cycle Snapshot Board"
    : isAuditorFocusedPreview
      ? "Observer Snapshot (limited admin)"
      : `Limited Overview (${previewRole.replaceAll("_", " ")})`;
  const showCycleSnapshotBoard =
    (showFullAdminView &&
      (showSnapshotBoardOnInitialFullAccess && !selectedCycleId)) ||
    (!showFullAdminView &&
      !(isAuditorFocusedPreview && Boolean(selectedCycleId)));
  /** On the main Vault page, full admins start on the board only; management chrome appears after opening a cycle. */
  const showFullAdminManagementChrome =
    showFullAdminView &&
    (!showSnapshotBoardOnInitialFullAccess || Boolean(selectedCycleId));
  const showBackToCycleBoardShortcut =
    showFullAdminManagementChrome &&
    showSnapshotBoardOnInitialFullAccess &&
    Boolean(selectedCycleId);
  /** Limited-admin preview: back + emerald summary when drilled into a cycle (Observer Snapshot follows below). */
  const showAuditorSelectedCycleSummary =
    isAuditorFocusedPreview && Boolean(selectedCycle);
  const showCycleBoardBackShortcut =
    showBackToCycleBoardShortcut ||
    (isAuditorFocusedPreview && Boolean(selectedCycleId));
  const showEmeraldSelectedCycleCard =
    (showBackToCycleBoardShortcut && Boolean(selectedCycle)) ||
    showAuditorSelectedCycleSummary;
  /** Vault snapshot drill-in: editing chrome stays hidden until the user clicks the edit icon. */
  const vaultSnapshotDetailActive =
    showSnapshotBoardOnInitialFullAccess && Boolean(selectedCycleId);
  const showManagementEditChrome =
    showFullAdminManagementChrome &&
    (!vaultSnapshotDetailActive || showEditModules);

  return (
    <section ref={vaultShellRef} className="space-y-6">
      {error ? <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">{error}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-300">{notice}</div> : null}
      {!canManageAllStarVaultUi && !isAuditorFocusedPreview ? (
        <div className="rounded-lg border border-sky-800 bg-sky-950/30 p-3 text-sm text-sky-200">
          {isLimitedVaultAccess
            ? "Limited admin vault access: you can open ballot tools below for the selected cycle — submitted ballots, vote standings, and the shared ballot link. You may delete a submitted ballot to let that coach vote again. Cycle setup, candidates, and roster edits stay disabled."
            : "Some management actions are hidden for your current preview or role."}
        </div>
      ) : null}
      {showCycleSnapshotBoard ? (
        <div className="rounded-xl border border-emerald-800/45 bg-emerald-950/20 p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-emerald-100">{boardTitle}</h2>
            <p className="text-sm text-emerald-100/75">
              Per-cycle snapshots with names-first leaderboard context.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {showFullAdminView &&
            showSnapshotBoardOnInitialFullAccess &&
            !selectedCycleId ? (
              <>
                {isMasterMode ? (
                  <select
                    value={org}
                    onChange={(e) =>
                      setOrg(e.target.value as "gonzales" | "ascension")
                    }
                    className="rounded-lg bg-zinc-950 border border-emerald-800/60 px-3 py-2 text-sm text-emerald-50 min-w-[170px]"
                  >
                    <option value="gonzales">Gonzales DYB</option>
                    <option value="ascension">Ascension LLB</option>
                  </select>
                ) : null}
                <select
                  value={seasonYear}
                  onChange={(e) => setSeasonYear(Number(e.target.value))}
                  className="rounded-lg bg-zinc-950 border border-emerald-800/60 px-3 py-2 text-sm text-emerald-50 min-w-[120px]"
                >
                  {seasonOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            {showFullAdminView ? (
              <button
                type="button"
                onClick={createNewCycleFromBoard}
                className="rounded-lg border border-emerald-600/70 text-emerald-200 hover:bg-emerald-950/40 px-3 py-2 text-sm"
              >
                Create New
              </button>
            ) : null}
          </div>
        </div>
        {limitedOverviewCycles.length === 0 ? (
          <p className="text-zinc-400 text-sm">No cycles available for this organization.</p>
        ) : (
          <div className="space-y-3">
            {limitedOverviewCycles.map((cycle) => {
              const rows = limitedOverviewSnapshots[cycle.id] || [];
              const topFive = rows.slice(0, 5);
              const top12Rows = getTop12WithCutoffTies(rows);
              const isExpanded = limitedOverviewMoreCycleId === cycle.id;
              const hasVoteData = rows.length > 0;
              return (
                <div
                  key={cycle.id}
                  className="rounded-xl border border-emerald-800/35 bg-emerald-950/10 text-sm flex flex-col overflow-hidden"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    data-admin-preview-allow="true"
                    onClick={() => openCycleFromCard(cycle.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openCycleFromCard(cycle.id);
                      }
                    }}
                    className="p-4 space-y-2 cursor-pointer text-left hover:bg-emerald-950/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/45 focus-visible:ring-inset"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-zinc-200 font-medium">
                        {formatOrganizationLabel(cycle.organizationId)} · {cycle.seasonYear} · {getDisplayedCycleAgeGroupWithAllStarAge(cycle)} · {getCycleTierDisplayLabel(cycle.organizationId, cycle.title)}
                      </p>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${getCycleStatusBadgeClass(cycle.status)}`}>
                        {cycle.status}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400">
                      Submitted ballots: {limitedOverviewSubmissionCounts[cycle.id] || 0}
                    </p>
                    <div className="space-y-1">
                      {topFive.length === 0 ? (
                        <p className="text-zinc-500 text-xs">No vote data yet.</p>
                      ) : (
                        topFive.map((row, index) => (
                          <p key={row.candidateId} className="text-zinc-200 text-xs">
                            #{index + 1} {row.playerFullName} · {row.team}
                          </p>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-4 py-2 border-t border-emerald-800/30 bg-black/15">
                    <button
                      type="button"
                      data-admin-preview-allow="true"
                      disabled={!hasVoteData}
                      title={hasVoteData ? undefined : "Vote standings available after votes come in"}
                      onClick={(e) => {
                        e.stopPropagation();
                        openLimitedOverviewMore(cycle.id);
                      }}
                      className={`text-xs rounded-lg border px-3 py-1.5 ${
                        hasVoteData
                          ? "border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                          : "border-zinc-700 text-zinc-600 cursor-not-allowed opacity-50"
                      }`}
                    >
                      {isExpanded ? "Collapse" : "...more"}
                    </button>
                  </div>
                  {isExpanded && top12Rows.length > 0 ? (
                    <div className="rounded-lg border border-zinc-700 bg-zinc-900/70 p-3 space-y-2 mx-3 mb-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs uppercase tracking-wide text-zinc-400">
                          Top 12 Snapshot (Names Only)
                        </p>
                        <button
                          type="button"
                          data-admin-preview-allow="true"
                          className="rounded-lg border border-zinc-600 text-zinc-300 px-2 py-1 text-xs hover:bg-zinc-800 shrink-0"
                          onClick={closeLimitedOverviewMore}
                        >
                          Close
                        </button>
                      </div>
                      <div className="rounded-lg border border-zinc-800 overflow-hidden">
                        {top12Rows.map((row, index) => (
                          <div key={row.candidateId} className="px-3 py-2 border-b border-zinc-800 last:border-b-0">
                            <p className="text-sm text-zinc-200">#{index + 1} {row.playerFullName} · {row.team}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        </div>
      ) : null}

      {showCycleBoardBackShortcut ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={backToCycleSnapshotBoard}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-800/60 bg-emerald-950/25 text-emerald-100 hover:bg-emerald-950/40 px-3 py-2 text-sm"
          >
            ← Back to cycle board
          </button>
        </div>
      ) : null}

      {showEmeraldSelectedCycleCard && selectedCycle ? (
        <div className="rounded-xl border border-emerald-800/45 bg-emerald-950/20 p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400/90">
                Selected cycle (vault view)
              </p>
              <h2 className="text-lg font-semibold text-zinc-100 leading-snug">
                {formatOrganizationLabel(selectedCycle.organizationId)} · {selectedCycle.seasonYear} ·{" "}
                {getDisplayedCycleAgeGroupWithAllStarAge(selectedCycle)} ·{" "}
                {getCycleTierDisplayLabel(selectedCycle.organizationId, selectedCycle.title)}
              </h2>
              <p className="text-sm text-zinc-400 truncate" title={getCycleDisplayTitle(selectedCycle)}>
                {getCycleDisplayTitle(selectedCycle)}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {showFullAdminView && (canManageAllStarVaultUi || isLimitedVaultAccess) ? (
                isLimitedVaultAccess ? (
                  <>
                    <button
                      type="button"
                      onClick={() => toggleEditModulesPanel()}
                      aria-pressed={showEditModules}
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-600/80 text-emerald-200 hover:bg-emerald-950/40 ${
                        showEditModules ? "bg-emerald-950/55 ring-2 ring-emerald-500/40" : ""
                      }`}
                      title={showEditModules ? "Hide view modules" : "View modules"}
                      aria-label={showEditModules ? "Hide view modules" : "View modules"}
                    >
                      <ViewCycleIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleEditModulesPanel()}
                      className={`rounded-lg border border-emerald-600/80 px-3 py-1.5 text-sm font-medium text-emerald-100 hover:bg-emerald-950/40 ${
                        showEditModules ? "bg-emerald-950/55 ring-2 ring-emerald-500/40" : ""
                      }`}
                    >
                      {showEditModules ? "Hide view modules" : "View modules"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleEditModulesPanel()}
                    aria-pressed={showEditModules}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-600/80 text-emerald-200 hover:bg-emerald-950/40 ${
                      showEditModules ? "bg-emerald-950/55 ring-2 ring-emerald-500/40" : ""
                    }`}
                    title={showEditModules ? "Hide editing tools" : "Show editing tools"}
                    aria-label={showEditModules ? "Hide editing tools" : "Show editing tools"}
                  >
                    <EditCycleIcon className="h-4 w-4" />
                  </button>
                )
              ) : null}
              <span
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${getCycleStatusBadgeClass(selectedCycle.status)}`}
              >
                {selectedCycle.status}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-400">
            <span>
              Candidates:{" "}
              <span className="font-semibold text-zinc-200 tabular-nums">{candidates.length}</span>
            </span>
            {ballotRosterStatus ? (
              <span>
                Ballots in:{" "}
                <span className="font-semibold text-zinc-200 tabular-nums">
                  {ballotRosterStatus.submittedCount}/{ballotRosterStatus.total}
                </span>
                <span className="text-zinc-500"> · {ballotRosterStatus.rosterLabelShort}</span>
              </span>
            ) : null}
            <span>
              Vote standings:{" "}
              <span className="font-semibold text-zinc-200 tabular-nums">{voteSummary.length}</span>
            </span>
            <span className="text-zinc-500">
              {selectedCycle.accessMode === "INVITE_LIST" ? "Invite list access" : "Age-group coach access"}
              {selectedCycle.hasShowcase ? " · Showcase" : ""}
            </span>
          </div>
          <p className="text-xs text-zinc-500 max-w-2xl">
            {isAuditorFocusedPreview ? (
              <>
                Observer snapshot tools for this ballot are in the sections below — submitted ballots, vote standings,
                shared link, and exports.
              </>
            ) : isLimitedVaultAccess ? (
              <>
                Use <span className="text-zinc-400">View modules</span> to open submitted ballots, vote standings, and the
                shared ballot link. Collapse again with <span className="text-zinc-400">Hide view modules</span> in that
                section.
              </>
            ) : (
              <>
                Click a snapshot card to open this summary. Use the edit icon here when you want ballot tools and exports. Use{" "}
                <span className="text-zinc-400">Hide Edit Modules</span> at the top of that section to collapse them again.
              </>
            )}
          </p>
        </div>
      ) : null}

      {isAuditorFocusedPreview ? (
        <>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-3">
            <h2 className="text-lg font-semibold">Observer Snapshot (limited admin)</h2>
            <p className="text-xs text-zinc-400">
              Full management sections are hidden in this preview. Showing ballot operations and read-only exports.
            </p>
            <div className="max-w-md">
              <label className="text-xs uppercase tracking-wide text-zinc-500">Select Ballot</label>
              <select
                data-admin-preview-allow="true"
                value={selectedCycleId}
                onChange={(event) => setSelectedCycleId(event.target.value)}
                className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
              >
                <option value="">Select cycle…</option>
                {cycles.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {formatOrganizationLabel(cycle.organizationId)} | {cycle.seasonYear} | {getDisplayedCycleAgeGroupWithAllStarAge(cycle)} | {cycle.status} | {getCycleTierDisplayLabel(cycle.organizationId, cycle.title)}{getCycleOptionSuffix(cycle)}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-sm text-zinc-200">
              {selectedCycle
                ? `${formatOrganizationLabel(selectedCycle.organizationId)} · ${selectedCycle.seasonYear} · ${getDisplayedCycleAgeGroupWithAllStarAge(selectedCycle)} · ${selectedCycle.status} · ${getCycleTierDisplayLabel(selectedCycle.organizationId, selectedCycle.title)}`
                : "No cycle selected"}
            </p>
            <p className="text-xs text-zinc-500">
              {ballotRosterStatus
                ? `${ballotRosterStatus.submittedCount}/${ballotRosterStatus.total} submitted (${ballotRosterStatus.rosterLabelShort})`
                : "No roster progress available"}
            </p>
            {selectedCycleId && ballotRosterStatus ? (
              <button
                type="button"
                data-admin-preview-allow="true"
                onClick={() => setShowBallotRosterStatusModal(true)}
                className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 inline-flex items-center gap-2 w-fit"
              >
                <span className="text-zinc-500">View submitted vs total</span>
                <span className="tabular-nums font-semibold text-zinc-100">
                  {ballotRosterStatus.submittedCount}/{ballotRosterStatus.total}
                </span>
              </button>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <a
                href={
                  selectedCycleId
                    ? `/api/admin/all-star/exports/votes-panel/csv?cycleId=${selectedCycleId}${orgQuery}`
                    : "#"
                }
                className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5"
              >
                Export CSV
              </a>
              <a
                href={
                  selectedCycleId
                    ? `/api/admin/all-star/exports/votes-panel/pdf?cycleId=${selectedCycleId}&layout=name${orgQuery}`
                    : "#"
                }
                className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5"
              >
                PDF (name only)
              </a>
              <a
                href={
                  selectedCycleId
                    ? `/api/admin/all-star/exports/votes-panel/pdf?cycleId=${selectedCycleId}&layout=full${orgQuery}`
                    : "#"
                }
                className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5"
              >
                PDF (full)
              </a>
              <a
                href={
                  selectedCycleId
                    ? `/api/admin/all-star/exports/showcase-scorecard/pdf?cycleId=${selectedCycleId}${orgQuery}`
                    : "#"
                }
                className="text-xs rounded-lg border border-amber-700 text-amber-200 hover:bg-amber-950/30 px-3 py-1.5"
              >
                Showcase Score Card (fillable PDF)
              </a>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
            <h2 className="text-lg font-semibold">Submitted Ballots</h2>
            <p className="text-xs text-zinc-500">Submitted ballots: {voteSummarySubmissionCount}</p>
            <div className="max-h-56 overflow-auto rounded-lg border border-zinc-800">
              {!selectedCycleId ? (
                <p className="text-zinc-500 text-sm p-3">Select a cycle to view submitted ballots.</p>
              ) : submittedBallots.length === 0 ? (
                <p className="text-zinc-500 text-sm p-3">No submitted ballots yet.</p>
              ) : (
                submittedBallots.map((submission) => (
                  <div
                    key={submission.id}
                    className="px-3 py-2 border-b border-zinc-800 last:border-b-0 flex flex-wrap items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-200">
                        {displayNameFromCoachFields(
                          submission.coachUser.firstName,
                          submission.coachUser.lastName,
                          submission.coachUser.name,
                          submission.coachUser.email,
                        )}
                      </p>
                      <p className="text-xs text-zinc-500">{submission.coachUser.email}</p>
                      <p className="text-xs text-zinc-500">
                        Submitted {new Date(submission.submittedAt).toLocaleString()} · {submission.voteItemCount}{" "}
                        ratings
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busy || !canDeleteSubmittedBallots}
                      onClick={() => void deleteSubmittedBallot(submission.id)}
                      className="text-xs rounded-lg border border-red-700 text-red-300 px-3 py-1.5 disabled:opacity-60 shrink-0"
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
            <h2 className="text-lg font-semibold">Votes Panel</h2>
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
                    </p>
                    <p className="text-xs text-zinc-300 whitespace-nowrap">
                      Votes: {row.voteCount} · Avg: {row.averageRating.toFixed(2)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-3">
            <h2 className="text-lg font-semibold">Shared ballot link</h2>
            <p className="text-xs text-zinc-400">
              Same link coaches use to open the ballot (when generated for this cycle). Copy and share as needed.
            </p>
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
                No shared link is set for this cycle yet. A full admin can generate one under Invites on the main vault
                view.
              </p>
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-3">
            <h2 className="text-lg font-semibold">Sample Ballot</h2>
            <p className="text-xs text-zinc-400">
              Read-only preview of what a ballot row looks like for this cycle.
            </p>
            <div className="max-h-64 overflow-auto rounded-lg border border-zinc-800">
              {sampleBallotCandidates.length === 0 ? (
                <p className="text-zinc-500 text-sm p-3">No candidates available for sample ballot.</p>
              ) : (
                sampleBallotCandidates.map((candidate) => (
                  <div
                    key={candidate.id}
                    className="px-3 py-2 border-b border-zinc-800 last:border-b-0 flex items-center justify-between gap-3"
                  >
                    <p className="text-sm min-w-0 truncate">
                      <span className="font-medium">{candidate.playerFullName}</span> · {candidate.team}
                      {hasVisibleJerseyNumber(candidate.jerseyNumber)
                        ? ` · #${candidate.jerseyNumber}`
                        : ""}
                    </p>
                    <div className="flex items-center gap-1 text-zinc-500">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <span key={value} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 bg-zinc-950/50 p-0.5 opacity-70">
                          <BaseballRatingIcon className="h-5 w-5" />
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}

      {showFullAdminManagementChrome ? (
      <>
      {showManagementEditChrome ? (
      <>
      <div ref={editModulesShellRef} className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{isLimitedVaultAccess ? "View modules" : "Edit Modules"}</h2>
            <p className="text-xs text-zinc-400">
              {isLimitedVaultAccess
                ? "Sections below match your access: view ballots and standings; delete a submission only when a coach must vote again."
                : "Keep the workspace compact and expand editing only when needed."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowEditModules((prev) => !prev)}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            {isLimitedVaultAccess
              ? showEditModules
                ? "Hide view modules"
                : "View modules"
              : showEditModules
                ? "Hide Edit Modules"
                : "Show Edit Modules"}
          </button>
        </div>
        {!showEditModules ? (
          <p className="text-xs text-zinc-500">
            {isLimitedVaultAccess
              ? "Modules are collapsed. Open View modules to see ballots, vote standings, and the shared link."
              : "Editing is collapsed. Expand to work in Cycle Management, Candidates, and Votes."}
          </p>
        ) : isLimitedVaultAccess ? (
          <p className="text-xs text-zinc-500">
            Submitted ballots, vote standings, and ballot link / invite roster (view). Generating links or changing rosters
            requires full vault access.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs uppercase tracking-wide text-zinc-500">Preset</label>
            <select
              value={modulePreset}
              onChange={(event) => setModulePreset(event.target.value as ModulePreset)}
              className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs"
            >
              <option value="OPERATIONS">Operations</option>
              <option value="ROSTER">Roster + Voting</option>
              <option value="ACCESS">Access + Invites</option>
            </select>
            <div className="flex flex-wrap items-center gap-2 ml-2">
              {(
                [
                  ["cycle", "Cycle"],
                  ["candidates", "Candidates"],
                  ["coaches", "Coaches"],
                  ["submitted", "Ballots"],
                  ["votes", "Votes"],
                  ["sample", "Sample"],
                  ["access", "Access"],
                  ["invites", "Invites"],
                ] as Array<[EditModuleKey, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setModuleVisibility((current) => ({ ...current, [key]: !current[key] }))
                  }
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${
                    moduleVisibility[key]
                      ? "border-emerald-700 bg-emerald-950/30 text-emerald-200"
                      : "border-zinc-700 bg-zinc-950 text-zinc-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {showEditModules && moduleVisibility.cycle ? (
      <div ref={cycleManagementRef} className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
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
          {createCycleWizardStep === 1 ? (
            <>
              <input
                value={newCycleTitle}
                onChange={(e) => setNewCycleTitle(e.target.value)}
                placeholder="Cycle title (optional)"
                className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm min-w-[220px]"
              />
              <select
                value={newCycleAccessMode}
                onChange={(e) =>
                  setNewCycleAccessMode(
                    e.target.value as "INVITE_LIST" | "AGE_GROUP_COACHES",
                  )
                }
                className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm min-w-[210px]"
              >
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
              <button
                type="button"
                disabled={manageDisabled}
                onClick={() => setCreateCycleWizardStep(2)}
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-60"
              >
                Next: Age Setup
              </button>
            </>
          ) : (
            <>
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
              <select
                value={newCycleAllStarAgeGroupId}
                onChange={(e) => setNewCycleAllStarAgeGroupId(e.target.value)}
                className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm min-w-[180px]"
              >
                <option value="">All-Star Age: Global (all ages)</option>
                {ageDrivenAllStarOptions.map((ageOption) => (
                  <option key={ageOption.id} value={ageOption.id}>
                    All-Star Age: {ageOption.label}
                  </option>
                ))}
              </select>
              {requiresDyb12uAgeBandFilter(org, newCycleAgeGroup) &&
              !newCycleAllStarAgeGroupId ? (
                <select
                  value={newCycleAgeBandFilter}
                  onChange={(e) =>
                    setNewCycleAgeBandFilter(e.target.value as "11U" | "12U" | "BOTH")
                  }
                  className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm min-w-[170px]"
                >
                  <option value="BOTH">All-Star pool: 11U + 12U</option>
                  <option value="11U">All-Star pool: 11U only</option>
                  <option value="12U">All-Star pool: 12U only</option>
                </select>
              ) : null}
              <button
                type="button"
                disabled={manageDisabled}
                onClick={() => setCreateCycleWizardStep(1)}
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
              >
                Back
              </button>
              <button
                type="button"
                disabled={manageDisabled || !newCycleAgeGroup}
                onClick={() => void createCycle()}
                className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                Save Cycle
              </button>
            </>
          )}
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
                {formatOrganizationLabel(cycle.organizationId)} | {cycle.seasonYear} | {getDisplayedCycleAgeGroup(cycle)}
                {cycle.allStarAgeGroupLabel ? ` [${cycle.allStarAgeGroupLabel}]` : ""}
                {" | "}
                {cycle.status} | {getCycleTierDisplayLabel(cycle.organizationId, cycle.title)}{getCycleOptionSuffix(cycle)}
              </option>
            ))}
          </select>
          <button type="button" disabled={manageDisabled || !selectedCycleId} onClick={() => void updateCycleStatus("PUBLISHED")} className="rounded-lg border border-emerald-700 text-emerald-300 px-3 py-2 text-sm disabled:opacity-60">Publish</button>
          <button type="button" disabled={manageDisabled || !selectedCycleId} onClick={() => void updateCycleStatus("CLOSED")} className="rounded-lg border border-amber-700 text-amber-300 px-3 py-2 text-sm disabled:opacity-60">Close</button>
          <button
            type="button"
            disabled={manageDisabled || !selectedCycleId}
            onClick={() => setShowAdvancedCycleActions((prev) => !prev)}
            className="rounded-lg border border-zinc-600 text-zinc-300 px-3 py-2 text-sm disabled:opacity-60"
          >
            {showAdvancedCycleActions ? "Hide Advanced Actions" : "Advanced Actions"}
          </button>
        </div>
        {showAdvancedCycleActions ? (
          <div className="rounded-lg border border-red-900/60 bg-red-950/20 p-3 space-y-3">
            <p className="text-xs text-red-200">
              Destructive actions are grouped here to reduce accidental changes.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={manageDisabled || !selectedCycleId || !canDeleteCycles}
                onClick={() => void deleteCycle()}
                className="rounded-lg border border-red-700 text-red-300 px-3 py-2 text-sm disabled:opacity-60"
              >
                Delete Cycle
              </button>
              <button
                type="button"
                disabled={manageDisabled || !selectedCycleId}
                onClick={() => void generateSecondTeamPhase()}
                className="rounded-lg border border-indigo-700 text-indigo-300 px-3 py-2 text-sm disabled:opacity-60"
              >
                Generate Second Team
              </button>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span>
            Cycle: <span className="text-zinc-300 font-medium">{getCycleDisplayTitle(selectedCycle)}</span>
          </span>
          {selectedCycle ? (
            <span className={`rounded-full border px-2 py-0.5 font-semibold tracking-wide ${getCycleTierBadgeClass(selectedCycle.organizationId, selectedCycle.title)}`}>
              {getCycleTierDisplayLabel(selectedCycle.organizationId, selectedCycle.title)}
            </span>
          ) : null}
          {selectedCycle?.allStarAgeGroupLabel ? (
            <span className="rounded-full border border-amber-700/70 bg-amber-950/30 px-2 py-0.5 font-semibold tracking-wide text-amber-200">
              Age: {selectedCycle.allStarAgeGroupLabel}
            </span>
          ) : null}
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
            disabled={manageDisabled || !selectedCycleId || !cycleOpenAt || !cycleCloseAt}
            onClick={() => void saveCycleOpenWindow()}
            className="rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-2 text-sm disabled:opacity-60"
          >
            Set Open Time Period
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={manageDisabled || !selectedCycleId}
            onClick={() => void setOpenNowForHours(1)}
            className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 disabled:opacity-60"
          >
            Open Now (1h)
          </button>
          <button
            type="button"
            disabled={manageDisabled || !selectedCycleId}
            onClick={() => void setOpenNowForHours(4)}
            className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 disabled:opacity-60"
          >
            Open Now (4h)
          </button>
          <button
            type="button"
            disabled={manageDisabled || !selectedCycleId}
            onClick={() => void setOpenNowForHours(24)}
            className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 disabled:opacity-60"
          >
            Open Now (24h)
          </button>
        </div>
        </div>
      </div>
      ) : null}

      {showEditModules && moduleVisibility.candidates ? (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Candidates Import</h2>
          <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs font-semibold tracking-wide text-zinc-300">
            Candidates: {candidates.length}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <a href="/api/admin/all-star/candidates/template" className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5">Download Template</a>
          <input type="file" accept=".csv,.xlsx,.xls" disabled={manageDisabled} onChange={(e) => setCandidateFile(e.target.files?.[0] || null)} className="text-sm disabled:opacity-60" />
          <button type="button" disabled={manageDisabled || !selectedCycleId || !candidateFile} onClick={() => void importCandidates()} className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60">Import Candidates</button>
          <button
            type="button"
            disabled={manageDisabled || !selectedCycleId}
            onClick={() => void reimportCandidatesFromTeams()}
            className="rounded-lg border border-zinc-600 text-zinc-200 hover:bg-zinc-800 px-4 py-2 text-sm disabled:opacity-60"
          >
            Re-import from Teams
          </button>
          {selectedCycle &&
          requiresDyb12uAgeBandFilter(selectedCycle.organizationId, selectedCycle.ageGroup) ? (
            <select
              value={teamsReimportAgeBandFilter}
              onChange={(e) =>
                setTeamsReimportAgeBandFilter(e.target.value as "11U" | "12U" | "BOTH")
              }
              className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm min-w-[180px]"
            >
              <option value="BOTH">Re-import: 11U + 12U</option>
              <option value="11U">Re-import: 11U only</option>
              <option value="12U">Re-import: 12U only</option>
            </select>
          ) : null}
          <button type="button" disabled={manageDisabled || !selectedCycleId} onClick={() => setShowAddCandidateModal(true)} className="rounded-lg border border-zinc-600 text-zinc-200 hover:bg-zinc-800 px-4 py-2 text-sm disabled:opacity-60">Add Candidate</button>
        </div>
        <input
          value={candidateSearch}
          onChange={(e) => setCandidateSearch(e.target.value)}
          placeholder="Search candidates by name, team, jersey, or bib"
          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-zinc-400">
            Filters + bulk tools
          </p>
          <button
            type="button"
            onClick={() => setShowCandidateTools((prev) => !prev)}
            className="rounded-lg border border-zinc-700 text-zinc-200 px-3 py-1.5 text-xs hover:bg-zinc-800"
          >
            {showCandidateTools ? "Hide Candidate Tools" : "Show Candidate Tools"}
          </button>
        </div>
        {showCandidateTools ? (
          <>
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-2">
              <input
                value={candidateFilterName}
                onChange={(e) => setCandidateFilterName(e.target.value)}
                placeholder="Filter Name"
                className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs"
              />
              <input
                value={candidateFilterTeam}
                onChange={(e) => setCandidateFilterTeam(e.target.value)}
                placeholder="Filter Team"
                className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs"
              />
              <input
                value={candidateFilterJersey}
                onChange={(e) => setCandidateFilterJersey(e.target.value)}
                placeholder="Filter Jersey #"
                className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs"
              />
              <select
                value={candidateFilterJerseyPresence}
                onChange={(e) =>
                  setCandidateFilterJerseyPresence(
                    e.target.value as "ANY" | "HAS_VALUE" | "NO_VALUE",
                  )
                }
                className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs"
              >
                <option value="ANY">Jersey: Any</option>
                <option value="HAS_VALUE">Jersey: Has Value</option>
                <option value="NO_VALUE">Jersey: No Value</option>
              </select>
              <select
                value={candidateFilterBibPresence}
                onChange={(e) =>
                  setCandidateFilterBibPresence(
                    e.target.value as "ANY" | "HAS_VALUE" | "NO_VALUE",
                  )
                }
                className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs"
              >
                <option value="ANY">Bib: Any</option>
                <option value="HAS_VALUE">Bib: Has Value</option>
                <option value="NO_VALUE">Bib: No Value</option>
              </select>
              <select
                value={candidateFilterActive}
                onChange={(e) =>
                  setCandidateFilterActive(e.target.value as "ANY" | "ACTIVE" | "INACTIVE")
                }
                className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs"
              >
                <option value="ANY">Status: Any</option>
                <option value="ACTIVE">Status: Active</option>
                <option value="INACTIVE">Status: Inactive</option>
              </select>
              <select
                value={candidateFilterSecondPhase}
                onChange={(e) =>
                  setCandidateFilterSecondPhase(
                    e.target.value as "ANY" | "EXCLUDED" | "NOT_EXCLUDED",
                  )
                }
                className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-xs"
              >
                <option value="ANY">Second Phase: Any</option>
                <option value="EXCLUDED">Second Phase: Excluded</option>
                <option value="NOT_EXCLUDED">Second Phase: Included</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  setCandidateFilterName("");
                  setCandidateFilterTeam("");
                  setCandidateFilterJersey("");
                  setCandidateFilterJerseyPresence("ANY");
                  setCandidateFilterBibPresence("ANY");
                  setCandidateFilterActive("ANY");
                  setCandidateFilterSecondPhase("ANY");
                }}
                className="rounded-lg border border-zinc-700 text-zinc-300 px-3 py-2 text-xs hover:bg-zinc-800"
              >
                Clear Filters
              </button>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={manageDisabled || filteredCandidates.length === 0}
                  onClick={() =>
                    setSelectedCandidateIds((prev) =>
                      allFilteredSelected
                        ? prev.filter((id) => !filteredCandidates.some((candidate) => candidate.id === id))
                        : Array.from(new Set([...prev, ...filteredCandidates.map((candidate) => candidate.id)])),
                    )
                  }
                  className="rounded-lg border border-zinc-700 text-zinc-200 px-3 py-1.5 text-xs disabled:opacity-60"
                >
                  {allFilteredSelected ? "Unselect Filtered" : "Select Filtered"}
                </button>
                <span className="text-xs text-zinc-400">
                  Selected: {selectedCandidateIds.length} / Filtered: {filteredCandidates.length}
                </span>
                <button
                  type="button"
                  disabled={manageDisabled || !selectedCycleId}
                  onClick={() => void refreshCandidateBibNumbers()}
                  className="rounded-lg border border-amber-700 text-amber-200 px-3 py-1.5 text-xs disabled:opacity-60"
                >
                {busy && candidateBulkAction === "REFRESH_BIBS" ? "Refreshing Bib #..." : "Refresh Bib #"}
                </button>
              </div>
              <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-2">
                <input
                  value={candidateBulkDraft.team}
                  onChange={(e) =>
                    setCandidateBulkDraft((prev) => ({ ...prev, team: e.target.value }))
                  }
                  placeholder="Bulk set Team"
                  className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-xs"
                />
                <input
                  value={candidateBulkDraft.jerseyNumber}
                  onChange={(e) =>
                    setCandidateBulkDraft((prev) => ({ ...prev, jerseyNumber: e.target.value }))
                  }
                  placeholder="Bulk set Jersey #"
                  className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-xs"
                />
                <select
                  value={candidateBulkDraft.isActive}
                  onChange={(e) =>
                    setCandidateBulkDraft((prev) => ({
                      ...prev,
                      isActive: e.target.value as CandidateBulkUpdateDraft["isActive"],
                    }))
                  }
                  className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-xs"
                >
                  <option value="UNCHANGED">Active: Unchanged</option>
                  <option value="ACTIVE">Active: Yes</option>
                  <option value="INACTIVE">Active: No</option>
                </select>
                <select
                  value={candidateBulkDraft.excludedFromSecondPhase}
                  onChange={(e) =>
                    setCandidateBulkDraft((prev) => ({
                      ...prev,
                      excludedFromSecondPhase:
                        e.target.value as CandidateBulkUpdateDraft["excludedFromSecondPhase"],
                    }))
                  }
                  className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-xs"
                >
                  <option value="UNCHANGED">Second phase: Unchanged</option>
                  <option value="YES">Second phase: Excluded</option>
                  <option value="NO">Second phase: Included</option>
                </select>
                <input
                  value={candidateBulkDraft.secondPhaseOverrideReason}
                  onChange={(e) =>
                    setCandidateBulkDraft((prev) => ({
                      ...prev,
                      secondPhaseOverrideReason: e.target.value,
                    }))
                  }
                  placeholder="Bulk override reason"
                  className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-xs"
                />
              </div>
              <button
                type="button"
                disabled={manageDisabled || selectedCandidateIds.length === 0}
                onClick={() => void applyBulkCandidateUpdate()}
                className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-xs font-semibold disabled:opacity-60"
              >
                {busy && candidateBulkAction === "APPLY_UPDATE"
                  ? "Applying Bulk Update..."
                  : "Apply Bulk Update to Selected"}
              </button>
              <button
                type="button"
                disabled={manageDisabled || selectedCandidateIds.length === 0}
                onClick={() => void bulkRemoveCandidates()}
                className="rounded-lg border border-red-700 text-red-300 px-4 py-2 text-xs font-semibold disabled:opacity-60"
              >
                {busy && candidateBulkAction === "REMOVE_SELECTED"
                  ? "Removing Selected..."
                  : "Bulk Remove Selected"}
              </button>
              <button
                type="button"
                disabled={manageDisabled || filteredCandidates.length === 0}
                onClick={() => void bulkRemoveFilteredCandidates()}
                className="rounded-lg border border-red-700 text-red-300 px-4 py-2 text-xs font-semibold disabled:opacity-60"
              >
                {busy && candidateBulkAction === "REMOVE_FILTERED"
                  ? "Removing Filtered..."
                  : "Bulk Remove Filtered"}
              </button>
            </div>
          </>
        ) : null}
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
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={selectedCandidateIds.includes(candidate.id)}
                    onChange={() =>
                      setSelectedCandidateIds((prev) =>
                        prev.includes(candidate.id)
                          ? prev.filter((id) => id !== candidate.id)
                          : [...prev, candidate.id],
                      )
                    }
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-900"
                  />
                <p className="min-w-0">
                  <span className="font-medium">{candidate.playerFullName}</span> · {candidate.team}
                  {hasVisibleJerseyNumber(candidate.jerseyNumber)
                    ? ` · #${candidate.jerseyNumber}`
                    : ""}
                  {selectedCycle?.hasShowcase && candidate.showcaseBibNumber
                    ? ` · Bib ${candidate.showcaseBibNumber}`
                    : ""}
                  {candidate.isActive === false ? " · Inactive" : ""}
                  {candidate.excludedFromSecondPhase ? " · Excluded 2nd phase" : ""}
                </p>
                </div>
                <button
                  type="button"
                  disabled={manageDisabled}
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
      ) : null}

      {showEditModules && moduleVisibility.coaches ? (
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
          <button type="button" disabled={manageDisabled || !selectedCycleId || !selectedCoachUserId} onClick={() => void addHeadCoach()} className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60">Add Coach</button>
        </div>
        <div className="max-h-48 overflow-auto rounded-lg border border-zinc-800">
          {headCoaches.length === 0 ? <p className="text-zinc-500 text-sm p-3">No coaches assigned.</p> : headCoaches.map((coach) => (
            <div key={coach.id} className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 last:border-b-0">
              <p className="text-sm">{coach.coachName || coach.coachEmail || "Assigned coach"}</p>
              <button type="button" disabled={manageDisabled} onClick={() => void removeHeadCoach(coach.id)} className="text-xs rounded-lg border border-red-700 text-red-300 px-3 py-1.5 disabled:opacity-60">Remove</button>
            </div>
          ))}
        </div>
      </div>
      ) : null}

      {showEditModules && moduleVisibility.submitted ? (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <h2 className="text-lg font-semibold">Submitted Ballots</h2>
        <p className="text-xs text-zinc-400">
          {isLimitedVaultAccess
            ? "View who has submitted. Deleting a ballot is the only change available here — it lets that coach submit again. Other ballot setup requires full vault access."
            : "Review submitted ballots for the selected cycle. Deleting a ballot unlocks that coach to submit again."}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy || !selectedCycleId}
            onClick={() => void refreshSubmittedBallots()}
            className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 disabled:opacity-60"
          >
            Refresh
          </button>
          {selectedCycleId && ballotRosterStatus ? (
            <button
              type="button"
              disabled={busy}
              title={`Open list of who has submitted vs not yet (${ballotRosterStatus.rosterLabel})`}
              onClick={() => setShowBallotRosterStatusModal(true)}
              className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 disabled:opacity-60 inline-flex items-center gap-2 flex-wrap"
            >
              <span className="text-zinc-500">Submitted ballots</span>
              <span className="tabular-nums font-semibold text-zinc-100">
                {ballotRosterStatus.submittedCount}/{ballotRosterStatus.total}
              </span>
              <span className="text-zinc-500">· {ballotRosterStatus.rosterLabelShort}</span>
            </button>
          ) : null}
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
                    disabled={busy || !canDeleteSubmittedBallots}
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
      ) : null}

      {showEditModules && moduleVisibility.votes ? (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <h2 className="text-lg font-semibold">Votes Panel</h2>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <p className="text-xs text-zinc-400 flex-1 min-w-[200px]">
            {isLimitedVaultAccess
              ? "View standings and export results. Live refresh runs every 15 seconds while the cycle is open and published."
              : "Live candidate standings sorted by vote count, then average rating. Auto-refresh runs every 15 seconds while a cycle is open and published."}
          </p>
          <div className="flex flex-wrap items-center gap-2 justify-end shrink-0">
            <a
              href={
                selectedCycleId
                  ? `/api/admin/all-star/exports/votes-panel/csv?cycleId=${selectedCycleId}${isMasterMode ? `&org=${encodeURIComponent(org)}` : ""}`
                  : "#"
              }
              className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5"
            >
              Export CSV
            </a>
            <a
              href={
                selectedCycleId
                  ? `/api/admin/all-star/exports/votes-panel/pdf?cycleId=${selectedCycleId}&layout=name${isMasterMode ? `&org=${encodeURIComponent(org)}` : ""}`
                  : "#"
              }
              className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5"
            >
              PDF (name only)
            </a>
            <a
              href={
                selectedCycleId
                  ? `/api/admin/all-star/exports/votes-panel/pdf?cycleId=${selectedCycleId}&layout=full${isMasterMode ? `&org=${encodeURIComponent(org)}` : ""}`
                  : "#"
              }
              className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5"
            >
              PDF (full)
            </a>
            <a
              href={
                selectedCycleId
                  ? `/api/admin/all-star/exports/showcase-scorecard/pdf?cycleId=${selectedCycleId}${isMasterMode ? `&org=${encodeURIComponent(org)}` : ""}`
                  : "#"
              }
              className="text-xs rounded-lg border border-amber-700 text-amber-200 hover:bg-amber-950/30 px-3 py-1.5"
            >
              Showcase Score Card (fillable PDF)
            </a>
            <button
              type="button"
              disabled={busy || !selectedCycleId || !canRefreshVoteSummary}
              onClick={() => void refreshVoteSummary()}
              className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 disabled:opacity-60"
            >
              Refresh
            </button>
          </div>
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
      ) : null}

      {showEditModules && moduleVisibility.sample ? (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-3">
        <h2 className="text-lg font-semibold">Sample Ballot</h2>
        <p className="text-xs text-zinc-400">
          Read-only preview of ballot layout using current cycle candidates.
        </p>
        <div className="max-h-64 overflow-auto rounded-lg border border-zinc-800">
          {!selectedCycleId ? (
            <p className="text-zinc-500 text-sm p-3">Select a cycle to preview the sample ballot.</p>
          ) : sampleBallotCandidates.length === 0 ? (
            <p className="text-zinc-500 text-sm p-3">No candidates available for sample ballot.</p>
          ) : (
            sampleBallotCandidates.map((candidate) => (
              <div
                key={candidate.id}
                className="px-3 py-2 border-b border-zinc-800 last:border-b-0 flex items-center justify-between gap-3"
              >
                <p className="text-sm min-w-0 truncate">
                  <span className="font-medium">{candidate.playerFullName}</span> · {candidate.team}
                  {hasVisibleJerseyNumber(candidate.jerseyNumber)
                    ? ` · #${candidate.jerseyNumber}`
                    : ""}
                  {selectedCycle?.hasShowcase && candidate.showcaseBibNumber
                    ? ` · Bib ${candidate.showcaseBibNumber}`
                    : ""}
                </p>
                <div className="flex items-center gap-1 text-zinc-500">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <span key={value} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 bg-zinc-950/50 p-0.5 opacity-70">
                      <BaseballRatingIcon className="h-5 w-5" />
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      ) : null}

      {showEditModules && moduleVisibility.access ? (
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
            <select value={vaultRole} onChange={(e) => setVaultRole(e.target.value as "FULL_ACCESS" | "LIMITED_ADMIN")} className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm">
              <option value="LIMITED_ADMIN">Limited Admin</option>
              <option value="FULL_ACCESS">Full Access</option>
            </select>
            <button type="button" disabled={manageDisabled || !vaultUserId} onClick={() => void grantVaultAccess()} className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60">Grant Access</button>
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
                    disabled={manageDisabled || busy || vaultAccessRoleBusyId === access.registeredUser.id}
                    onChange={(e) =>
                      void saveVaultAccessRole(
                        access.registeredUser.id,
                        e.target.value as "FULL_ACCESS" | "LIMITED_ADMIN",
                      )
                    }
                    className="rounded-lg bg-zinc-950 border border-zinc-700 px-2 py-1.5 text-xs disabled:opacity-60"
                  >
                    <option value="LIMITED_ADMIN">Limited Admin</option>
                    <option value="FULL_ACCESS">Full Access</option>
                  </select>
                ) : (
                  <span className="text-xs text-zinc-400">
                    {access.role === "FULL_ACCESS" ? "Full Access" : "Limited Admin"}
                  </span>
                )}
                <button
                  type="button"
                  disabled={manageDisabled || busy || access.isImplicit === true}
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
      ) : null}

      {showEditModules && moduleVisibility.invites ? (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <h2 className="text-lg font-semibold">
          {isLimitedVaultAccess ? "Ballot link & invite roster" : "Invites And Exports"}
        </h2>
        <div className="rounded-lg border border-zinc-700 bg-zinc-950/40 p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-200">Shared ballot link</p>
              <p className="text-xs text-zinc-400 mt-1">
                One URL per ballot. Coaches open it, sign in (same email as their roster entry), then vote.
                Age-group ballots use the same link once generated — keep your coach roster current below.
              </p>
            </div>
            {isLimitedVaultAccess ? (
              <p className="text-[11px] text-zinc-500 shrink-0 max-w-xs text-right">
                Generating or refreshing the link requires full vault access.
              </p>
            ) : (
              <button
                type="button"
                disabled={manageDisabled || !selectedCycleId}
                onClick={() => void generateSharedBallotLink()}
                className="text-xs rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-3 py-2 font-semibold disabled:opacity-60 shrink-0"
              >
                Generate / refresh link
              </button>
            )}
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
              {isLimitedVaultAccess
                ? "No shared URL is available yet. Ask a full vault admin to generate the ballot link."
                : "Generate a link to create the shared voting URL. Refreshing creates a new URL and invalidates the previous one."}
            </p>
          )}
        </div>
        {isInviteListCycle ? (
          isLimitedVaultAccess ? (
            <div className="space-y-2">
              <p className="text-xs text-zinc-400">
                Invite-list cycle: roster changes require full vault access. Below is the coach directory for this age
                group (read-only).
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
                    return (
                      <div
                        key={coach.id}
                        className="px-3 py-2 text-sm text-zinc-300 border-b border-zinc-800 last:border-b-0"
                      >
                        <span className="min-w-0 truncate">
                          {label}{" "}
                          <span className="text-zinc-500">
                            ({coach.email}) · {roleLabel}
                          </span>
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
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
                          disabled={manageDisabled}
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
          )
        ) : null}
        {!isLimitedVaultAccess ? (
          <textarea
            value={inviteEmails}
            onChange={(e) => setInviteEmails(e.target.value)}
            readOnly={manageDisabled}
            placeholder={
              isInviteListCycle
                ? "Optional extra emails: coach1@email.com, coach2@email.com"
                : "Optional extra emails (coaches auto-filled from cycle when left blank)"
            }
            rows={3}
            className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm read-only:opacity-60"
          />
        ) : null}
        <div className="flex flex-wrap gap-3">
          {!isLimitedVaultAccess ? (
            <button
              type="button"
              disabled={manageDisabled || !selectedCycleId}
              onClick={() => void createInvites()}
              className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              Save invite roster
            </button>
          ) : null}
          <a
            href={selectedCycleId ? `/api/admin/all-star/exports/csv?cycleId=${selectedCycleId}` : "#"}
            className="rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-4 py-2 text-sm"
          >
            Export CSV
          </a>
          <a
            href={selectedCycleId ? `/api/admin/all-star/exports/pdf?cycleId=${selectedCycleId}` : "#"}
            className="rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-4 py-2 text-sm"
          >
            Export PDF
          </a>
          <a
            href={
              selectedCycleId
                ? `/api/admin/all-star/exports/showcase-scorecard/pdf?cycleId=${selectedCycleId}`
                : "#"
            }
            className="rounded-lg border border-amber-700 text-amber-200 hover:bg-amber-950/30 px-4 py-2 text-sm"
          >
            Showcase Score Card (fillable PDF)
          </a>
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
                    {!isLimitedVaultAccess ? (
                      <div className="flex flex-wrap gap-2 shrink-0">
                        {invite.revokedAt ? (
                          <button
                            type="button"
                            disabled={manageDisabled || busy || rowBusy}
                            onClick={() => void reenableInviteRow(invite.inviteId)}
                            className="text-xs rounded-lg border border-emerald-800 text-emerald-200 hover:bg-emerald-950/40 px-3 py-1.5 disabled:opacity-60"
                          >
                            {rowBusy ? "…" : "Re-enable"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={manageDisabled || busy || rowBusy}
                            onClick={() => void revokeInviteRow(invite.inviteId)}
                            className="text-xs rounded-lg border border-red-800 text-red-200 hover:bg-red-950/30 px-3 py-1.5 disabled:opacity-60"
                          >
                            {rowBusy ? "…" : "Remove from roster"}
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      ) : null}
      </>
      ) : null}

      {pendingBulkDelete ? (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 p-5 space-y-4">
            <div>
              <h3 className="text-base font-semibold">Confirm Bulk Candidate Removal</h3>
              <p className="text-xs text-zinc-400 mt-1">
                This will remove {pendingBulkDelete.ids.length}{" "}
                {pendingBulkDelete.mode === "FILTERED" ? "filtered" : "selected"} candidate(s) and re-number bibs.
              </p>
            </div>
            {pendingBulkDelete.ids.length >= 10 ? (
              <div className="space-y-2">
                <p className="text-xs text-amber-300">
                  Safety check required: type <span className="font-semibold">DELETE</span> to continue.
                </p>
                <input
                  value={bulkDeleteConfirmText}
                  onChange={(e) => setBulkDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE"
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                />
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setPendingBulkDelete(null);
                  setBulkDeleteConfirmText("");
                  setNotice(
                    pendingBulkDelete.mode === "FILTERED"
                      ? "Bulk remove filtered cancelled."
                      : "Bulk remove cancelled.",
                  );
                }}
                className="rounded-lg border border-zinc-700 text-zinc-300 px-4 py-2 text-sm disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || (pendingBulkDelete.ids.length >= 10 && bulkDeleteConfirmText !== "DELETE")}
                onClick={() => void confirmBulkDeleteFromModal()}
                className="rounded-lg border border-red-700 text-red-300 px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                {busy ? "Removing..." : "Confirm Remove"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showBallotRosterStatusModal && ballotRosterStatus ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ballot-roster-status-title"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowBallotRosterStatusModal(false);
          }}
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-zinc-700 bg-zinc-900 p-5 space-y-4 max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="ballot-roster-status-title" className="text-lg font-semibold">
                  Submitted ballot status
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  {ballotRosterStatus.submittedCount} of {ballotRosterStatus.total} on{" "}
                  <span className="text-zinc-300">{ballotRosterStatus.rosterLabel}</span> have submitted.
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-lg border border-zinc-600 text-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-800"
                onClick={() => setShowBallotRosterStatusModal(false)}
              >
                Close
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-4 min-h-0 flex-1 overflow-hidden">
              <div className="flex flex-col min-h-0 rounded-lg border border-zinc-800 bg-zinc-950/40">
                <p className="text-sm font-medium text-emerald-400 px-3 py-2 border-b border-zinc-800 shrink-0">
                  Submitted ({ballotRosterStatus.submitted.length})
                </p>
                <ul className="overflow-y-auto p-3 space-y-2 text-sm max-h-64 md:max-h-72">
                  {ballotRosterStatus.submitted.length === 0 ? (
                    <li className="text-zinc-500">No roster coaches have submitted yet.</li>
                  ) : (
                    [...ballotRosterStatus.submitted]
                      .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }))
                      .map((row) => (
                        <li key={row.key} className="border-b border-zinc-800/80 pb-2 last:border-b-0 last:pb-0">
                          <span className="font-medium text-zinc-100">{row.displayName}</span>
                          <span className="block text-xs text-zinc-500 truncate">{row.email}</span>
                        </li>
                      ))
                  )}
                </ul>
              </div>
              <div className="flex flex-col min-h-0 rounded-lg border border-zinc-800 bg-zinc-950/40">
                <p className="text-sm font-medium text-amber-300 px-3 py-2 border-b border-zinc-800 shrink-0">
                  Not submitted yet ({ballotRosterStatus.pending.length})
                </p>
                <ul className="overflow-y-auto p-3 space-y-2 text-sm max-h-64 md:max-h-72">
                  {ballotRosterStatus.pending.length === 0 ? (
                    <li className="text-zinc-500">Everyone on the roster has submitted.</li>
                  ) : (
                    [...ballotRosterStatus.pending]
                      .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }))
                      .map((row) => (
                        <li key={row.key} className="border-b border-zinc-800/80 pb-2 last:border-b-0 last:pb-0">
                          <span className="font-medium text-zinc-100">{row.displayName}</span>
                          <span className="block text-xs text-zinc-500 truncate">{row.email}</span>
                        </li>
                      ))
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
                  manageDisabled ||
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
      </>
      ) : null}
    </section>
  );
}
