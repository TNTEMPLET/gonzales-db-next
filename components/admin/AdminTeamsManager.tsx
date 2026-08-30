"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import BulkEmailToolbar from "@/components/admin/communications/BulkEmailToolbar";
import SendEmailModal from "@/components/admin/communications/SendEmailModal";
import { useRowSelection } from "@/components/admin/communications/useRowSelection";
import {
  StatusCountPill,
  TeamHealthSummaryGrid,
  TeamsWorkflowNavigation,
  WorkflowStepRow,
  type TeamWorkflowSectionId,
} from "./teams/TeamsWorkflowHelpers";
import {
  SportsConnectDetectionBanner,
  SportsConnectPresetBar,
  SportsConnectQualityPanel,
  SyncedDriveFileMenu,
} from "./teams/SportsConnectAssistPanels";
import OnlineDraftDesk from "@/components/admin/draft/OnlineDraftDesk";
import PlayerCardDemoPreview from "@/components/players/PlayerCardDemoPreview";
import PlayerCardPanel, {
  playerCardFromFields,
} from "@/components/players/PlayerCardPanel";
import {
  getPlayerProfileCompleteness,
  isMissingGuardianEmail,
} from "@/lib/players/completeness";
import { buildPlayerChecks } from "@/lib/players/readiness";
import {
  COACH_IMPORT_STEPS,
  PLAYER_IMPORT_DIVISION_KEYS,
  PLAYER_IMPORT_EMAIL_KEYS,
  PLAYER_IMPORT_NAME_KEYS,
  PLAYER_IMPORT_STEPS,
  PLAYER_IMPORT_TEAM_KEYS,
  TEAM_LIST_IMPORT_STEPS,
  buildTeamNameFromSponsor,
  getImportHistoryActor,
  getImportHistoryUndoText,
  getImportHistoryWhat,
  getImportProgressPercent,
  getImportRowValue,
  getTeamListSampleCsv,
  getTeamsManagementAgeGroupDefaults,
  mergeTeamsManagementAgeGroupOptions,
  normalizeLooseName,
  shouldSkipDivisionImport,
  sortTeamsManagementAgeGroups,
  toCsvSafeValue,
} from "@/lib/admin/teamsImportHelpers";
import type { ContentOrgId } from "@/lib/siteConfig";
import type {
  ColumnDetectResult,
  RosterQualitySummary,
  SportsConnectImportRunView,
  SportsConnectMappingPresetView,
  SportsConnectReportKind,
} from "@/lib/sportsConnect/types";

type Team = {
  id: string;
  organizationId: ContentOrgId;
  seasonYear: number;
  ageGroup: string;
  teamName: string;
  contactNotes: string | null;
  practicePlan: string | null;
  _count?: {
    players: number;
    coachAssignments: number;
  };
};

type TeamPlayer = {
  id: string;
  teamId: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  contactPhone: string | null;
  gender: string | null;
  birthDate: string | null;
  guardianFirstName: string | null;
  guardianLastName: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  paymentStatus: string | null;
  birthCertificateStatus: string | null;
  registrationOrderNo: string | null;
  registrationOrderDate: string | null;
  jerseySize: string | null;
  medicalConditionsSummary: string | null;
  medicalConditionsDetails: string | null;
  medicalTreatmentAuthorized: boolean | null;
  liabilityWaiverAccepted: boolean | null;
  codeOfConductAccepted: boolean | null;
  refundPolicyAccepted: boolean | null;
  playedPriorSeason: boolean | null;
  priorSeasonTeamInfo: string | null;
  streetAddress: string | null;
  unit: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  rosterStatus: string | null;
  jerseyNumber: string | null;
  allStarAgeBand: string | null;
};

type TeamCoachAssignment = {
  id: string;
  role: "HEAD_COACH" | "ASSISTANT_COACH";
  registeredUser: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    name: string | null;
    contactPhone: string | null;
  };
};

type CoachOption = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  ageGroup: string | null;
  assignedTeam: string | null;
  contactPhone: string | null;
};

type DivisionMapping = Record<string, string>;
type CoachAgeGroupMapping = Record<string, string>;
type TeamMapping = Record<string, string>;

type ImportPreviewRow = {
  divisionName: string;
  teamName: string;
  playerName: string;
  userEmail: string;
};
type ImportJobStatus = {
  id: string;
  status: string;
  totalRows: number;
  processedRows: number;
  createdTeams: number;
  createdPlayers: number;
  updatedPlayers: number;
  skippedRows: number;
};
type ImportHistoryItem = ImportJobStatus & {
  createdAt: string;
  completedAt: string | null;
  undoneAt: string | null;
  createdByName?: string | null;
  createdByEmail?: string | null;
  createdBy?: {
    name?: string | null;
    email?: string | null;
  } | null;
  organizationId?: string | null;
  importType?: string | null;
};
type ImportSkippedRowDetail = {
  rowNumber: number | null;
  reason: string;
  playerName?: string;
  ageGroup?: string;
  teamName?: string;
};
type CoachImportUndoData = {
  importBatchId?: string;
};
type TeamListImportAction = "CREATE" | "UPDATE" | "SKIP";
type TeamListImportRow = {
  rowNumber: number;
  ageGroup: string;
  teamName: string;
  sponsor: string | null;
  headCoachLastName: string | null;
  action: TeamListImportAction;
  errors: string[];
  warnings: string[];
  existingTeamId: string | null;
};
type TeamListImportSummary = {
  total: number;
  create: number;
  update: number;
  skip: number;
  errors: number;
  warnings: number;
  affected?: number;
};
type TeamListImportResult = {
  rows: TeamListImportRow[];
  summary: TeamListImportSummary;
  affectedTeams?: Team[];
};
type TeamListImportStep = "upload" | "preview" | "results";
type UndoImportStatus = {
  status: "RUNNING" | "DONE";
  progress: number;
  message: string;
};

export default function AdminTeamsManager({
  targetOrg,
  isMaster = false,
  onGoToImport,
}: {
  targetOrg: ContentOrgId;
  isMaster?: boolean;
  onGoToImport?: () => void;
}) {
  const orgQuery = `org=${targetOrg}`;
  const isFallBall = targetOrg === "fallball";
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selectedGuardians = useRowSelection<string>();
  const [emailModalOpen, setEmailModalOpen] = useState(false);

  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [ageGroup, setAgeGroup] = useState("");
  const [sponsorName, setSponsorName] = useState("");
  const [headCoachLastName, setHeadCoachLastName] = useState("");
  const [setupAgeGroupOptions, setSetupAgeGroupOptions] = useState<string[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [teamFilterSeasonYear, setTeamFilterSeasonYear] = useState("");
  const [teamFilterAgeGroup, setTeamFilterAgeGroup] = useState("");

  const [teamContactNotes, setTeamContactNotes] = useState("");
  const [teamPracticePlan, setTeamPracticePlan] = useState("");

  const [players, setPlayers] = useState<TeamPlayer[]>([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerPhone, setNewPlayerPhone] = useState("");

  const [assignments, setAssignments] = useState<TeamCoachAssignment[]>([]);
  const [coachOptions, setCoachOptions] = useState<CoachOption[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState("");
  const [selectedCoachRole, setSelectedCoachRole] = useState<"HEAD_COACH" | "ASSISTANT_COACH">(
    "ASSISTANT_COACH",
  );

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreparing, setImportPreparing] = useState(false);

  // "Use Synced Drive File" — shared across the Player/Coach/Team List import
  // modals below. Keyed by reportKind since each modal only ever needs its
  // own report's runs; fetching/downloading stays here (the panel component
  // is presentation-only), mirroring how presets/quality data flow into
  // SportsConnectAssistPanels elsewhere in this file.
  const [syncedDriveRuns, setSyncedDriveRuns] = useState<
    Record<SportsConnectReportKind, SportsConnectImportRunView[]>
  >({ PLAYER_REG: [], COACH_VOLUNTEER: [], TEAM_LIST: [] });
  const [syncedDriveLoading, setSyncedDriveLoading] = useState<
    Record<SportsConnectReportKind, boolean>
  >({ PLAYER_REG: false, COACH_VOLUNTEER: false, TEAM_LIST: false });
  const [syncedDriveError, setSyncedDriveError] = useState<
    Record<SportsConnectReportKind, string>
  >({ PLAYER_REG: "", COACH_VOLUNTEER: "", TEAM_LIST: "" });
  const [syncedDriveFetchingId, setSyncedDriveFetchingId] = useState<string | null>(null);
  const [showImportMappingModal, setShowImportMappingModal] = useState(false);
  const [showPlayersImportModal, setShowPlayersImportModal] = useState(false);
  const [showCoachImportModal, setShowCoachImportModal] = useState(false);
  const [showCoachImportMappingModal, setShowCoachImportMappingModal] = useState(false);
  const [showTeamListImportModal, setShowTeamListImportModal] = useState(false);
  const [teamListImportStep, setTeamListImportStep] = useState<TeamListImportStep>("upload");
  const [teamListCsvText, setTeamListCsvText] = useState("");
  const [teamListImportBusy, setTeamListImportBusy] = useState(false);
  const [teamListImportError, setTeamListImportError] = useState("");
  const [teamListImportResult, setTeamListImportResult] = useState<TeamListImportResult | null>(null);
  const [importedDivisions, setImportedDivisions] = useState<string[]>([]);
  const [scheduleAgeGroupOptions, setScheduleAgeGroupOptions] = useState<string[]>([]);
  const [divisionMapping, setDivisionMapping] = useState<DivisionMapping>({});
  const [teamMapping, setTeamMapping] = useState<TeamMapping>({});
  const [mappingError, setMappingError] = useState("");
  const [confirmedImportAgeGroup, setConfirmedImportAgeGroup] = useState("");
  const [confirmedImportTeamName, setConfirmedImportTeamName] = useState("");
  const [importUpdateExistingOnly, setImportUpdateExistingOnly] = useState(false);
  const [allStarCutoffDate, setAllStarCutoffDate] = useState("");
  const allAgesSelected = confirmedImportAgeGroup === "__ALL_AGE_GROUPS__";
  const [importPreviewRows, setImportPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [importStatus, setImportStatus] = useState<ImportJobStatus | null>(null);
  const [activeImportBatchId, setActiveImportBatchId] = useState<string | null>(null);
  const [importRows, setImportRows] = useState<Record<string, unknown>[]>([]);
  const [importSkippedDetails, setImportSkippedDetails] = useState<ImportSkippedRowDetail[]>([]);
  const [importPreviewSkippedDivisionDetails, setImportPreviewSkippedDivisionDetails] = useState<ImportSkippedRowDetail[]>([]);
  const [stopImportRequested, setStopImportRequested] = useState(false);
  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>([]);
  const [pendingUndoImport, setPendingUndoImport] = useState<ImportHistoryItem | null>(null);
  const [undoConfirmText, setUndoConfirmText] = useState("");
  const [activeTeamsSection, setActiveTeamsSection] = useState<TeamWorkflowSectionId>("teams-build");

  // Deep-link from Enrollment & KPIs' Rosters tab: ?division=<ageGroup> jumps
  // straight to the roster table pre-filtered to that division, instead of
  // landing on the generic Teams Setup section.
  useEffect(() => {
    const division = searchParams.get("division");
    if (!division) return;
    setTeamFilterAgeGroup(division);
    setActiveTeamsSection("teams-review-rosters");
    const el = document.getElementById("teams-review-rosters");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [searchParams]);
  const [undoImportStatus, setUndoImportStatus] = useState<UndoImportStatus | null>(null);
  const undoProgressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [coachImportFile, setCoachImportFile] = useState<File | null>(null);
  const [coachImportPreparing, setCoachImportPreparing] = useState(false);
  const [coachImportBusy, setCoachImportBusy] = useState(false);
  const [coachImportNotice, setCoachImportNotice] = useState("");
  const [coachImportError, setCoachImportError] = useState("");
  const [coachImportBatchId, setCoachImportBatchId] = useState<string | null>(null);
  const [coachImportProcessedCount, setCoachImportProcessedCount] = useState(0);
  const [coachImportTotalCount, setCoachImportTotalCount] = useState(0);
  const [coachImportedAgeGroups, setCoachImportedAgeGroups] = useState<string[]>([]);
  const [coachAgeGroupMapping, setCoachAgeGroupMapping] = useState<CoachAgeGroupMapping>({});
  const [coachMappingError, setCoachMappingError] = useState("");
  const [autoAssignImportedCoaches, setAutoAssignImportedCoaches] = useState(true);
  const [coachImportUndoData, setCoachImportUndoData] = useState<CoachImportUndoData | null>(
    null,
  );
  const [isEditingTeamProfile, setIsEditingTeamProfile] = useState(false);
  const [isEditingRoster, setIsEditingRoster] = useState(false);
  const [activeProfilePlayerId, setActiveProfilePlayerId] = useState<string | null>(null);
  const [activeProfileSummaryPlayerId, setActiveProfileSummaryPlayerId] = useState<string | null>(null);
  const [editingCoachRoleId, setEditingCoachRoleId] = useState<string | null>(null);
  const [showCoachAssignmentsModal, setShowCoachAssignmentsModal] = useState(false);

  const [scQuality, setScQuality] = useState<RosterQualitySummary | null>(null);
  const [scQualityLoading, setScQualityLoading] = useState(false);
  const [scQualityError, setScQualityError] = useState("");
  const [scPresets, setScPresets] = useState<SportsConnectMappingPresetView[]>([]);
  const [scSelectedPresetId, setScSelectedPresetId] = useState("");
  const [scPresetName, setScPresetName] = useState("Default");
  const [scPresetBusy, setScPresetBusy] = useState(false);
  const [scPresetNotice, setScPresetNotice] = useState("");
  const [scPresetError, setScPresetError] = useState("");
  const [scDetection, setScDetection] = useState<ColumnDetectResult | null>(null);

  const baseAgeGroupOptions = useMemo(
    () => getTeamsManagementAgeGroupDefaults(targetOrg),
    [targetOrg],
  );
  const existingTeamAgeGroupOptions = useMemo(
    () =>
      Array.from(
        new Set(
          teams
            .map((team) => team.ageGroup.trim())
            .filter((value) => value.length > 0),
        ),
      ),
    [teams],
  );
  const teamManagementAgeGroupOptions = useMemo(
    () => mergeTeamsManagementAgeGroupOptions(baseAgeGroupOptions, existingTeamAgeGroupOptions),
    [baseAgeGroupOptions, existingTeamAgeGroupOptions],
  );
  const teamListSampleCsv = useMemo(() => getTeamListSampleCsv(targetOrg), [targetOrg]);
  const teamListImportStepIndex =
    teamListImportStep === "upload" ? 0 : teamListImportStep === "preview" ? 1 : 3;
  const teamListImportHasErrors = (teamListImportResult?.summary.errors || 0) > 0;

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) || null,
    [teams, selectedTeamId],
  );
  const activeProfilePlayer = useMemo(
    () => players.find((player) => player.id === activeProfilePlayerId) || null,
    [players, activeProfilePlayerId],
  );
  const activeProfileSummaryPlayer = useMemo(
    () => players.find((player) => player.id === activeProfileSummaryPlayerId) || null,
    [players, activeProfileSummaryPlayerId],
  );
  const teamFilterSeasonOptions = useMemo(
    () =>
      Array.from(new Set(teams.map((team) => team.seasonYear))).sort((a, b) => b - a),
    [teams],
  );
  const teamsForSelectedSeason = useMemo(() => {
    if (!teamFilterSeasonYear) return teams;
    const season = Number(teamFilterSeasonYear);
    return teams.filter((team) => team.seasonYear === season);
  }, [teams, teamFilterSeasonYear]);
  const teamFilterAgeGroupOptions = useMemo(
    () =>
      mergeTeamsManagementAgeGroupOptions(
        baseAgeGroupOptions,
        teamsForSelectedSeason.map((team) => team.ageGroup),
      ),
    [baseAgeGroupOptions, teamsForSelectedSeason],
  );

  function downloadSkippedRowsCsv() {
    if (importSkippedDetails.length === 0) return;
    const header = ["Row Number", "Reason", "Player Name", "Age Group", "Team Name"];
    const lines = [header.join(",")];
    for (const item of importSkippedDetails) {
      lines.push(
        [
          item.rowNumber ? String(item.rowNumber) : "",
          item.reason || "",
          item.playerName || "",
          item.ageGroup || "",
          item.teamName || "",
        ]
          .map((value) => toCsvSafeValue(String(value)))
          .join(","),
      );
    }
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `skipped-player-import-rows-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
  const filteredTeamOptions = useMemo(() => {
    if (!teamFilterAgeGroup) return teamsForSelectedSeason;
    return teamsForSelectedSeason.filter((team) => team.ageGroup === teamFilterAgeGroup);
  }, [teamsForSelectedSeason, teamFilterAgeGroup]);
  const existingImportTeamsForAgeGroup = useMemo(() => {
    if (!confirmedImportAgeGroup) return [] as string[];
    if (allAgesSelected) {
      return teams
        .filter((team) => team.seasonYear === seasonYear)
        .map((team) => team.teamName)
        .sort((a, b) => a.localeCompare(b));
    }
    return teams
      .filter(
        (team) =>
          team.seasonYear === seasonYear &&
          team.ageGroup.trim().toLowerCase() === confirmedImportAgeGroup.trim().toLowerCase(),
      )
      .map((team) => team.teamName)
      .sort((a, b) => a.localeCompare(b));
  }, [allAgesSelected, confirmedImportAgeGroup, seasonYear, teams]);
  const importedTeamNamesForConfirmedAgeGroup = useMemo(() => {
    if (!confirmedImportAgeGroup) return [] as string[];
    const names = new Set<string>();
    for (const row of importRows) {
      const rawDivision = getImportRowValue(row, PLAYER_IMPORT_DIVISION_KEYS);
      const mappedAgeGroup = divisionMapping[rawDivision] || rawDivision;
      if (
        !allAgesSelected &&
        mappedAgeGroup.trim().toLowerCase() !==
        confirmedImportAgeGroup.trim().toLowerCase()
      ) {
        continue;
      }
      const teamName = getImportRowValue(row, PLAYER_IMPORT_TEAM_KEYS);
      if (teamName) names.add(teamName);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [allAgesSelected, confirmedImportAgeGroup, divisionMapping, importRows]);
  const unmatchedImportedTeamsForConfirmedAgeGroup = useMemo(() => {
    const existing = new Set(existingImportTeamsForAgeGroup.map((team) => normalizeLooseName(team)));
    return importedTeamNamesForConfirmedAgeGroup.filter(
      (team) => !existing.has(normalizeLooseName(team)),
    );
  }, [existingImportTeamsForAgeGroup, importedTeamNamesForConfirmedAgeGroup]);
  const importConfirmedTeamNameOptions = existingImportTeamsForAgeGroup;
  const importConfirmationCounts = useMemo(() => {
    if (!confirmedImportAgeGroup || !confirmedImportTeamName) {
      return {
        total: importRows.length,
        matching: 0,
        outOfScope: importRows.length,
        matchingMissingGuardianEmail: 0,
      };
    }
    let matching = 0;
    let outOfScope = 0;
    let matchingMissingGuardianEmail = 0;
    for (const row of importRows) {
      const rawDivision = getImportRowValue(row, PLAYER_IMPORT_DIVISION_KEYS);
      const mappedAgeGroup = divisionMapping[rawDivision] || rawDivision;
      const teamName = getImportRowValue(row, PLAYER_IMPORT_TEAM_KEYS);
      const mappedTeamName = teamMapping[teamName] || teamName;
      const allTeamsSelected = confirmedImportTeamName === "__ALL__";
      const ageMatches = allAgesSelected
        ? true
        : mappedAgeGroup.trim().toLowerCase() ===
          confirmedImportAgeGroup.trim().toLowerCase();
      const isMatch =
        ageMatches &&
        (allTeamsSelected ||
          mappedTeamName.trim().toLowerCase() === confirmedImportTeamName.trim().toLowerCase());
      if (isMatch) {
        matching += 1;
        const userEmail = getImportRowValue(row, PLAYER_IMPORT_EMAIL_KEYS);
        if (isMissingGuardianEmail({ guardianEmail: userEmail || null })) {
          matchingMissingGuardianEmail += 1;
        }
      } else {
        outOfScope += 1;
      }
    }
    return {
      total: importRows.length,
      matching,
      outOfScope,
      matchingMissingGuardianEmail,
    };
  }, [
    confirmedImportAgeGroup,
    confirmedImportTeamName,
    allAgesSelected,
    divisionMapping,
    importRows,
    teamMapping,
  ]);

  const teamHealthSummary = useMemo(() => {
    let totalRosteredPlayers = 0;
    let teamsMissingCoaches = 0;
    let teamsWithNoPlayers = 0;

    for (const team of teams) {
      const playerCount =
        team.id === selectedTeamId ? players.length : team._count?.players ?? 0;
      const coachCount =
        team.id === selectedTeamId ? assignments.length : team._count?.coachAssignments ?? 0;

      totalRosteredPlayers += playerCount;
      if (playerCount === 0) teamsWithNoPlayers += 1;
      if (coachCount === 0) teamsMissingCoaches += 1;
    }

    const recentImport = importStatus || importHistory[0] || null;

    return {
      totalTeams: teams.length,
      totalRosteredPlayers,
      teamsMissingCoaches,
      teamsWithNoPlayers,
      recentImportLabel: recentImport
        ? `${recentImport.status}: ${recentImport.processedRows}/${recentImport.totalRows} rows, ${recentImport.createdPlayers} created, ${recentImport.updatedPlayers} updated, ${recentImport.skippedRows} skipped`
        : "No recent imports",
    };
  }, [assignments.length, importHistory, importStatus, players.length, selectedTeamId, teams]);

  function handleWorkflowNavigation(sectionId: TeamWorkflowSectionId) {
    setActiveTeamsSection(sectionId);
    if (sectionId === "teams-import-players") {
      setShowPlayersImportModal(true);
      return;
    }
    if (sectionId === "teams-assign-coaches" && selectedTeamId) {
      setShowCoachAssignmentsModal(true);
    }
    window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  }

  useEffect(() => {
    void loadTeams();
    void loadCoachOptions(selectedTeamId || undefined);
    void loadImportHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetOrg, selectedTeamId]);

  useEffect(() => {
    void loadSportsConnectQuality();
    void loadSportsConnectPresets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetOrg, seasonYear]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSetupAgeGroupOptions(teamManagementAgeGroupOptions);
      setAgeGroup((current) =>
        current && teamManagementAgeGroupOptions.includes(current)
          ? current
          : teamManagementAgeGroupOptions[0] || "",
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [teamManagementAgeGroupOptions]);

  useEffect(() => {
    selectedGuardians.clear();
    const timer = window.setTimeout(() => {
      if (!selectedTeamId) {
        setPlayers([]);
        setAssignments([]);
        setTeamContactNotes("");
        setTeamPracticePlan("");
        return;
      }
      void loadTeamDetails(selectedTeamId);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamId]);

  useEffect(() => {
    if (teamFilterSeasonYear || teamFilterSeasonOptions.length === 0) return;
    const timer = window.setTimeout(() => {
      setTeamFilterSeasonYear(String(teamFilterSeasonOptions[0]));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [teamFilterSeasonYear, teamFilterSeasonOptions]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSelectedTeamId((current) =>
        current && filteredTeamOptions.some((team) => team.id === current)
          ? current
          : filteredTeamOptions[0]?.id || "",
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [filteredTeamOptions]);

  useEffect(() => {
    if (!activeImportBatchId || !busy) return;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const response = await fetch(
            `/api/admin/teams/import?${orgQuery}&batchId=${activeImportBatchId}`,
            { cache: "no-store" },
          );
          const json = await safeJson(response);
          if (!response.ok) return;
          if (json.data && typeof json.data === "object") {
            setImportStatus(json.data as ImportJobStatus);
          }
        } catch {
          // Ignore transient polling errors during live import updates.
        }
      })();
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeImportBatchId, busy, orgQuery]);

  async function safeJson(response: Response) {
    const text = await response.text();
    if (!text.trim()) return {};
    return JSON.parse(text) as Record<string, unknown>;
  }

  /** Loads (or refreshes) the recent synced-Drive runs for one report kind, lazily — called when a modal's menu is first opened. */
  async function loadSyncedDriveRuns(reportKind: SportsConnectReportKind) {
    setSyncedDriveLoading((prev) => ({ ...prev, [reportKind]: true }));
    setSyncedDriveError((prev) => ({ ...prev, [reportKind]: "" }));
    try {
      const response = await fetch(
        `/api/admin/sports-connect/runs?${orgQuery}&reportKind=${reportKind}&limit=5`,
        { cache: "no-store" },
      );
      const json = await safeJson(response);
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to load synced files"));
      }
      const list = Array.isArray(json.data) ? (json.data as SportsConnectImportRunView[]) : [];
      // Only DONE runs that actually carry a Drive file are selectable.
      const usable = list.filter((run) => run.status === "DONE" && run.driveFileId);
      setSyncedDriveRuns((prev) => ({ ...prev, [reportKind]: usable }));
    } catch (err) {
      setSyncedDriveError((prev) => ({
        ...prev,
        [reportKind]: err instanceof Error ? err.message : "Failed to load synced files",
      }));
    } finally {
      setSyncedDriveLoading((prev) => ({ ...prev, [reportKind]: false }));
    }
  }

  /** Downloads a synced run's Drive file and hands it to the same setter/handler the local file input would call, so the rest of the import pipeline is untouched. */
  async function applySyncedDriveFile(run: SportsConnectImportRunView, apply: (file: File) => void) {
    setSyncedDriveFetchingId(run.id);
    try {
      const response = await fetch(`/api/admin/sports-connect/drive-file?${orgQuery}&runId=${run.id}`);
      if (!response.ok) {
        const json = await safeJson(response);
        throw new Error(String(json.error || "Failed to download the synced file"));
      }
      const blob = await response.blob();
      const fileName = run.sourceFileName || `synced-${run.reportKind.toLowerCase()}-${run.id}`;
      const file = new File([blob], fileName, { type: blob.type || "application/octet-stream" });
      apply(file);
    } catch (err) {
      setSyncedDriveError((prev) => ({
        ...prev,
        [run.reportKind]: err instanceof Error ? err.message : "Failed to use the synced file",
      }));
    } finally {
      setSyncedDriveFetchingId(null);
    }
  }

  async function loadSportsConnectQuality() {
    setScQualityLoading(true);
    setScQualityError("");
    try {
      const response = await fetch(
        `/api/admin/sports-connect/quality?${orgQuery}&seasonYear=${seasonYear}`,
        { cache: "no-store" },
      );
      const json = await safeJson(response);
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to load roster quality"));
      }
      setScQuality(
        json.data && typeof json.data === "object"
          ? (json.data as RosterQualitySummary)
          : null,
      );
    } catch (err: unknown) {
      setScQuality(null);
      setScQualityError(
        err instanceof Error ? err.message : "Failed to load roster quality",
      );
    } finally {
      setScQualityLoading(false);
    }
  }

  async function loadSportsConnectPresets() {
    try {
      const response = await fetch(
        `/api/admin/sports-connect/presets?${orgQuery}&seasonYear=${seasonYear}&reportKind=PLAYER_REG`,
        { cache: "no-store" },
      );
      const json = await safeJson(response);
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to load mapping presets"));
      }
      const data = Array.isArray(json.data)
        ? (json.data as SportsConnectMappingPresetView[])
        : [];
      setScPresets(data);
    } catch {
      setScPresets([]);
    }
  }

  function applySportsConnectPreset() {
    const preset = scPresets.find((item) => item.id === scSelectedPresetId);
    if (!preset) {
      setScPresetError("Select a preset to apply.");
      return;
    }
    setDivisionMapping((current) => {
      const next = { ...current };
      for (const division of importedDivisions) {
        if (preset.divisionMapping[division]) {
          next[division] = preset.divisionMapping[division];
        }
      }
      // Also apply any preset keys that match imported divisions case-insensitively.
      const lowerLookup = new Map(
        Object.entries(preset.divisionMapping).map(([k, v]) => [k.toLowerCase(), v]),
      );
      for (const division of importedDivisions) {
        if (!next[division]) {
          const mapped = lowerLookup.get(division.toLowerCase());
          if (mapped) next[division] = mapped;
        }
      }
      return next;
    });
    setTeamMapping((current) => ({ ...current, ...preset.teamMapping }));
    setScPresetName(preset.name);
    setScPresetNotice(`Applied preset “${preset.name}”. Review mappings before importing.`);
    setScPresetError("");
  }

  async function saveSportsConnectPreset() {
    setScPresetBusy(true);
    setScPresetError("");
    setScPresetNotice("");
    try {
      const response = await fetch(
        `/api/admin/sports-connect/presets?${orgQuery}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seasonYear,
            name: scPresetName.trim() || "Default",
            reportKind: "PLAYER_REG",
            divisionMapping,
            teamMapping,
          }),
        },
      );
      const json = await safeJson(response);
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to save mapping preset"));
      }
      const saved =
        json.data && typeof json.data === "object"
          ? (json.data as SportsConnectMappingPresetView)
          : null;
      if (saved) {
        setScSelectedPresetId(saved.id);
        setScPresetName(saved.name);
      }
      setScPresetNotice(
        `Saved preset “${saved?.name || scPresetName || "Default"}” for ${seasonYear}.`,
      );
      await loadSportsConnectPresets();
    } catch (err: unknown) {
      setScPresetError(
        err instanceof Error ? err.message : "Failed to save mapping preset",
      );
    } finally {
      setScPresetBusy(false);
    }
  }

  async function detectSportsConnectHeaders(headers: string[]) {
    if (headers.length === 0) {
      setScDetection(null);
      return;
    }
    try {
      const response = await fetch(`/api/admin/sports-connect/detect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers }),
      });
      const json = await safeJson(response);
      if (!response.ok) {
        setScDetection(null);
        return;
      }
      setScDetection(
        json.data && typeof json.data === "object"
          ? (json.data as ColumnDetectResult)
          : null,
      );
    } catch {
      setScDetection(null);
    }
  }

  async function loadTeams() {
    try {
      const response = await fetch(`/api/admin/teams?${orgQuery}`, {
        cache: "no-store",
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to load teams"));
      const data = Array.isArray(json.data) ? (json.data as Team[]) : [];
      setTeams(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load teams");
    }
  }

  async function loadCoachOptions(teamId?: string) {
    try {
      const params = new URLSearchParams();
      params.set("org", targetOrg);
      if (teamId) params.set("teamId", teamId);
      const response = await fetch(`/api/admin/teams/coach-options?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to load coach options"));
      const data = Array.isArray(json.data) ? (json.data as CoachOption[]) : [];
      setCoachOptions(data);
      setSelectedCoachId((current) => (current && data.some((coach) => coach.id === current) ? current : data[0]?.id || ""));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load coach options");
    }
  }

  async function loadImportHistory() {
    try {
      const response = await fetch(`/api/admin/teams/import?${orgQuery}&mode=history&limit=5`, {
        cache: "no-store",
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to load import history"));
      setImportHistory(Array.isArray(json.data) ? (json.data as ImportHistoryItem[]) : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load import history");
    }
  }

  async function loadTeamDetails(teamId: string) {
    const [playersRes, coachesRes] = await Promise.all([
      fetch(`/api/admin/teams/players?${orgQuery}&teamId=${teamId}`, { cache: "no-store" }),
      fetch(`/api/admin/teams/coaches?${orgQuery}&teamId=${teamId}`, { cache: "no-store" }),
    ]);
    const playersJson = await safeJson(playersRes);
    const coachesJson = await safeJson(coachesRes);
    if (!playersRes.ok || !coachesRes.ok) {
      throw new Error(
        String(playersJson.error || coachesJson.error || "Failed to load team details"),
      );
    }
    setPlayers(Array.isArray(playersJson.data) ? (playersJson.data as TeamPlayer[]) : []);
    setAssignments(
      Array.isArray(coachesJson.data) ? (coachesJson.data as TeamCoachAssignment[]) : [],
    );
    const team = teams.find((entry) => entry.id === teamId);
    setTeamContactNotes(team?.contactNotes || "");
    setTeamPracticePlan(team?.practicePlan || "");
    setIsEditingTeamProfile(false);
    setIsEditingRoster(false);
  }

  async function createOrUpdateTeam() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const generatedTeamName = buildTeamNameFromSponsor(
        sponsorName,
        headCoachLastName,
      );
      const response = await fetch(`/api/admin/teams?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonYear,
          ageGroup,
          teamName: generatedTeamName,
          contactNotes: teamContactNotes,
          practicePlan: teamPracticePlan,
        }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to save team"));
      setNotice("Team saved.");
      setSponsorName("");
      setHeadCoachLastName("");
      await loadTeams();
      if (typeof json.team === "object" && json.team && typeof (json.team as { id?: unknown }).id === "string") {
        setTeamFilterSeasonYear(String(seasonYear));
        setTeamFilterAgeGroup(ageGroup.trim());
        setSelectedTeamId((json.team as { id: string }).id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save team");
    } finally {
      setBusy(false);
    }
  }

  async function saveTeamProfile() {
    if (!selectedTeamId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/teams?${orgQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selectedTeamId,
          contactNotes: teamContactNotes,
          practicePlan: teamPracticePlan,
        }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to save profile"));
      setNotice("Team profile saved.");
      await loadTeams();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setBusy(false);
    }
  }

  function emptyTeamListSummary(): TeamListImportSummary {
    return { total: 0, create: 0, update: 0, skip: 0, errors: 0, warnings: 0 };
  }

  function resetTeamListImport(nextCsvText = teamListSampleCsv) {
    setTeamListImportStep("upload");
    setTeamListCsvText(nextCsvText);
    setTeamListImportError("");
    setTeamListImportResult(null);
  }

  function openTeamListImport() {
    resetTeamListImport(teamListCsvText.trim() ? teamListCsvText : teamListSampleCsv);
    setShowTeamListImportModal(true);
  }

  function downloadTeamListTemplate() {
    const blob = new Blob([teamListSampleCsv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = isFallBall ? "fall-ball-team-list-template.csv" : "team-list-template.csv";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  async function handleTeamListFile(file: File | null) {
    if (!file) return;
    setTeamListImportError("");
    try {
      setTeamListCsvText(await file.text());
      setTeamListImportResult(null);
      setTeamListImportStep("upload");
    } catch (err: unknown) {
      setTeamListImportError(err instanceof Error ? err.message : "Failed to read CSV file");
    }
  }

  async function previewTeamListImport() {
    setTeamListImportBusy(true);
    setTeamListImportError("");
    setTeamListImportResult(null);
    try {
      const response = await fetch(`/api/admin/teams/team-list-import?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "preview",
          seasonYear,
          csvText: teamListCsvText,
          teamNameMode: isFallBall ? "mlb" : "standard",
        }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to preview team list"));
      setTeamListImportResult({
        rows: Array.isArray(json.rows) ? (json.rows as TeamListImportRow[]) : [],
        summary: (json.summary as TeamListImportSummary | undefined) || emptyTeamListSummary(),
      });
      setTeamListImportStep("preview");
    } catch (err: unknown) {
      setTeamListImportError(err instanceof Error ? err.message : "Failed to preview team list");
    } finally {
      setTeamListImportBusy(false);
    }
  }

  async function confirmTeamListImport() {
    setTeamListImportBusy(true);
    setTeamListImportError("");
    try {
      const response = await fetch(`/api/admin/teams/team-list-import?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "import",
          seasonYear,
          csvText: teamListCsvText,
          teamNameMode: isFallBall ? "mlb" : "standard",
        }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to import team list"));
      setTeamListImportResult({
        rows: Array.isArray(json.rows) ? (json.rows as TeamListImportRow[]) : [],
        summary: (json.summary as TeamListImportSummary | undefined) || emptyTeamListSummary(),
        affectedTeams: Array.isArray(json.affectedTeams) ? (json.affectedTeams as Team[]) : [],
      });
      setTeamListImportStep("results");
      setNotice("Team list import complete.");
      await loadTeams();
    } catch (err: unknown) {
      setTeamListImportError(err instanceof Error ? err.message : "Failed to import team list");
    } finally {
      setTeamListImportBusy(false);
    }
  }

  async function removeTeam(teamId: string) {
    const team = teams.find((entry) => entry.id === teamId);
    const teamName = team?.teamName || "this team";
    const playerCount = teamId === selectedTeamId ? players.length : team?._count?.players ?? 0;
    const coachCount =
      teamId === selectedTeamId ? assignments.length : team?._count?.coachAssignments ?? 0;
    const confirmation = window.prompt(
      `Delete ${teamName}? This permanently removes the team, ${playerCount} rostered player${
        playerCount === 1 ? "" : "s"
      }, and ${coachCount} coach assignment${coachCount === 1 ? "" : "s"}. Type DELETE to confirm.`,
    );
    if (confirmation !== "DELETE") return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/teams?${orgQuery}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to delete team"));
      setNotice("Team deleted.");
      await loadTeams();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete team");
    } finally {
      setBusy(false);
    }
  }

  async function importPlayers(mapping: DivisionMapping) {
    if (importRows.length === 0) return;
    setBusy(true);
    setError("");
    setNotice("");
    setImportSkippedDetails([]);
    try {
      const startRes = await fetch(`/api/admin/teams/import?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "start", totalRows: importRows.length }),
      });
      const startJson = await safeJson(startRes);
      if (!startRes.ok || typeof (startJson.batch as { id?: unknown } | undefined)?.id !== "string") {
        throw new Error(String(startJson.error || "Failed to start import"));
      }
      const batchId = (startJson.batch as { id: string }).id;
      setActiveImportBatchId(batchId);
      setImportStatus(startJson.batch as ImportJobStatus);
      let skippedByScopeTotal = 0;
      let skippedMissingExistingTotal = 0;
      const skippedDetails: ImportSkippedRowDetail[] = [];
      const chunkSize = 100;
      for (let offset = 0; offset < importRows.length; offset += chunkSize) {
        if (stopImportRequested) break;
        const rowsChunk = importRows.slice(offset, offset + chunkSize) as Record<string, unknown>[];
        const chunkRes = await fetch(`/api/admin/teams/import?${orgQuery}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "chunk",
            batchId,
            rows: rowsChunk,
            seasonYear,
            divisionMappings: mapping,
            confirmedAgeGroup:
              confirmedImportAgeGroup === "__ALL_AGE_GROUPS__"
                ? null
                : confirmedImportAgeGroup,
            confirmedTeamName:
              confirmedImportTeamName === "__ALL__" ? null : confirmedImportTeamName,
            updateExistingOnly: importUpdateExistingOnly,
            teamMappings: teamMapping,
            allStarCutoffDate: allStarCutoffDate
              ? new Date(`${allStarCutoffDate}T00:00:00.000Z`).toISOString()
              : null,
          }),
        });
        const chunkJson = await safeJson(chunkRes);
        if (!chunkRes.ok) throw new Error(String(chunkJson.error || "Chunk import failed"));
        skippedByScopeTotal += Number((chunkJson as { skippedByScope?: unknown }).skippedByScope || 0);
        skippedMissingExistingTotal += Number(
          (chunkJson as { skippedMissingExisting?: unknown }).skippedMissingExisting || 0,
        );
        const chunkSkippedDetails = Array.isArray(
          (chunkJson as { skippedDetails?: unknown }).skippedDetails,
        )
          ? ((chunkJson as { skippedDetails: ImportSkippedRowDetail[] }).skippedDetails ?? [])
          : [];
        if (chunkSkippedDetails.length > 0) {
          skippedDetails.push(...chunkSkippedDetails);
        }
        if (typeof chunkJson.batch === "object" && chunkJson.batch) {
          setImportStatus(chunkJson.batch as ImportJobStatus);
        }
      }
      if (stopImportRequested) {
        await fetch(`/api/admin/teams/import?${orgQuery}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "cancel", batchId }),
        });
        await fetch(`/api/admin/teams/import?${orgQuery}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "undo", batchId }),
        });
        setNotice("Import stopped and rolled back.");
      } else {
        const completeRes = await fetch(`/api/admin/teams/import?${orgQuery}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "complete", batchId }),
        });
        const completeJson = await safeJson(completeRes);
        if (!completeRes.ok) throw new Error(String(completeJson.error || "Failed to complete import"));
        const finalStatus = importStatus || (completeJson.batch as ImportJobStatus | null);
        setImportSkippedDetails(skippedDetails);
        const skippedSummary =
          skippedDetails.length > 0
            ? ` First skipped row: ${
                skippedDetails[0]?.rowNumber ? `#${skippedDetails[0].rowNumber}` : "unknown row"
              } (${skippedDetails[0]?.reason || "unknown reason"}).`
            : "";
        setNotice(
          `Players import complete: ${finalStatus?.createdTeams || 0} teams created, ${finalStatus?.createdPlayers || 0} players created, ${finalStatus?.updatedPlayers || 0} updated, ${finalStatus?.skippedRows || 0} skipped (${skippedByScopeTotal} mismatched age group/team, ${skippedMissingExistingTotal} not found in existing roster).${skippedSummary}`,
        );
        // Best-effort SportsConnect audit spine (does not block import success).
        try {
          await fetch(`/api/admin/sports-connect/runs?${orgQuery}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              seasonYear,
              reportKind: "PLAYER_REG",
              status: "DONE",
              sourceFileName: importFile?.name ?? null,
              presetId: scSelectedPresetId || null,
              teamPlayerBatchId: batchId,
              summary: {
                createdTeams: finalStatus?.createdTeams || 0,
                createdPlayers: finalStatus?.createdPlayers || 0,
                updatedPlayers: finalStatus?.updatedPlayers || 0,
                skippedRows: finalStatus?.skippedRows || 0,
                skippedByScope: skippedByScopeTotal,
                skippedMissingExisting: skippedMissingExistingTotal,
              },
            }),
          });
        } catch {
          // audit only
        }
        setImportFile(null);
        await loadImportHistory();
        await loadTeams();
        await loadSportsConnectQuality();
        if (selectedTeamId) {
          await loadTeamDetails(selectedTeamId);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to import players");
    } finally {
      setBusy(false);
      setStopImportRequested(false);
      setActiveImportBatchId(null);
    }
  }

  async function loadScheduleAgeGroupOptions() {
    const options = teamManagementAgeGroupOptions;
    setScheduleAgeGroupOptions(options);
    return options;
  }

  async function loadAllStarCutoffForSeason() {
    const response = await fetch(
      `/api/admin/teams/all-star-cutoff?${orgQuery}&seasonYear=${seasonYear}`,
      {
        cache: "no-store",
      },
    );
    const json = await safeJson(response);
    if (!response.ok) {
      throw new Error(String(json.error || "Failed to load All-Star cutoff date"));
    }
    const raw =
      typeof (json.data as { cutoffDate?: unknown } | undefined)?.cutoffDate === "string"
        ? String((json.data as { cutoffDate: string }).cutoffDate)
        : "";
    const parsed = raw ? new Date(raw) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      setAllStarCutoffDate("");
      return;
    }
    const yyyy = parsed.getUTCFullYear();
    const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(parsed.getUTCDate()).padStart(2, "0");
    setAllStarCutoffDate(`${yyyy}-${mm}-${dd}`);
  }

  async function extractImportedCoachAgeGroups(file: File) {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0] || ""];
    if (!firstSheet) return [];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
      defval: "",
      raw: false,
    });
    const distinct = new Set<string>();
    for (const row of rows) {
      const value = String(
        row["Division Name"] || row["Age Group"] || row["age_group"] || "",
      ).trim();
      if (shouldSkipDivisionImport(value)) continue;
      if (value) distinct.add(value);
    }
    return Array.from(distinct).sort((a, b) => a.localeCompare(b));
  }

  async function countCoachImportRows(file: File) {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0] || ""];
    if (!firstSheet) return 0;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
      defval: "",
      raw: false,
    });
    return rows.length;
  }

  async function openCoachImportMapping() {
    if (!coachImportFile) return;
    setCoachImportPreparing(true);
    setCoachImportError("");
    setCoachImportNotice("");
    setCoachMappingError("");
    try {
      const [incomingGroups, options] = await Promise.all([
        extractImportedCoachAgeGroups(coachImportFile),
        loadScheduleAgeGroupOptions(),
      ]);
      const optionLookup = new Map(options.map((option) => [option.toLowerCase(), option]));
      const initialMapping: CoachAgeGroupMapping = {};
      for (const incoming of incomingGroups) {
        initialMapping[incoming] = optionLookup.get(incoming.toLowerCase()) || "";
      }
      setCoachImportedAgeGroups(incomingGroups);
      setCoachAgeGroupMapping(initialMapping);
      setShowCoachImportMappingModal(true);
    } catch (err: unknown) {
      setCoachImportError(
        err instanceof Error ? err.message : "Failed to prepare coach import mapping",
      );
    } finally {
      setCoachImportPreparing(false);
    }
  }

  async function importCoaches(mapping: CoachAgeGroupMapping) {
    if (!coachImportFile) return;
    setCoachImportBusy(true);
    setCoachImportError("");
    setCoachImportNotice("Coach import in progress...");
    setCoachImportBatchId(null);
    setCoachImportProcessedCount(0);
    try {
      const totalRows = await countCoachImportRows(coachImportFile);
      setCoachImportTotalCount(totalRows);
      const formData = new FormData();
      formData.append("file", coachImportFile);
      formData.append("ageGroupMappings", JSON.stringify(mapping));
      formData.append("autoAssignToTeams", autoAssignImportedCoaches ? "true" : "false");
      const responsePromise = fetch(`/api/admin/users/import?${orgQuery}`, {
        method: "POST",
        body: formData,
      });
      let keepPolling = true;
      const poll = window.setInterval(() => {
        if (!keepPolling) return;
        void (async () => {
          try {
            const statusResponse = await fetch(`/api/admin/users/import?${orgQuery}`, {
              cache: "no-store",
            });
            const statusJson = await safeJson(statusResponse);
            if (!statusResponse.ok) return;
            if (statusJson.batch && typeof statusJson.batch === "object") {
              const batch = statusJson.batch as { id?: unknown; processedCount?: unknown };
              if (typeof batch.id === "string") setCoachImportBatchId(batch.id);
              if (typeof batch.processedCount === "number") {
                setCoachImportProcessedCount(batch.processedCount);
              }
            }
          } catch {
            // Ignore transient polling failures.
          }
        })();
      }, 1000);
      let response: Response;
      try {
        response = await responsePromise;
      } finally {
        keepPolling = false;
        window.clearInterval(poll);
      }
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Coach import failed"));
      setCoachImportUndoData({
        importBatchId:
          typeof json.importBatchId === "string" ? (json.importBatchId as string) : undefined,
      });
      if (typeof json.importBatchId === "string") {
        setCoachImportBatchId(json.importBatchId as string);
      }
      setCoachImportProcessedCount(totalRows);
      const coachSourceName = coachImportFile?.name ?? null;
      setCoachImportFile(null);
      const diagnostics =
        json.autoAssignDiagnostics && typeof json.autoAssignDiagnostics === "object"
          ? (json.autoAssignDiagnostics as {
              attempts?: unknown;
              unmatchedCount?: unknown;
              unmatchedTeamNames?: unknown;
            })
          : null;
      const unmatchedTeamNames = Array.isArray(diagnostics?.unmatchedTeamNames)
        ? diagnostics?.unmatchedTeamNames
            .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
            .slice(0, 5)
        : [];
      try {
        await fetch(`/api/admin/sports-connect/runs?${orgQuery}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seasonYear,
            reportKind: "COACH_VOLUNTEER",
            status: "DONE",
            sourceFileName: coachSourceName,
            coachBatchId:
              typeof json.importBatchId === "string" ? json.importBatchId : null,
            summary: {
              autoAssigned: Number(json.autoAssigned || 0),
              autoRoleUpdated: Number(json.autoRoleUpdated || 0),
              unmatchedCount: Number(diagnostics?.unmatchedCount || 0),
              totalRows,
            },
          }),
        });
      } catch {
        // audit only
      }
      void loadSportsConnectQuality();
      setCoachImportNotice(
        `Coach import complete. ${Number(json.autoAssigned || 0)} assignment(s) auto-assigned and ${Number(json.autoRoleUpdated || 0)} role update(s).${
          Number(diagnostics?.unmatchedCount || 0) > 0
            ? ` ${Number(diagnostics?.unmatchedCount || 0)} team name(s) were unmatched${
                unmatchedTeamNames.length > 0
                  ? ` (examples: ${unmatchedTeamNames.join(", ")})`
                  : ""
              }.`
            : ""
        }`,
      );
      if (selectedTeamId) await loadTeamDetails(selectedTeamId);
    } catch (err: unknown) {
      setCoachImportError(err instanceof Error ? err.message : "Failed to import coaches");
      setCoachImportNotice("");
    } finally {
      setCoachImportBusy(false);
    }
  }

  async function confirmCoachImportWithMapping() {
    const missing = coachImportedAgeGroups.filter((group) => !coachAgeGroupMapping[group]);
    if (missing.length > 0) {
      setCoachMappingError("Please map every imported age group before importing coaches.");
      return;
    }
    setShowCoachImportMappingModal(false);
    setCoachMappingError("");
    await importCoaches(coachAgeGroupMapping);
  }

  async function undoCoachImport() {
    setCoachImportError("");
    setCoachImportNotice("");
    let importBatchId = coachImportUndoData?.importBatchId;
    if (!importBatchId) {
      const response = await fetch(`/api/admin/users?${orgQuery}`, { cache: "no-store" });
      const json = await safeJson(response);
      if (response.ok && json.latestImportBatch && typeof json.latestImportBatch === "object") {
        importBatchId =
          typeof (json.latestImportBatch as { id?: unknown }).id === "string"
            ? ((json.latestImportBatch as { id: string }).id as string)
            : undefined;
      }
    }
    if (!importBatchId) {
      setCoachImportError("No undoable coach import found.");
      return;
    }
    setCoachImportBusy(true);
    setCoachImportNotice("Undoing coach import...");
    try {
      const response = await fetch(`/api/admin/users/import/undo?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importBatchId }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to undo coach import"));
      setCoachImportNotice("Coach import undone.");
      setCoachImportUndoData(null);
      if (selectedTeamId) await loadTeamDetails(selectedTeamId);
    } catch (err: unknown) {
      setCoachImportError(err instanceof Error ? err.message : "Failed to undo coach import");
      setCoachImportNotice("");
    } finally {
      setCoachImportBusy(false);
    }
  }

  async function extractImportPreview(file: File) {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0] || ""];
    if (!firstSheet) {
      return {
        divisions: [] as string[],
        preview: [] as ImportPreviewRow[],
        rows: [] as Record<string, unknown>[],
        skippedDivisionDetails: [] as ImportSkippedRowDetail[],
      };
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
      defval: "",
      raw: false,
    });
    rows.forEach((row, index) => {
      row.__importRowNumber = index + 2;
    });

    const divisionSet = new Set<string>();
    const preview: ImportPreviewRow[] = [];
    const filteredRows: Record<string, unknown>[] = [];
    const skippedDivisionDetails: ImportSkippedRowDetail[] = [];
    for (const row of rows) {
      const divisionName = getImportRowValue(row, PLAYER_IMPORT_DIVISION_KEYS);
      const teamName = getImportRowValue(row, PLAYER_IMPORT_TEAM_KEYS);
      const playerName =
        getImportRowValue(row, PLAYER_IMPORT_NAME_KEYS) ||
        [
          getImportRowValue(row, ["Player First Name", "Participant First Name", "First Name"]),
          getImportRowValue(row, ["Player Last Name", "Participant Last Name", "Last Name"]),
        ]
          .filter(Boolean)
          .join(" ")
          .trim();
      if (shouldSkipDivisionImport(divisionName)) {
        skippedDivisionDetails.push({
          rowNumber:
            typeof row.__importRowNumber === "number" ? row.__importRowNumber : null,
          reason: divisionName
            ? `Skipped division before import: ${divisionName}`
            : "Skipped division before import",
          playerName,
          ageGroup: divisionName,
          teamName,
        });
        continue;
      }
      filteredRows.push(row);
      const userEmail = getImportRowValue(row, PLAYER_IMPORT_EMAIL_KEYS);
      if (divisionName) divisionSet.add(divisionName);
      if (preview.length < 25) {
        preview.push({
          divisionName,
          teamName,
          playerName,
          userEmail,
        });
      }
    }

    return {
      divisions: Array.from(divisionSet).sort((a, b) => a.localeCompare(b)),
      preview,
      rows: filteredRows,
      skippedDivisionDetails,
    };
  }

  async function openImportMapping() {
    if (!importFile) return;
    setImportPreparing(true);
    setError("");
    setNotice("");
    setMappingError("");
    setScDetection(null);
    setScPresetNotice("");
    setScPresetError("");
    try {
      const [scheduleOptions, extracted, presets] = await Promise.all([
        loadScheduleAgeGroupOptions(),
        extractImportPreview(importFile),
        (async () => {
          try {
            const response = await fetch(
              `/api/admin/sports-connect/presets?${orgQuery}&seasonYear=${seasonYear}&reportKind=PLAYER_REG`,
              { cache: "no-store" },
            );
            const json = await safeJson(response);
            if (!response.ok) return [] as SportsConnectMappingPresetView[];
            return Array.isArray(json.data)
              ? (json.data as SportsConnectMappingPresetView[])
              : [];
          } catch {
            return [] as SportsConnectMappingPresetView[];
          }
        })(),
      ]);
      setScPresets(presets);
      const lookup = new Map(scheduleOptions.map((item) => [item.toLowerCase(), item]));
      const initialMapping: DivisionMapping = {};
      for (const division of extracted.divisions) {
        initialMapping[division] = lookup.get(division.toLowerCase()) || "";
      }
      // Prefer the most recently updated PLAYER_REG preset for this season when names match.
      const latestPreset = presets[0];
      if (latestPreset) {
        const lowerLookup = new Map(
          Object.entries(latestPreset.divisionMapping).map(([k, v]) => [
            k.toLowerCase(),
            v,
          ]),
        );
        for (const division of extracted.divisions) {
          const fromPreset =
            latestPreset.divisionMapping[division] ||
            lowerLookup.get(division.toLowerCase());
          if (fromPreset) initialMapping[division] = fromPreset;
        }
        setScSelectedPresetId(latestPreset.id);
        setScPresetName(latestPreset.name);
        setTeamMapping({ ...latestPreset.teamMapping });
        setScPresetNotice(
          `Pre-filled from preset “${latestPreset.name}”. Adjust before importing if needed.`,
        );
      } else {
        setScSelectedPresetId("");
        setScPresetName("Default");
        setTeamMapping({});
      }
      setImportedDivisions(extracted.divisions);
      setImportPreviewRows(extracted.preview);
      setImportRows(extracted.rows);
      setImportPreviewSkippedDivisionDetails(extracted.skippedDivisionDetails);
      setDivisionMapping(initialMapping);
      setConfirmedImportAgeGroup("");
      setConfirmedImportTeamName("");
      setImportUpdateExistingOnly(false);
      const headerRow = extracted.rows[0];
      if (headerRow) {
        await detectSportsConnectHeaders(Object.keys(headerRow));
      } else if (importFile) {
        // Fall back: detect from raw first sheet headers even if all rows were skipped.
        try {
          const XLSX = await import("xlsx");
          const buffer = await importFile.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0] || ""];
          if (firstSheet) {
            const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
              defval: "",
              raw: false,
            });
            if (rows[0]) await detectSportsConnectHeaders(Object.keys(rows[0]));
          }
        } catch {
          // Detection is assistive only.
        }
      }
      await loadAllStarCutoffForSeason();
      setShowImportMappingModal(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to prepare import mapping");
    } finally {
      setImportPreparing(false);
    }
  }

  async function confirmImportWithMapping() {
    const missing = importedDivisions.filter((division) => !divisionMapping[division]);
    if (missing.length > 0) {
      setMappingError("Please map every imported division before importing.");
      return;
    }
    if (!confirmedImportAgeGroup.trim()) {
      setMappingError("Please confirm the target age group before importing.");
      return;
    }
    const finalTeamSelection = allAgesSelected ? "__ALL__" : confirmedImportTeamName;
    if (allAgesSelected && confirmedImportTeamName !== "__ALL__") {
      setConfirmedImportTeamName("__ALL__");
    }
    if (!finalTeamSelection.trim()) {
      setMappingError("Please confirm the target team name before importing.");
      return;
    }
    if (importUpdateExistingOnly) {
      const missingTeamMappings = unmatchedImportedTeamsForConfirmedAgeGroup.filter(
        (team) => !teamMapping[team],
      );
      if (missingTeamMappings.length > 0) {
        setMappingError("Please map every unmatched imported team name before importing.");
        return;
      }
    }
    if (!allStarCutoffDate) {
      setMappingError("Please provide an All-Star age cutoff date.");
      return;
    }
    try {
      const saveCutoffRes = await fetch(`/api/admin/teams/all-star-cutoff?${orgQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonYear,
          cutoffDate: new Date(`${allStarCutoffDate}T00:00:00.000Z`).toISOString(),
        }),
      });
      const saveCutoffJson = await safeJson(saveCutoffRes);
      if (!saveCutoffRes.ok) {
        throw new Error(String(saveCutoffJson.error || "Failed to save All-Star cutoff date"));
      }
    } catch (err: unknown) {
      setMappingError(err instanceof Error ? err.message : "Failed to save cutoff date");
      return;
    }
    setShowImportMappingModal(false);
    setMappingError("");
    setImportStatus(null);
    await importPlayers(divisionMapping);
  }

  async function undoImportById(batchId?: string) {
    setBusy(true);
    setError("");
    setNotice("");
    setUndoImportStatus({
      status: "RUNNING",
      progress: 12,
      message: "Undo import started...",
    });
    if (undoProgressIntervalRef.current) {
      clearInterval(undoProgressIntervalRef.current);
      undoProgressIntervalRef.current = null;
    }
    undoProgressIntervalRef.current = setInterval(() => {
      setUndoImportStatus((current) => {
        if (!current || current.status !== "RUNNING") return current;
        const next = Math.min(90, current.progress + (current.progress < 50 ? 11 : 7));
        return {
          ...current,
          progress: next,
          message: next >= 75 ? "Restoring player data..." : "Undo import running...",
        };
      });
    }, 500);
    try {
      const response = await fetch(`/api/admin/teams/import?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "undo", ...(batchId ? { batchId } : {}) }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to undo selected import"));
      const restoredUpdated = Number((json as { restoredUpdated?: unknown }).restoredUpdated || 0);
      const skippedMissingUpdated = Number(
        (json as { skippedMissingUpdated?: unknown }).skippedMissingUpdated || 0,
      );
      const deletedPlayers = Number((json as { deletedPlayers?: unknown }).deletedPlayers || 0);
      const deletedTeams = Number((json as { deletedTeams?: unknown }).deletedTeams || 0);
      setUndoImportStatus({
        status: "RUNNING",
        progress: 96,
        message: "Finalizing undo...",
      });
      if (undoProgressIntervalRef.current) {
        clearInterval(undoProgressIntervalRef.current);
        undoProgressIntervalRef.current = null;
      }
      setUndoImportStatus({
        status: "DONE",
        progress: 100,
        message: `Undo complete: ${restoredUpdated} updated restored, ${deletedPlayers} created players removed, ${deletedTeams} created teams removed, ${skippedMissingUpdated} missing updated rows skipped.`,
      });
      setNotice("Import undone.");
      await loadImportHistory();
      window.location.reload();
    } catch (err: unknown) {
      if (undoProgressIntervalRef.current) {
        clearInterval(undoProgressIntervalRef.current);
        undoProgressIntervalRef.current = null;
      }
      setUndoImportStatus(null);
      setError(err instanceof Error ? err.message : "Failed to undo selected import");
    } finally {
      if (undoProgressIntervalRef.current) {
        clearInterval(undoProgressIntervalRef.current);
        undoProgressIntervalRef.current = null;
      }
      setBusy(false);
    }
  }

  async function undoPreviousImport() {
    const latestUndoableImport = importHistory.find((item) => !item.undoneAt);
    if (latestUndoableImport) {
      setUndoConfirmText("");
      setPendingUndoImport(latestUndoableImport);
      return;
    }
    if (
      !window.confirm(
        "Undo the last player import? This can remove teams and players created by the last import and restore players it updated. Continue only if you have reviewed the affected roster data.",
      )
    ) {
      return;
    }
    await undoImportById();
  }

  useEffect(() => {
    return () => {
      if (undoProgressIntervalRef.current) {
        clearInterval(undoProgressIntervalRef.current);
      }
    };
  }, []);

  async function addCoachAssignment() {
    if (!selectedTeamId || !selectedCoachId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/teams/coaches?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selectedTeamId,
          registeredUserId: selectedCoachId,
          role: selectedCoachRole,
        }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to assign coach"));
      setNotice("Coach assignment saved.");
      await loadTeamDetails(selectedTeamId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to assign coach");
    } finally {
      setBusy(false);
    }
  }

  async function removeCoachAssignment(assignmentId: string) {
    if (!selectedTeamId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/teams/coaches?${orgQuery}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to remove coach assignment"));
      setNotice("Coach assignment removed.");
      await loadTeamDetails(selectedTeamId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove coach assignment");
    } finally {
      setBusy(false);
    }
  }

  async function updateCoachAssignmentRole(
    assignment: TeamCoachAssignment,
    role: "HEAD_COACH" | "ASSISTANT_COACH",
  ) {
    if (!selectedTeamId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/teams/coaches?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selectedTeamId,
          registeredUserId: assignment.registeredUser.id,
          role,
        }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to update coach role"));
      setNotice("Coach role updated.");
      await loadTeamDetails(selectedTeamId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update coach role");
    } finally {
      setBusy(false);
    }
  }

  async function addPlayer() {
    if (!selectedTeamId || !newPlayerName.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/teams/players?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selectedTeamId,
          fullName: newPlayerName.trim(),
          contactPhone: newPlayerPhone.trim() || null,
        }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to add player"));
      setNotice("Player added.");
      setNewPlayerName("");
      setNewPlayerPhone("");
      await loadTeamDetails(selectedTeamId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add player");
    } finally {
      setBusy(false);
    }
  }

  async function savePlayer(player: TeamPlayer) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/teams/players?${orgQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: player.id,
          fullName: player.fullName,
          firstName: player.firstName,
          lastName: player.lastName,
          contactPhone: player.contactPhone,
          rosterStatus: player.rosterStatus,
          jerseyNumber: player.jerseyNumber,
          gender: player.gender,
          birthDate: player.birthDate,
          guardianFirstName: player.guardianFirstName,
          guardianLastName: player.guardianLastName,
          guardianEmail: player.guardianEmail,
          guardianPhone: player.guardianPhone,
          paymentStatus: player.paymentStatus,
          birthCertificateStatus: player.birthCertificateStatus,
          registrationOrderNo: player.registrationOrderNo,
          registrationOrderDate: player.registrationOrderDate,
          jerseySize: player.jerseySize,
          medicalConditionsSummary: player.medicalConditionsSummary,
          medicalConditionsDetails: player.medicalConditionsDetails,
          medicalTreatmentAuthorized: player.medicalTreatmentAuthorized,
          liabilityWaiverAccepted: player.liabilityWaiverAccepted,
          codeOfConductAccepted: player.codeOfConductAccepted,
          refundPolicyAccepted: player.refundPolicyAccepted,
          playedPriorSeason: player.playedPriorSeason,
          priorSeasonTeamInfo: player.priorSeasonTeamInfo,
          streetAddress: player.streetAddress,
          unit: player.unit,
          city: player.city,
          state: player.state,
          postalCode: player.postalCode,
          allStarAgeBand: player.allStarAgeBand,
        }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to save player"));
      setNotice("Roster row saved.");
      if (selectedTeamId) await loadTeamDetails(selectedTeamId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save player");
    } finally {
      setBusy(false);
    }
  }

  function updatePlayerField<K extends keyof TeamPlayer>(playerId: string, key: K, value: TeamPlayer[K]) {
    setPlayers((current) =>
      current.map((item) => (item.id === playerId ? { ...item, [key]: value } : item)),
    );
  }

  function toJerseySizeCode(value: string | null) {
    const normalized = (value || "").trim().toLowerCase();
    if (!normalized) return "";
    const explicitMap: Record<string, string> = {
      "adult small": "AS",
      "adult medium": "AM",
      "adult large": "AL",
      "adult x-large": "AXL",
      "adult xl": "AXL",
      "adult xx-large": "A2X",
      "adult 2xl": "A2X",
      "youth small": "YS",
      "youth medium": "YM",
      "youth large": "YL",
      "youth x-large": "YXL",
      "youth xl": "YXL",
    };
    if (explicitMap[normalized]) return explicitMap[normalized];
    const parts = normalized.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
    return parts
      .map((part) => part[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 3);
  }

  function getRosterStatusIndicator(value: string | null) {
    const normalized = (value || "").trim().toLowerCase();
    if (normalized === "completed") {
      return { icon: "✓", className: "text-emerald-400", label: "Completed" };
    }
    if (normalized.includes("completed") && normalized.includes("not verified")) {
      return {
        icon: "✓",
        className: "text-amber-400",
        label: "Completed | Not Verified",
      };
    }
    return { icon: "•", className: "text-zinc-500", label: value || "No status" };
  }

  function deriveFirstLastFromFullName(fullName: string) {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) {
      return { firstName: parts[0] || "", lastName: "" };
    }
    return {
      firstName: parts.slice(0, -1).join(" "),
      lastName: parts[parts.length - 1] || "",
    };
  }

  function updatePlayerNameParts(player: TeamPlayer, next: { firstName?: string; lastName?: string }) {
    const firstName = (next.firstName ?? player.firstName ?? "").trim();
    const lastName = (next.lastName ?? player.lastName ?? "").trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    setPlayers((current) =>
      current.map((item) =>
        item.id === player.id
          ? {
              ...item,
              firstName: firstName || null,
              lastName: lastName || null,
              fullName: fullName || item.fullName,
            }
          : item,
      ),
    );
  }

  async function removePlayer(playerId: string) {
    if (!selectedTeamId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/teams/players?${orgQuery}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to remove player"));
      setNotice("Player removed.");
      await loadTeamDetails(selectedTeamId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove player");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-300">
          {notice}
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Team workflow</p>
            <h2 className="text-lg font-semibold">What do you need to do?</h2>
          </div>
          <TeamsWorkflowNavigation
            activeSectionId={activeTeamsSection}
            selectedTeamId={selectedTeamId}
            onNavigate={handleWorkflowNavigation}
          />
        </div>
        <TeamHealthSummaryGrid summary={teamHealthSummary} />
        <SportsConnectQualityPanel
          quality={scQuality}
          loading={scQualityLoading}
          error={scQualityError}
          onRefresh={() => void loadSportsConnectQuality()}
        />
        <div className="flex flex-wrap items-center gap-2">
          {onGoToImport ? (
            <button
              type="button"
              onClick={onGoToImport}
              className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
            >
              Import Registration Data
            </button>
          ) : (
            <a
              href={`/admin/competition?tab=sports-connect&${orgQuery}`}
              className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800"
            >
              Import Registration Data
            </a>
          )}
          <button
            type="button"
            disabled={!selectedTeamId}
            onClick={() => {
              setActiveTeamsSection("teams-assign-coaches");
              setShowCoachAssignmentsModal(true);
            }}
            className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            Assign Coaches
          </button>
          <PlayerCardDemoPreview
            organizationId={targetOrg}
            seasonYear={seasonYear}
          />
        </div>
      </div>

      {activeTeamsSection === "online-draft" && (
        <div id="online-draft" className="scroll-mt-24">
          <OnlineDraftDesk targetOrg={targetOrg} seasonYear={seasonYear} />
        </div>
      )}

      <div id="teams-build" className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4 scroll-mt-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Teams Setup</h2>
          {onGoToImport ? (
            <button
              type="button"
              onClick={onGoToImport}
              className="text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 font-semibold shadow"
            >
              Import players/coaches/team list →
            </button>
          ) : (
            <a
              href={`/admin/competition?tab=sports-connect&${orgQuery}`}
              className="text-xs rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 font-semibold shadow"
            >
              Import players/coaches/team list →
            </a>
          )}
        </div>
        <details className="group">
          <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
            Advanced: import one file manually
          </summary>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openTeamListImport}
              className="text-xs rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-3 py-1.5 font-semibold"
            >
              Import Team List
            </button>
            <button
              type="button"
              onClick={() => setShowCoachImportModal(true)}
              className="text-xs rounded-lg border border-zinc-600 text-zinc-200 hover:bg-zinc-800 px-3 py-1.5 font-semibold"
            >
              Start Coach Import
            </button>
            <button
              type="button"
              onClick={() => setShowPlayersImportModal(true)}
              className="text-xs rounded-lg border border-brand-purple text-brand-purple hover:bg-brand-purple/10 px-3 py-1.5 font-semibold"
            >
              Start Player Import
            </button>
          </div>
        </details>
        <div className="grid md:grid-cols-5 gap-3">
          <input
            type="number"
            value={seasonYear}
            onChange={(event) => setSeasonYear(Number(event.target.value))}
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <select
            value={ageGroup}
            onChange={(event) => setAgeGroup(event.target.value)}
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          >
            <option value="">Select age group…</option>
            {setupAgeGroupOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <input
            value={sponsorName}
            onChange={(event) => setSponsorName(event.target.value)}
            placeholder="Sponsor"
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <input
            value={headCoachLastName}
            onChange={(event) => setHeadCoachLastName(event.target.value)}
            placeholder="Head Coach Last Name"
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={
              busy ||
              !ageGroup.trim() ||
              !sponsorName.trim() ||
              !headCoachLastName.trim()
            }
            onClick={() => void createOrUpdateTeam()}
            className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            Create / Update Team
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          Team name format:{" "}
          <code className="text-zinc-300">{`{SPONSOR} - {HEAD COACH LAST NAME}`}</code>
          {buildTeamNameFromSponsor(sponsorName, headCoachLastName)
            ? ` → ${buildTeamNameFromSponsor(sponsorName, headCoachLastName)}`
            : ""}
          {isFallBall ? " Fall Ball teams use MLB team names instead of sponsors." : ""}
        </p>

        <div className="grid md:grid-cols-[180px_1fr_1fr_auto] gap-3 items-center">
          <select
            value={teamFilterSeasonYear}
            onChange={(event) => {
              setTeamFilterSeasonYear(event.target.value);
              setTeamFilterAgeGroup("");
            }}
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          >
            <option value="">All seasons</option>
            {teamFilterSeasonOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          <select
            value={teamFilterAgeGroup}
            onChange={(event) => setTeamFilterAgeGroup(event.target.value)}
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm min-w-56"
          >
            <option value="">All age groups</option>
            {teamFilterAgeGroupOptions.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
          <select
            value={selectedTeamId}
            onChange={(event) => setSelectedTeamId(event.target.value)}
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm min-w-80"
          >
            <option value="">Select team…</option>
            {filteredTeamOptions.map((team) => (
              <option key={team.id} value={team.id}>
                {team.teamName} ({team._count?.players || 0} players)
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !selectedTeamId}
            onClick={() => selectedTeamId && void removeTeam(selectedTeamId)}
            className="rounded-lg border border-red-700 text-red-300 px-3 py-2 text-sm disabled:opacity-60"
          >
            Delete Team
          </button>
        </div>
      </div>

      <div id="teams-import-history" className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4 scroll-mt-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Import History</h2>
            <p className="text-xs text-zinc-400">Review recent player import batches, who started them when available, what changed, and whether undo is still available.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadImportHistory()}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Refresh
            </button>
          </div>
        </div>
        <div className="overflow-auto rounded-lg border border-zinc-800">
          <table className="w-full text-xs">
            <thead className="bg-zinc-900 text-zinc-300">
              <tr className="text-left">
                <th className="px-3 py-2">Started / administrator</th>
                <th className="px-3 py-2">Status / undo</th>
                <th className="px-3 py-2">Rows</th>
                <th className="px-3 py-2">What changed</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {importHistory.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-3 text-zinc-500">
                    No imports yet.
                  </td>
                </tr>
              ) : (
                importHistory.map((item) => (
                  <tr key={item.id} className="border-t border-zinc-800">
                    <td className="px-3 py-2">
                      <div>{new Date(item.createdAt).toLocaleString()}</div>
                      <div className="text-zinc-500">By {getImportHistoryActor(item)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div>{item.undoneAt ? "UNDONE" : item.status || "Status unavailable"}</div>
                      <div className="text-zinc-500">{getImportHistoryUndoText(item)}</div>
                    </td>
                    <td className="px-3 py-2">
                      {item.processedRows}/{item.totalRows || "unknown"}
                    </td>
                    <td className="px-3 py-2">
                      <div>{getImportHistoryWhat(item)}</div>
                      <div className="text-zinc-500">
                        +{item.createdTeams} teams, +{item.createdPlayers} players, {item.updatedPlayers} updated, {item.skippedRows} skipped
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={busy || Boolean(item.undoneAt)}
                        onClick={() => {
                          setUndoConfirmText("");
                          setPendingUndoImport(item);
                        }}
                        className="rounded border border-amber-700 px-2 py-1 text-amber-300 disabled:opacity-50"
                      >
                        Undo This Player Import
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pendingUndoImport ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-xl rounded-xl border border-zinc-700 bg-zinc-950 p-5 space-y-4">
            <h3 className="text-base font-semibold">Confirm Import Undo</h3>
            <p className="text-sm text-zinc-300">
              Undo player import <code className="text-zinc-100">{pendingUndoImport.id}</code>. This can remove {pendingUndoImport.createdPlayers} player{pendingUndoImport.createdPlayers === 1 ? "" : "s"} and {pendingUndoImport.createdTeams} team{pendingUndoImport.createdTeams === 1 ? "" : "s"} created by that batch, then restore {pendingUndoImport.updatedPlayers} updated player{pendingUndoImport.updatedPlayers === 1 ? "" : "s"}.
            </p>
            <p className="text-sm text-amber-200">
              Review the affected roster data first. Type <span className="font-semibold">UNDO</span> to continue.
            </p>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-300 space-y-1">
              <p>Started: {new Date(pendingUndoImport.createdAt).toLocaleString()}</p>
              <p>Status: {pendingUndoImport.undoneAt ? "UNDONE" : pendingUndoImport.status}</p>
              <p>
                Result: +{pendingUndoImport.createdTeams} teams, +{pendingUndoImport.createdPlayers} players,{" "}
                {pendingUndoImport.updatedPlayers} updated, {pendingUndoImport.skippedRows} skipped
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <input
                value={undoConfirmText}
                onChange={(event) => setUndoConfirmText(event.target.value)}
                placeholder="Type UNDO"
                className="mr-auto rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  setUndoConfirmText("");
                  setPendingUndoImport(null);
                }}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || undoConfirmText !== "UNDO"}
                onClick={async () => {
                  const selected = pendingUndoImport;
                  setPendingUndoImport(null);
                  setUndoConfirmText("");
                  if (!selected) return;
                  await undoImportById(selected.id);
                }}
                className="rounded-lg border border-amber-700 px-4 py-2 text-sm text-amber-300 hover:bg-amber-950/30 disabled:opacity-60"
              >
                Undo Last Player Import
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedTeam ? (
        <>
          <div id="teams-review-rosters" className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4 scroll-mt-24">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Roster</h2>
              <div className="flex flex-wrap items-center gap-2">
                <PlayerCardDemoPreview
                  organizationId={targetOrg}
                  seasonYear={seasonYear}
                />
                <button
                  type="button"
                  disabled={!selectedTeamId}
                  onClick={() => {
                    setActiveTeamsSection("teams-assign-coaches");
                    setShowCoachAssignmentsModal(true);
                  }}
                  className="rounded-lg border border-brand-purple text-brand-purple hover:bg-brand-purple/10 px-3 py-1.5 text-xs disabled:opacity-50"
                  title="Manage coach assignments"
                >
                  Assign Coaches
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setIsEditingRoster((value) => {
                      const next = !value;
                      if (!next) setEditingCoachRoleId(null);
                      return next;
                    })
                  }
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  {isEditingRoster ? "Done" : "Edit"}
                </button>
              </div>
            </div>
            <div id="teams-assign-coaches" className="space-y-2 scroll-mt-24">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Coaches</p>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40">
                {assignments.length === 0 ? (
                  <p className="text-zinc-500 text-sm p-3">No coaches assigned.</p>
                ) : (
                  <div className="divide-y divide-zinc-800">
                    {assignments.map((assignment) => {
                      const coach = assignment.registeredUser;
                      const label =
                        (coach.firstName || coach.lastName
                          ? [coach.firstName, coach.lastName].filter(Boolean).join(" ")
                          : coach.name) || coach.email;
                      return (
                        <div key={assignment.id} className="px-3 py-2 flex items-center justify-between gap-3">
                          <p className="text-sm">
                            {label} ({coach.email})
                          </p>
                          <div className="flex items-center gap-2">
                            {isEditingRoster && editingCoachRoleId === assignment.id ? (
                              <>
                                <select
                                  value={assignment.role}
                                  disabled={busy}
                                  onChange={(event) =>
                                    setAssignments((current) =>
                                      current.map((item) =>
                                        item.id === assignment.id
                                          ? {
                                              ...item,
                                              role: event.target.value as
                                                | "HEAD_COACH"
                                                | "ASSISTANT_COACH",
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                  className="rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-xs"
                                >
                                  <option value="HEAD_COACH">Head Coach</option>
                                  <option value="ASSISTANT_COACH">Assistant Coach</option>
                                </select>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={async () => {
                                    await updateCoachAssignmentRole(assignment, assignment.role);
                                    setEditingCoachRoleId(null);
                                  }}
                                  className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-2.5 py-1 disabled:opacity-60"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => setEditingCoachRoleId(null)}
                                  className="text-xs rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-2.5 py-1 disabled:opacity-60"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="text-xs text-zinc-400">
                                  {assignment.role === "HEAD_COACH" ? "Head Coach" : "Assistant Coach"}
                                </span>
                                {isEditingRoster ? (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => setEditingCoachRoleId(assignment.id)}
                                    className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-2.5 py-1 disabled:opacity-60"
                                  >
                                    Edit
                                  </button>
                                ) : null}
                              </>
                            )}
                            {isEditingRoster ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void removeCoachAssignment(assignment.id)}
                                className="text-xs rounded-lg border border-red-700 text-red-300 px-2.5 py-1 disabled:opacity-60"
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Players</p>
            <BulkEmailToolbar
              selectedCount={selectedGuardians.size}
              disabled={busy}
              onSelectPage={() =>
                selectedGuardians.selectMany(
                  players.filter((p) => p.guardianEmail).map((p) => p.id),
                )
              }
              onClear={selectedGuardians.clear}
              onOpenEmail={() => setEmailModalOpen(true)}
              selectPageLabel="Select all with guardian email"
              helpText="Only players with a guardian email on file can be selected. Scoped to this team's roster."
            />
            {isEditingRoster ? (
              <div className="grid md:grid-cols-3 gap-3">
                <input
                  value={newPlayerName}
                  onChange={(event) => setNewPlayerName(event.target.value)}
                  placeholder="Player full name"
                  className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                />
                <input
                  value={newPlayerPhone}
                  onChange={(event) => setNewPlayerPhone(event.target.value)}
                  placeholder="Contact phone"
                  className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={busy || !newPlayerName.trim()}
                  onClick={() => void addPlayer()}
                  className="rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-2 text-sm disabled:opacity-60"
                >
                  Add Player
                </button>
              </div>
            ) : null}
            <div className="max-h-96 overflow-auto rounded-lg border border-zinc-800">
              {players.length === 0 ? (
                <p className="text-zinc-500 text-sm p-3">No players on roster yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-zinc-900 text-zinc-300">
                    <tr className="text-center">
                      <th className="px-3 py-2">
                        <span className="sr-only">Select</span>
                      </th>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">First Name</th>
                      <th className="px-3 py-2">Last Name</th>
                      <th className="px-3 py-2">Phone</th>
                      <th className="px-3 py-2">Size</th>
                      <th className="px-3 py-2">AS Age</th>
                      <th className="px-3 py-2 text-center">Profile</th>
                      <th className="px-3 py-2 text-center">Status</th>
                      <th className="px-3 py-2 text-center">Details</th>
                      {isEditingRoster ? <th className="px-3 py-2 text-right">Actions</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((player) => {
                      const profile = getPlayerProfileCompleteness(player);
                      const statusIndicator = getRosterStatusIndicator(player.rosterStatus);
                      const derived = deriveFirstLastFromFullName(player.fullName || "");
                      const firstNameValue = player.firstName || derived.firstName;
                      const lastNameValue = player.lastName || derived.lastName;
                      return (
                        <tr key={player.id} className="border-t border-zinc-800">
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              className="rounded border-zinc-600"
                              disabled={!player.guardianEmail}
                              title={
                                player.guardianEmail
                                  ? undefined
                                  : "No guardian email on file"
                              }
                              checked={selectedGuardians.selected.has(player.id)}
                              onChange={(e) => selectedGuardians.toggle(player.id, e.target.checked)}
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              value={player.jerseyNumber || ""}
                              onChange={(event) =>
                                updatePlayerField(
                                  player.id,
                                  "jerseyNumber",
                                  event.target.value.replace(/\D/g, "").slice(0, 2) || null,
                                )
                              }
                              disabled={!isEditingRoster}
                              inputMode="numeric"
                              maxLength={2}
                              className="w-14 rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm text-center"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              value={firstNameValue}
                              onChange={(event) => updatePlayerNameParts(player, { firstName: event.target.value })}
                              disabled={!isEditingRoster}
                              className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={lastNameValue}
                              onChange={(event) => updatePlayerNameParts(player, { lastName: event.target.value })}
                              disabled={!isEditingRoster}
                              className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={player.contactPhone || ""}
                              onChange={(event) =>
                                updatePlayerField(player.id, "contactPhone", event.target.value || null)
                              }
                              disabled={!isEditingRoster}
                              className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm text-center"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              value={toJerseySizeCode(player.jerseySize)}
                              disabled
                              maxLength={3}
                              className="w-16 rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm text-center"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <select
                              value={player.allStarAgeBand || ""}
                              onChange={(event) =>
                                updatePlayerField(
                                  player.id,
                                  "allStarAgeBand",
                                  event.target.value || null,
                                )
                              }
                              disabled={!isEditingRoster}
                              className="w-20 rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-xs text-center"
                            >
                              <option value="">Unset</option>
                              {Array.from({ length: 15 }, (_, index) => {
                                const age = index + 4;
                                return (
                                  <option key={`${age}U`} value={`${age}U`}>
                                    {age}U
                                  </option>
                                );
                              })}
                            </select>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => setActiveProfileSummaryPlayerId(player.id)}
                              className={`rounded-full px-2 py-0.5 text-[11px] ${
                                profile.isComplete
                                  ? "bg-emerald-950/50 border border-emerald-700 text-emerald-300"
                                  : "bg-amber-950/50 border border-amber-700 text-amber-300"
                              }`}
                              title="Open profile completeness"
                            >
                              🏅 {profile.completeCount}/{profile.total}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span
                              className={`inline-flex items-center justify-center text-base leading-none ${statusIndicator.className}`}
                              title={statusIndicator.label}
                            >
                              {statusIndicator.icon}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => setActiveProfilePlayerId(player.id)}
                              className="rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                              title="Open player profile"
                            >
                              🧾
                            </button>
                          </td>
                          {isEditingRoster ? (
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void savePlayer(player)}
                                  className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 disabled:opacity-60"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void removePlayer(player.id)}
                                  className="text-xs rounded-lg border border-red-700 text-red-300 px-3 py-1.5 disabled:opacity-60"
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      ) : null}

      {showCoachAssignmentsModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-zinc-700 bg-zinc-950 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">Coach Assignments</h3>
              <button
                type="button"
                onClick={() => {
                  if (busy) return;
                  setShowCoachAssignmentsModal(false);
                  setEditingCoachRoleId(null);
                }}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Close
              </button>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <select
                value={selectedCoachId}
                onChange={(event) => setSelectedCoachId(event.target.value)}
                className="md:col-span-2 rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
              >
                <option value="">Select coach…</option>
                {coachOptions.map((coach) => {
                  const label =
                    (coach.firstName || coach.lastName
                      ? [coach.firstName, coach.lastName].filter(Boolean).join(" ")
                      : coach.name) || coach.email;
                  return (
                    <option key={coach.id} value={coach.id}>
                      {label} ({coach.email})
                    </option>
                  );
                })}
              </select>
              <select
                value={selectedCoachRole}
                onChange={(event) =>
                  setSelectedCoachRole(event.target.value as "HEAD_COACH" | "ASSISTANT_COACH")
                }
                className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
              >
                <option value="HEAD_COACH">Head Coach</option>
                <option value="ASSISTANT_COACH">Assistant Coach</option>
              </select>
            </div>
            <button
              type="button"
              disabled={busy || !selectedTeamId || !selectedCoachId}
              onClick={() => void addCoachAssignment()}
              className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              Assign Coach
            </button>
            <div className="max-h-80 overflow-auto rounded-lg border border-zinc-800">
              {assignments.length === 0 ? (
                <p className="text-zinc-500 text-sm p-3">No coaches assigned.</p>
              ) : (
                assignments.map((assignment) => {
                  const coach = assignment.registeredUser;
                  const label =
                    (coach.firstName || coach.lastName
                      ? [coach.firstName, coach.lastName].filter(Boolean).join(" ")
                      : coach.name) || coach.email;
                  return (
                    <div
                      key={assignment.id}
                      className="px-3 py-2 border-b border-zinc-800 last:border-b-0 flex items-center justify-between gap-3"
                    >
                      <p className="text-sm">
                        {label} ({coach.email})
                      </p>
                      <div className="flex items-center gap-2">
                        {editingCoachRoleId === assignment.id ? (
                          <>
                            <select
                              value={assignment.role}
                              disabled={busy}
                              onChange={(event) =>
                                setAssignments((current) =>
                                  current.map((item) =>
                                    item.id === assignment.id
                                      ? {
                                          ...item,
                                          role: event.target.value as
                                            | "HEAD_COACH"
                                            | "ASSISTANT_COACH",
                                        }
                                      : item,
                                  ),
                                )
                              }
                              className="rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-xs"
                            >
                              <option value="HEAD_COACH">Head Coach</option>
                              <option value="ASSISTANT_COACH">Assistant Coach</option>
                            </select>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                await updateCoachAssignmentRole(assignment, assignment.role);
                                setEditingCoachRoleId(null);
                              }}
                              className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 disabled:opacity-60"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                setEditingCoachRoleId(null);
                                if (selectedTeamId) await loadTeamDetails(selectedTeamId);
                              }}
                              className="text-xs rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="text-xs text-zinc-400">
                              {assignment.role === "HEAD_COACH" ? "Head Coach" : "Assistant Coach"}
                            </span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setEditingCoachRoleId(assignment.id)}
                              className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 disabled:opacity-60"
                            >
                              Edit
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void removeCoachAssignment(assignment.id)}
                          className="text-xs rounded-lg border border-red-700 text-red-300 px-3 py-1.5 disabled:opacity-60"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}

      {activeProfilePlayer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-auto rounded-xl border border-zinc-700 bg-zinc-950 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">Player Profile · {activeProfilePlayer.fullName}</h3>
              <button
                type="button"
                onClick={() => setActiveProfilePlayerId(null)}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Close
              </button>
            </div>
            {(() => {
              const profile = getPlayerProfileCompleteness(activeProfilePlayer);
              const checks = buildPlayerChecks(activeProfilePlayer);
              const selected = teams.find((t) => t.id === selectedTeamId);
              const card = playerCardFromFields(
                activeProfilePlayer,
                {
                  id: selectedTeamId || activeProfilePlayer.teamId,
                  teamName: selected?.teamName || "Team",
                  ageGroup: selected?.ageGroup || "",
                  seasonYear: selected?.seasonYear ?? seasonYear,
                  organizationId: targetOrg,
                },
                checks,
                profile.readiness,
                profile.completeCount,
                profile.total,
              );
              return <PlayerCardPanel card={card} />;
            })()}
            <div className="grid md:grid-cols-3 gap-2">
              <p className="md:col-span-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Guardian</p>
              <label className="space-y-1"><span className="block text-[11px] text-zinc-400">Guardian First Name</span><input disabled={!isEditingRoster} value={activeProfilePlayer.guardianFirstName || ""} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "guardianFirstName", event.target.value || null)} className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm" /></label>
              <label className="space-y-1"><span className="block text-[11px] text-zinc-400">Guardian Last Name</span><input disabled={!isEditingRoster} value={activeProfilePlayer.guardianLastName || ""} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "guardianLastName", event.target.value || null)} className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm" /></label>
              <label className="space-y-1"><span className="block text-[11px] text-zinc-400">Guardian Email</span><input disabled={!isEditingRoster} value={activeProfilePlayer.guardianEmail || ""} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "guardianEmail", event.target.value || null)} className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm" /></label>
              <label className="space-y-1"><span className="block text-[11px] text-zinc-400">Guardian Phone</span><input disabled={!isEditingRoster} value={activeProfilePlayer.guardianPhone || ""} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "guardianPhone", event.target.value || null)} className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm" /></label>
              <label className="space-y-1"><span className="block text-[11px] text-zinc-400">Gender</span><input disabled={!isEditingRoster} value={activeProfilePlayer.gender || ""} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "gender", event.target.value || null)} className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm" /></label>
              <label className="space-y-1"><span className="block text-[11px] text-zinc-400">Birth Date</span><input disabled={!isEditingRoster} type="date" value={activeProfilePlayer.birthDate ? activeProfilePlayer.birthDate.slice(0, 10) : ""} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "birthDate", event.target.value || null)} className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm" /></label>
              <p className="md:col-span-3 mt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Registration</p>
              <label className="space-y-1"><span className="block text-[11px] text-zinc-400">Jersey Number</span><input disabled={!isEditingRoster} value={activeProfilePlayer.jerseyNumber || ""} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "jerseyNumber", event.target.value || null)} className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm" /></label>
              <label className="space-y-1"><span className="block text-[11px] text-zinc-400">Jersey Size</span><input disabled={!isEditingRoster} value={activeProfilePlayer.jerseySize || ""} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "jerseySize", event.target.value || null)} className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm" /></label>
              <label className="space-y-1"><span className="block text-[11px] text-zinc-400">All-Star Age Band</span><select disabled={!isEditingRoster} value={activeProfilePlayer.allStarAgeBand || ""} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "allStarAgeBand", event.target.value || null)} className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm"><option value="">Unset</option>{Array.from({ length: 15 }, (_, index) => { const age = index + 4; return <option key={`${age}U`} value={`${age}U`}>{age}U</option>; })}</select></label>
              <label className="space-y-1"><span className="block text-[11px] text-zinc-400">Roster Status</span><input disabled={!isEditingRoster} value={activeProfilePlayer.rosterStatus || ""} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "rosterStatus", event.target.value || null)} className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm" /></label>
              <label className="space-y-1"><span className="block text-[11px] text-zinc-400">Payment Status</span><input disabled={!isEditingRoster} value={activeProfilePlayer.paymentStatus || ""} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "paymentStatus", event.target.value || null)} className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm" /></label>
              <label className="space-y-1"><span className="block text-[11px] text-zinc-400">Birth Certificate</span><input disabled={!isEditingRoster} value={activeProfilePlayer.birthCertificateStatus || ""} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "birthCertificateStatus", event.target.value || null)} className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm" /></label>
              <label className="space-y-1"><span className="block text-[11px] text-zinc-400">Order Number</span><input disabled={!isEditingRoster} value={activeProfilePlayer.registrationOrderNo || ""} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "registrationOrderNo", event.target.value || null)} className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm" /></label>
              <label className="space-y-1"><span className="block text-[11px] text-zinc-400">Order Date</span><input disabled={!isEditingRoster} type="date" value={activeProfilePlayer.registrationOrderDate ? activeProfilePlayer.registrationOrderDate.slice(0, 10) : ""} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "registrationOrderDate", event.target.value || null)} className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm" /></label>
              <label className="space-y-1 md:col-span-2"><span className="block text-[11px] text-zinc-400">Prior Season Team/Age Group</span><input disabled={!isEditingRoster} value={activeProfilePlayer.priorSeasonTeamInfo || ""} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "priorSeasonTeamInfo", event.target.value || null)} className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm" /></label>
              <p className="md:col-span-3 mt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Address</p>
              <label className="space-y-1 md:col-span-2"><span className="block text-[11px] text-zinc-400">Street Address</span><input disabled={!isEditingRoster} value={activeProfilePlayer.streetAddress || ""} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "streetAddress", event.target.value || null)} className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm" /></label>
              <label className="space-y-1"><span className="block text-[11px] text-zinc-400">Unit</span><input disabled={!isEditingRoster} value={activeProfilePlayer.unit || ""} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "unit", event.target.value || null)} className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm" /></label>
              <label className="space-y-1"><span className="block text-[11px] text-zinc-400">City</span><input disabled={!isEditingRoster} value={activeProfilePlayer.city || ""} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "city", event.target.value || null)} className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm" /></label>
              <label className="space-y-1"><span className="block text-[11px] text-zinc-400">State</span><input disabled={!isEditingRoster} value={activeProfilePlayer.state || ""} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "state", event.target.value || null)} className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm" /></label>
              <label className="space-y-1"><span className="block text-[11px] text-zinc-400">Postal Code</span><input disabled={!isEditingRoster} value={activeProfilePlayer.postalCode || ""} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "postalCode", event.target.value || null)} className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm" /></label>
              <p className="md:col-span-3 mt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Medical</p>
              <label className="space-y-1 md:col-span-3"><span className="block text-[11px] text-zinc-400">Medical/Allergy Summary</span><input disabled={!isEditingRoster} value={activeProfilePlayer.medicalConditionsSummary || ""} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "medicalConditionsSummary", event.target.value || null)} className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm" /></label>
              <label className="space-y-1 md:col-span-3"><span className="block text-[11px] text-zinc-400">Medical Details</span><textarea disabled={!isEditingRoster} value={activeProfilePlayer.medicalConditionsDetails || ""} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "medicalConditionsDetails", event.target.value || null)} rows={2} className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm" /></label>
            </div>
            <div className="grid md:grid-cols-5 gap-2 text-xs text-zinc-300">
              <label className="flex items-center gap-2"><input disabled={!isEditingRoster} type="checkbox" checked={Boolean(activeProfilePlayer.medicalTreatmentAuthorized)} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "medicalTreatmentAuthorized", event.target.checked)} />Medical auth</label>
              <label className="flex items-center gap-2"><input disabled={!isEditingRoster} type="checkbox" checked={Boolean(activeProfilePlayer.liabilityWaiverAccepted)} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "liabilityWaiverAccepted", event.target.checked)} />Liability waiver</label>
              <label className="flex items-center gap-2"><input disabled={!isEditingRoster} type="checkbox" checked={Boolean(activeProfilePlayer.codeOfConductAccepted)} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "codeOfConductAccepted", event.target.checked)} />Code of conduct</label>
              <label className="flex items-center gap-2"><input disabled={!isEditingRoster} type="checkbox" checked={Boolean(activeProfilePlayer.refundPolicyAccepted)} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "refundPolicyAccepted", event.target.checked)} />Refund policy</label>
              <label className="flex items-center gap-2"><input disabled={!isEditingRoster} type="checkbox" checked={Boolean(activeProfilePlayer.playedPriorSeason)} onChange={(event) => updatePlayerField(activeProfilePlayer.id, "playedPriorSeason", event.target.checked)} />Played prior season</label>
            </div>
            {isEditingRoster ? (
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => activeProfilePlayer && void savePlayer(activeProfilePlayer)}
                  className="rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-4 py-2 text-sm disabled:opacity-60"
                >
                  Save Player
                </button>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Team Profile</h2>
              <button
                type="button"
                onClick={() => setIsEditingTeamProfile((value) => !value)}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                {isEditingTeamProfile ? "Done" : "Edit"}
              </button>
            </div>
            {isEditingTeamProfile ? (
              <>
                <textarea
                  value={teamContactNotes}
                  onChange={(event) => setTeamContactNotes(event.target.value)}
                  rows={3}
                  placeholder="Team contact notes"
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                />
                <textarea
                  value={teamPracticePlan}
                  onChange={(event) => setTeamPracticePlan(event.target.value)}
                  rows={4}
                  placeholder="Practice plan"
                  className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={busy || !selectedTeamId}
                  onClick={() => void saveTeamProfile()}
                  className="rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-4 py-2 text-sm disabled:opacity-60"
                >
                  Save Profile
                </button>
              </>
            ) : (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-zinc-500">Team contact notes</p>
                  <p className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-zinc-200">
                    {teamContactNotes || "No team contact notes."}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Practice plan</p>
                  <p className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 text-zinc-200">
                    {teamPracticePlan || "No practice plan."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {activeProfileSummaryPlayer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-950 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold">
                Profile Completeness · {activeProfileSummaryPlayer.fullName}
              </h3>
              <button
                type="button"
                onClick={() => setActiveProfileSummaryPlayerId(null)}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Close
              </button>
            </div>
            {(() => {
              const profile = getPlayerProfileCompleteness(activeProfileSummaryPlayer);
              const checks = buildPlayerChecks(activeProfileSummaryPlayer);
              const selected = teams.find((t) => t.id === selectedTeamId);
              const card = playerCardFromFields(
                activeProfileSummaryPlayer,
                {
                  id: selectedTeamId || activeProfileSummaryPlayer.teamId,
                  teamName: selected?.teamName || "Team",
                  ageGroup: selected?.ageGroup || "",
                  seasonYear: selected?.seasonYear ?? seasonYear,
                  organizationId: targetOrg,
                },
                checks,
                profile.readiness,
                profile.completeCount,
                profile.total,
              );
              return <PlayerCardPanel card={card} compact />;
            })()}
          </div>
        </div>
      ) : null}

      {showTeamListImportModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Import Team List</h2>
                <p className="text-xs text-zinc-400">
                  Create or update teams for {seasonYear}. No teams are deleted.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTeamListImportModal(false)}
                disabled={teamListImportBusy}
                className="text-xs rounded-lg border border-zinc-700 px-3 py-1.5 disabled:opacity-60"
              >
                Close
              </button>
            </div>
            <WorkflowStepRow
              steps={TEAM_LIST_IMPORT_STEPS}
              currentIndex={teamListImportStepIndex}
              description="Upload or paste a CSV, review CREATE/UPDATE/SKIP actions, then confirm import."
            />
            {isFallBall ? (
              <div className="rounded-lg border border-sky-700/70 bg-sky-950/30 p-3 text-sm text-sky-100">
                Fall Ball teams use MLB team names instead of sponsors. Use an <code>MLB Team</code> column, or provide <code>Team Name</code> to override it.
              </div>
            ) : null}
            {teamListImportError ? (
              <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">
                {teamListImportError}
              </div>
            ) : null}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => void handleTeamListFile(event.target.files?.[0] || null)}
                    disabled={teamListImportBusy}
                    className="text-sm"
                  />
                  <SyncedDriveFileMenu
                    runs={syncedDriveRuns.TEAM_LIST}
                    loading={syncedDriveLoading.TEAM_LIST}
                    error={syncedDriveError.TEAM_LIST}
                    fetchingRunId={syncedDriveFetchingId}
                    disabled={teamListImportBusy}
                    onOpen={() => void loadSyncedDriveRuns("TEAM_LIST")}
                    onSelect={(run) => void applySyncedDriveFile(run, (file) => void handleTeamListFile(file))}
                  />
                  <button
                    type="button"
                    onClick={downloadTeamListTemplate}
                    className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
                  >
                    Download CSV Template
                  </button>
                  <button
                    type="button"
                    onClick={() => resetTeamListImport(teamListSampleCsv)}
                    disabled={teamListImportBusy}
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
                  >
                    Use Sample
                  </button>
                </div>
                <label className="block space-y-1">
                  <span className="text-xs uppercase tracking-wide text-zinc-400">CSV contents</span>
                  <textarea
                    value={teamListCsvText}
                    onChange={(event) => {
                      setTeamListCsvText(event.target.value);
                      setTeamListImportResult(null);
                      setTeamListImportStep("upload");
                    }}
                    rows={10}
                    disabled={teamListImportBusy}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs disabled:opacity-60"
                    placeholder={teamListSampleCsv}
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void previewTeamListImport()}
                    disabled={teamListImportBusy || !teamListCsvText.trim()}
                    className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
                  >
                    {teamListImportBusy ? "Working..." : "Preview Teams"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmTeamListImport()}
                    disabled={
                      teamListImportBusy ||
                      teamListImportStep !== "preview" ||
                      !teamListImportResult ||
                      teamListImportHasErrors
                    }
                    className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-950/30 disabled:opacity-60"
                  >
                    Confirm Import
                  </button>
                </div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300 space-y-2">
                <p className="font-semibold text-zinc-100">Supported columns</p>
                <p>Required: <code>Age Group</code> or <code>Division</code>. Use one of: {teamManagementAgeGroupOptions.join(", ")}.</p>
                <p>Team name: <code>Team Name</code> or <code>MLB Team</code>.</p>
                <p>For non-Fall Ball, rows can also build a name from <code>Sponsor</code> + <code>Head Coach Last Name</code> when Team Name is blank.</p>
                <p>Additional team details like notes and practice plans can be filled in later from Team Settings/Profile.</p>
                <pre className="overflow-x-auto rounded bg-zinc-950 p-2 text-[11px] text-zinc-400">{teamListSampleCsv}</pre>
              </div>
            </div>
            {teamListImportResult ? (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-6">
                  <StatusCountPill label="Rows" value={teamListImportResult.summary.total} valueClassName="text-xl font-semibold" />
                  <StatusCountPill label="Create" value={teamListImportResult.summary.create} valueClassName="text-xl font-semibold text-emerald-300" />
                  <StatusCountPill label="Update" value={teamListImportResult.summary.update} valueClassName="text-xl font-semibold text-sky-300" />
                  <StatusCountPill label="Skip" value={teamListImportResult.summary.skip} valueClassName="text-xl font-semibold text-zinc-300" />
                  <StatusCountPill label="Errors" value={teamListImportResult.summary.errors} valueClassName="text-xl font-semibold text-red-300" />
                  <StatusCountPill label="Warnings" value={teamListImportResult.summary.warnings} valueClassName="text-xl font-semibold text-amber-300" />
                </div>
                {teamListImportStep === "results" ? (
                  <div className="rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-200">
                    Import complete. Affected teams: {teamListImportResult.summary.affected ?? teamListImportResult.affectedTeams?.length ?? 0}.
                  </div>
                ) : null}
                <div className="max-h-80 overflow-auto rounded-lg border border-zinc-800">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-zinc-900 text-zinc-300">
                      <tr className="text-left">
                        <th className="px-3 py-2">Row</th>
                        <th className="px-3 py-2">Action</th>
                        <th className="px-3 py-2">Age Group</th>
                        <th className="px-3 py-2">Team Name</th>
                        <th className="px-3 py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamListImportResult.rows.map((row) => (
                        <tr key={`${row.rowNumber}-${row.teamName}`} className="border-t border-zinc-800 align-top">
                          <td className="px-3 py-2 text-zinc-400">{row.rowNumber}</td>
                          <td className="px-3 py-2 font-semibold">{row.action}</td>
                          <td className="px-3 py-2">{row.ageGroup || "-"}</td>
                          <td className="px-3 py-2">{row.teamName || "-"}</td>
                          <td className="px-3 py-2 space-y-1">
                            {row.errors.map((item) => (
                              <div key={`error-${item}`} className="text-red-300">Error: {item}</div>
                            ))}
                            {row.warnings.map((item) => (
                              <div key={`warning-${item}`} className="text-amber-300">Warning: {item}</div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showCoachImportModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-3xl rounded-2xl border border-zinc-700 bg-zinc-900 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Start Coach Import</h2>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/admin/users/import/template?${orgQuery}`}
                  className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5"
                >
                  Download Template
                </a>
                <button
                  type="button"
                  onClick={() => {
                    if (coachImportBusy || coachImportPreparing) return;
                    setShowCoachImportModal(false);
                  }}
                  className="text-xs rounded-lg border border-zinc-700 px-3 py-1.5"
                >
                  Close
                </button>
              </div>
            </div>
            {coachImportError ? (
              <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">
                {coachImportError}
              </div>
            ) : null}
            <WorkflowStepRow
              steps={COACH_IMPORT_STEPS}
              currentIndex={coachImportNotice ? 4 : coachImportBusy ? 3 : 0}
              description="Upload the coach export first. The next screen reviews imported age groups before the import runs."
            />
            <div className="rounded-lg border border-amber-700/80 bg-amber-950/20 p-3 text-xs text-amber-100 space-y-1">
              <p className="font-semibold">Coach auto-assignment preview</p>
              <p>
                Imported coaches can be matched to existing teams by mapped age group and team names. Review coach/team assignments after import, especially when team names differ between SportsConnect and the schedule.
              </p>
              <p>
                No live coach/team match preview is available before this import; unmatched team names are reported after the server finishes.
              </p>
            </div>
            {coachImportNotice ? (
              <div className="rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-300">
                {coachImportNotice}
              </div>
            ) : null}
            {(coachImportBusy || coachImportProcessedCount > 0) && coachImportTotalCount > 0 ? (
              <div className="rounded-lg border border-zinc-700 bg-zinc-950/60 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-300">
                  <span>
                    {coachImportBusy ? "Import running" : "Import complete"}
                    {coachImportBatchId ? ` · ${coachImportBatchId.slice(0, 8)}` : ""}
                  </span>
                  <span>
                    {coachImportProcessedCount}/{coachImportTotalCount}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(
                          100,
                          Math.round((coachImportProcessedCount / coachImportTotalCount) * 100),
                        ),
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(event) => setCoachImportFile(event.target.files?.[0] || null)}
                className="text-sm"
              />
              <SyncedDriveFileMenu
                runs={syncedDriveRuns.COACH_VOLUNTEER}
                loading={syncedDriveLoading.COACH_VOLUNTEER}
                error={syncedDriveError.COACH_VOLUNTEER}
                fetchingRunId={syncedDriveFetchingId}
                disabled={coachImportBusy || coachImportPreparing}
                onOpen={() => void loadSyncedDriveRuns("COACH_VOLUNTEER")}
                onSelect={(run) => void applySyncedDriveFile(run, setCoachImportFile)}
              />
              <button
                type="button"
                disabled={coachImportBusy || coachImportPreparing || !coachImportFile}
                onClick={() => void openCoachImportMapping()}
                className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                {coachImportPreparing
                  ? "Preparing Import..."
                  : coachImportBusy
                    ? "Importing..."
                    : "Start Coach Import"}
              </button>
              <button
                type="button"
                disabled={coachImportBusy}
                onClick={() => void undoCoachImport()}
                className="rounded-lg border border-amber-700 text-amber-300 px-4 py-2 text-sm disabled:opacity-60"
              >
                Undo Last Coach Import
              </button>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={autoAssignImportedCoaches}
                onChange={(event) => setAutoAssignImportedCoaches(event.target.checked)}
                disabled={coachImportBusy || coachImportPreparing}
              />
              Auto-assign imported coaches to matching teams
            </label>
            <p className="text-xs text-zinc-500">
              When enabled, the importer attempts assignment after creating coach accounts. Leave it off if an administrator wants to assign coaches manually after reviewing the roster.
            </p>
          </div>
        </div>
      ) : null}

      {showCoachImportMappingModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-zinc-700 bg-zinc-950 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">Coach Import Age Group Mapping</h3>
              <button
                type="button"
                onClick={() => {
                  if (coachImportBusy) return;
                  setShowCoachImportMappingModal(false);
                  setCoachMappingError("");
                }}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Close
              </button>
            </div>
            <WorkflowStepRow
              steps={COACH_IMPORT_STEPS}
              currentIndex={2}
              description="Map every imported age group, then preview the expected coach/team matching behavior before importing."
            />
            {coachMappingError ? (
              <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">
                {coachMappingError}
              </div>
            ) : null}
            <div className="rounded-lg border border-amber-700/80 bg-amber-950/20 p-3 text-xs text-amber-100 space-y-1">
              <p className="font-semibold">Preview coach/team matches</p>
              <p>
                This screen can confirm age-group mapping only. It does not have row-level coach/team preview data before import, so review assignments after the import completes.
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900">
                  <tr className="text-left text-zinc-300">
                    <th className="px-3 py-2">Imported Age Group</th>
                    <th className="px-3 py-2">Schedule Age Group</th>
                  </tr>
                </thead>
                <tbody>
                  {coachImportedAgeGroups.map((group) => (
                    <tr key={group} className="border-t border-zinc-800">
                      <td className="px-3 py-2">{group}</td>
                      <td className="px-3 py-2">
                        <select
                          value={coachAgeGroupMapping[group] || ""}
                          onChange={(event) =>
                            setCoachAgeGroupMapping((current) => ({
                              ...current,
                              [group]: event.target.value,
                            }))
                          }
                          className="w-full rounded bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm"
                        >
                          <option value="">Select age group…</option>
                          {scheduleAgeGroupOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={coachImportBusy}
                onClick={() => void confirmCoachImportWithMapping()}
                className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                {coachImportBusy ? "Importing..." : "Start Coach Import"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPlayersImportModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-4xl rounded-2xl border border-zinc-700 bg-zinc-900 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                {isFallBall ? "SportsConnect Player Import" : "Players Import"}
              </h2>
              <div className="flex items-center gap-2">
                <a
                  href={`/api/admin/teams/import/template?${orgQuery}`}
                  className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5"
                >
                  Download Template
                </a>
                <button
                  type="button"
                  onClick={() => {
                    if (busy || importPreparing) return;
                    setShowPlayersImportModal(false);
                  }}
                  className="text-xs rounded-lg border border-zinc-700 px-3 py-1.5"
                >
                  Close
                </button>
              </div>
            </div>
            <WorkflowStepRow
              steps={PLAYER_IMPORT_STEPS}
              currentIndex={importStatus ? (busy ? 3 : 4) : 0}
              description="Upload the player file, review mappings and preview rows, then import and review results before leaving the workflow."
            />
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(event) => setImportFile(event.target.files?.[0] || null)}
                className="text-sm"
              />
              <SyncedDriveFileMenu
                runs={syncedDriveRuns.PLAYER_REG}
                loading={syncedDriveLoading.PLAYER_REG}
                error={syncedDriveError.PLAYER_REG}
                fetchingRunId={syncedDriveFetchingId}
                disabled={busy || importPreparing}
                onOpen={() => void loadSyncedDriveRuns("PLAYER_REG")}
                onSelect={(run) => void applySyncedDriveFile(run, setImportFile)}
              />
              <button
                type="button"
                disabled={busy || importPreparing || !importFile}
                onClick={() => void openImportMapping()}
                className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                {importPreparing ? "Preparing Import..." : "Start Player Import"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void undoPreviousImport()}
                className="rounded-lg border border-amber-700 text-amber-300 px-4 py-2 text-sm disabled:opacity-60"
              >
                Undo Last Player Import
              </button>
              {activeImportBatchId && busy ? (
                <button
                  type="button"
                  onClick={() => setStopImportRequested(true)}
                  className="rounded-lg border border-red-700 text-red-300 px-4 py-2 text-sm"
                >
                  Stop Import
                </button>
              ) : null}
            </div>
            {importStatus ? (
              <div
                className={`rounded-lg border p-3 text-xs space-y-2 ${
                  importStatus.status === "RUNNING"
                    ? "border-emerald-700/80 bg-emerald-950/25 text-emerald-300"
                    : "border-zinc-700 bg-zinc-950/50 text-zinc-300"
                }`}
              >
                <p>
                  Live Status: {importStatus.status} · {importStatus.processedRows}/
                  {importStatus.totalRows} rows
                </p>
                <div className="h-1.5 w-full rounded-full bg-zinc-800/90 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      importStatus.status === "RUNNING"
                        ? "bg-emerald-400"
                        : "bg-brand-purple"
                    }`}
                    style={{ width: `${getImportProgressPercent(importStatus)}%` }}
                  />
                </div>
                <p>
                  Teams +{importStatus.createdTeams} · Players +{importStatus.createdPlayers} · Updated{" "}
                  {importStatus.updatedPlayers} · Skipped {importStatus.skippedRows}
                </p>
              </div>
            ) : null}
            {undoImportStatus ? (
              <div
                className={`rounded-lg border p-3 text-xs space-y-2 ${
                  undoImportStatus.status === "RUNNING"
                    ? "border-amber-700/80 bg-amber-950/20 text-amber-200"
                    : "border-zinc-700 bg-zinc-950/50 text-zinc-300"
                }`}
              >
                <p>{undoImportStatus.message}</p>
                <div className="h-1.5 w-full rounded-full bg-zinc-800/90 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      undoImportStatus.status === "RUNNING" ? "bg-amber-400 animate-pulse" : "bg-brand-purple"
                    }`}
                    style={{ width: `${undoImportStatus.progress}%` }}
                  />
                </div>
              </div>
            ) : null}
            {importSkippedDetails.length > 0 ? (
              <div className="rounded-lg border border-amber-700/80 bg-amber-950/20 p-3 text-xs text-amber-200 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">
                    Skipped Player Rows ({importSkippedDetails.length}
                    {importSkippedDetails.length >= 20 ? "+" : ""})
                  </p>
                  <button
                    type="button"
                    onClick={downloadSkippedRowsCsv}
                    className="rounded border border-amber-700 px-2 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-900/30"
                  >
                    Download Skipped Player Rows CSV
                  </button>
                </div>
                <div className="space-y-1">
                  {importSkippedDetails.slice(0, 10).map((item, idx) => (
                    <p key={`${item.rowNumber ?? "unknown"}-${idx}`}>
                      Row {item.rowNumber ?? "?"}: {item.reason}
                      {item.playerName ? ` · ${item.playerName}` : ""}
                      {item.ageGroup ? ` · ${item.ageGroup}` : ""}
                      {item.teamName ? ` · ${item.teamName}` : ""}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
            <p className="text-xs text-zinc-400">
              Before import, map each Division Name to a schedule age group, choose the exact target scope, and review the preview before starting.
              {isFallBall
                ? " SportsConnect registration reports can be uploaded directly as CSV, XLSX, or XLS files; umpire, tee ball, and other skipped divisions are excluded before preview, and out-of-scope rows are reported instead of imported."
                : " Rows outside the confirmed age group/team are skipped and reported instead of imported."}
            </p>
            <p className="text-xs text-zinc-400">
              Required in file: division/age group, team, player name (and program/season if not inferred
              from the page season year). Optional: Jersey Number, phone, email, guardian contact,
              registration order, jersey size, address, waiver, and other profile fields.
            </p>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Recent Import History</h3>
                <button
                  type="button"
                  onClick={() => void loadImportHistory()}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  Refresh
                </button>
              </div>
              <div className="overflow-auto rounded-lg border border-zinc-800">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-900 text-zinc-300">
                    <tr className="text-left">
                      <th className="px-3 py-2">Started / administrator</th>
                      <th className="px-3 py-2">Status / undo</th>
                      <th className="px-3 py-2">Rows</th>
                      <th className="px-3 py-2">What changed</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importHistory.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-3 text-zinc-500">
                          No imports yet.
                        </td>
                      </tr>
                    ) : (
                      importHistory.map((item) => (
                        <tr key={item.id} className="border-t border-zinc-800">
                          <td className="px-3 py-2">
                            <div>{new Date(item.createdAt).toLocaleString()}</div>
                            <div className="text-zinc-500">By {getImportHistoryActor(item)}</div>
                          </td>
                          <td className="px-3 py-2">
                            <div>{item.undoneAt ? "UNDONE" : item.status || "Status unavailable"}</div>
                            <div className="text-zinc-500">{getImportHistoryUndoText(item)}</div>
                          </td>
                          <td className="px-3 py-2">
                            {item.processedRows}/{item.totalRows || "unknown"}
                          </td>
                          <td className="px-3 py-2">
                            <div>{getImportHistoryWhat(item)}</div>
                            <div className="text-zinc-500">
                              +{item.createdTeams} teams, +{item.createdPlayers} players, {item.updatedPlayers} updated, {item.skippedRows} skipped
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              disabled={busy || Boolean(item.undoneAt)}
                              onClick={() => setPendingUndoImport(item)}
                              className="rounded border border-amber-700 px-2 py-1 text-amber-300 disabled:opacity-50"
                            >
                              Undo
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showImportMappingModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-5xl max-h-[90vh] overflow-auto rounded-xl border border-zinc-700 bg-zinc-950 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">Division to Age Group Mapping</h3>
              <button
                type="button"
                onClick={() => {
                  setShowImportMappingModal(false);
                  setMappingError("");
                }}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Close
              </button>
            </div>
            <WorkflowStepRow
              steps={PLAYER_IMPORT_STEPS}
              currentIndex={2}
              description="Review division mappings, confirmed scope, skipped divisions, and the first preview rows before starting the import."
            />
            <SportsConnectDetectionBanner detection={scDetection} />
            <SportsConnectPresetBar
              presets={scPresets}
              selectedPresetId={scSelectedPresetId}
              presetName={scPresetName}
              busy={scPresetBusy}
              notice={scPresetNotice}
              error={scPresetError}
              onSelectPresetId={setScSelectedPresetId}
              onPresetNameChange={setScPresetName}
              onApplyPreset={applySportsConnectPreset}
              onSavePreset={() => void saveSportsConnectPreset()}
            />
            {mappingError ? (
              <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">
                {mappingError}
              </div>
            ) : null}
            <div className="rounded-lg border border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900">
                  <tr className="text-left text-zinc-300">
                    <th className="px-3 py-2">Imported Division</th>
                    <th className="px-3 py-2">Schedule Age Group</th>
                  </tr>
                </thead>
                <tbody>
                  {importedDivisions.map((division) => (
                    <tr key={division} className="border-t border-zinc-800">
                      <td className="px-3 py-2">{division}</td>
                      <td className="px-3 py-2">
                        <select
                          value={divisionMapping[division] || ""}
                          onChange={(event) =>
                            setDivisionMapping((current) => ({
                              ...current,
                              [division]: event.target.value,
                            }))
                          }
                          className="w-full rounded bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm"
                        >
                          <option value="">Select age group…</option>
                          {scheduleAgeGroupOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-amber-700 bg-amber-950/20 p-4 space-y-3">
              <p className="text-sm font-semibold text-amber-200">
                Import scope confirmation (required)
              </p>
              <p className="text-xs text-amber-100/80">
                Confirm the exact age group and team (or All Teams) so out-of-scope rows are skipped
                and reported. Jersey Number is optional in your spreadsheet; leave blank if unknown.
              </p>
              <p className="text-xs text-zinc-300/80">
                Tip: select <span className="text-zinc-100 font-medium">All Mapped Age Groups</span> to
                skip per-age-group runs for mixed-division files.
              </p>
              <div className="grid md:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-wide text-zinc-400">Import into this age group</span>
                  <select
                    value={confirmedImportAgeGroup}
                    onChange={(event) => {
                      const next = event.target.value;
                      setConfirmedImportAgeGroup(next);
                      setConfirmedImportTeamName(next === "__ALL_AGE_GROUPS__" ? "__ALL__" : "");
                    }}
                    className="w-full rounded bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm"
                  >
                    <option value="">Select age group…</option>
                    <option value="__ALL_AGE_GROUPS__">All Mapped Age Groups</option>
                    {scheduleAgeGroupOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-wide text-zinc-400">Import into this team</span>
                  <select
                    value={confirmedImportTeamName}
                    onChange={(event) => setConfirmedImportTeamName(event.target.value)}
                    disabled={!confirmedImportAgeGroup || allAgesSelected}
                    className="w-full rounded bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm disabled:opacity-60"
                  >
                    <option value="">
                      {allAgesSelected
                        ? "All Teams auto-selected"
                        : confirmedImportAgeGroup
                          ? "Select team…"
                          : "Select age group first"}
                    </option>
                    {confirmedImportAgeGroup ? <option value="__ALL__">All Teams</option> : null}
                    {importConfirmedTeamNameOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {confirmedImportAgeGroup ? (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-zinc-400">
                    {importUpdateExistingOnly
                      ? "Unmatched Imported Team Mapping"
                      : "Teams in this import"}
                  </p>
                  {importUpdateExistingOnly ? (
                    <p className="text-xs text-zinc-500">
                      Unmatched team mapping connects spreadsheet team names to existing teams so updates land on the right roster. Rows stay skipped until every unmatched name is mapped.
                    </p>
                  ) : null}
                  {!importUpdateExistingOnly ? (
                    importedTeamNamesForConfirmedAgeGroup.length === 0 ? (
                      <p className="text-xs text-zinc-400">No team names found in rows for this scope.</p>
                    ) : (
                      <p className="text-xs text-emerald-300">
                        {importedTeamNamesForConfirmedAgeGroup.length} team
                        {importedTeamNamesForConfirmedAgeGroup.length === 1 ? "" : "s"} will be
                        created from the file if missing:{" "}
                        {importedTeamNamesForConfirmedAgeGroup.join(", ")}
                      </p>
                    )
                  ) : unmatchedImportedTeamsForConfirmedAgeGroup.length === 0 ? (
                    <p className="text-xs text-emerald-300">
                      All imported team names already match existing teams for this age group.
                    </p>
                  ) : (
                    <div className="rounded-lg border border-zinc-800 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-zinc-900 text-zinc-300">
                          <tr className="text-left">
                            <th className="px-3 py-2">Imported Team Name</th>
                            <th className="px-3 py-2">Map to Existing Team</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unmatchedImportedTeamsForConfirmedAgeGroup.map((rawTeam) => (
                            <tr key={rawTeam} className="border-t border-zinc-800">
                              <td className="px-3 py-2">{rawTeam}</td>
                              <td className="px-3 py-2">
                                <select
                                  value={teamMapping[rawTeam] || ""}
                                  onChange={(event) =>
                                    setTeamMapping((current) => ({
                                      ...current,
                                      [rawTeam]: event.target.value,
                                    }))
                                  }
                                  className="w-full rounded bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-xs"
                                >
                                  <option value="">Select team…</option>
                                  {existingImportTeamsForAgeGroup.map((teamName) => (
                                    <option key={teamName} value={teamName}>
                                      {teamName}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : null}
              <label className="space-y-1 block max-w-xs">
                <span className="text-xs uppercase tracking-wide text-zinc-400">
                  All-Star Age Cutoff Date (season)
                </span>
                <input
                  type="date"
                  value={allStarCutoffDate}
                  onChange={(event) => setAllStarCutoffDate(event.target.value)}
                  className="w-full rounded bg-zinc-900 border border-zinc-700 px-2 py-1.5 text-sm"
                  title="Used to calculate each player&apos;s All-Star age band for this season."
                />
                <span className="block text-[11px] text-zinc-500">
                  Used to calculate each player&apos;s All-Star age band for this season. Confirm this before importing birth dates.
                </span>
              </label>
              <label
                className="inline-flex items-center gap-2 text-xs text-zinc-300"
                title="Use this when rosters already exist and the file should only refresh matching player records."
              >
                <input
                  type="checkbox"
                  checked={importUpdateExistingOnly}
                  onChange={(event) => setImportUpdateExistingOnly(event.target.checked)}
                />
                Only update players already on rosters (do not create teams or players)
              </label>
              <p className="text-xs text-zinc-500">
                Turn this on when an administrator wants to refresh existing roster records only. New teams and players from the file will be skipped instead of created.
              </p>
              {!importUpdateExistingOnly ? (
                <p className="text-xs text-amber-200/90">
                  This import will create missing teams and players from the file. Use Undo in import
                  history if you need to roll back.
                </p>
              ) : null}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300 space-y-1">
                <p>
                  Rows in file: <span className="font-semibold text-zinc-100">{importConfirmationCounts.total}</span>
                </p>
                <p>
                  Rows matching confirmed age group + team:{" "}
                  <span className="font-semibold text-emerald-300">{importConfirmationCounts.matching}</span>
                </p>
                <p>
                  Rows that will be skipped as out-of-scope:{" "}
                  <span className="font-semibold text-amber-300">{importConfirmationCounts.outOfScope}</span>
                </p>
                <p>
                  Matching rows missing guardian email:{" "}
                  <span
                    className={`font-semibold ${
                      importConfirmationCounts.matchingMissingGuardianEmail > 0
                        ? "text-amber-300"
                        : "text-emerald-300"
                    }`}
                  >
                    {importConfirmationCounts.matchingMissingGuardianEmail}
                  </span>
                  <span className="ml-1 text-zinc-500">
                    (needed later for parent Player Cards)
                  </span>
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-zinc-200">Import Preview (first 25 rows)</h4>
              <div className="max-h-72 overflow-auto rounded-lg border border-zinc-800">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-900 text-zinc-300">
                    <tr className="text-left">
                      <th className="px-3 py-2">Division</th>
                      <th className="px-3 py-2">Team</th>
                      <th className="px-3 py-2">Player</th>
                      <th className="px-3 py-2">User Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreviewRows.map((row, index) => (
                      <tr key={`${row.teamName}-${row.playerName}-${index}`} className="border-t border-zinc-800">
                        <td className="px-3 py-2">{row.divisionName || "—"}</td>
                        <td className="px-3 py-2">{row.teamName || "—"}</td>
                        <td className="px-3 py-2">{row.playerName || "—"}</td>
                        <td className="px-3 py-2">{row.userEmail || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {importPreviewSkippedDivisionDetails.length > 0 ? (
              <div className="rounded-lg border border-amber-700/80 bg-amber-950/20 p-3 text-xs text-amber-200 space-y-2">
                <p className="font-semibold">
                  Skipped divisions before import: {importPreviewSkippedDivisionDetails.length}
                </p>
                <p>
                  These rows were excluded from the preview and will not be sent to import because their divisions are intentionally skipped.
                </p>
                <div className="space-y-1">
                  {importPreviewSkippedDivisionDetails.slice(0, 5).map((item, idx) => (
                    <p key={`${item.rowNumber ?? "unknown"}-${idx}`}>
                      Row {item.rowNumber ?? "?"}: {item.ageGroup || "division unavailable"}
                      {item.playerName ? ` / ${item.playerName}` : ""}
                      {item.teamName ? ` / ${item.teamName}` : ""}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowImportMappingModal(false);
                  setMappingError("");
                }}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  busy ||
                  !confirmedImportAgeGroup.trim() ||
                  !confirmedImportTeamName.trim()
                }
                onClick={() => void confirmImportWithMapping()}
                className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                Start Player Import
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SendEmailModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        targetOrg={targetOrg}
        isMasterAdmin={isMaster}
        contacts={players
          .filter((p) => selectedGuardians.selected.has(p.id) && p.guardianEmail)
          .map((p) => ({
            email: p.guardianEmail as string,
            name: [p.guardianFirstName, p.guardianLastName].filter(Boolean).join(" ") || null,
            sourceType: "TEAM_PLAYER_GUARDIAN",
            sourceId: p.id,
          }))}
        onSent={(result) => {
          if (typeof result.sent === "number") {
            setNotice(`Email sent. Delivered ${result.sent}; failed ${result.failed ?? 0}.`);
          } else {
            setNotice(
              `Campaign created and submitted for approval (${result.recipients ?? selectedGuardians.size} recipients). Open Communications to track it.`,
            );
          }
          selectedGuardians.clear();
        }}
      />
    </section>
  );
}
