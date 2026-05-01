"use client";

import { useEffect, useMemo, useState } from "react";

import type { ContentOrgId } from "@/lib/siteConfig";

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
};
type CoachImportUndoData = {
  importBatchId?: string;
};

function getImportProgressPercent(status: ImportJobStatus | null) {
  if (!status) return 0;
  if (!status.totalRows || status.totalRows <= 0) return 0;
  return Math.max(
    0,
    Math.min(100, Math.round((status.processedRows / status.totalRows) * 100)),
  );
}

function shouldSkipDivisionImport(divisionName: string) {
  const normalized = divisionName.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("modified tee ball")) return false;
  if (normalized.includes("umpire")) return true;
  if (normalized.includes("little league tee ball")) return true;
  if (normalized.includes("little league teeball")) return true;
  if (normalized.includes("3-4 year-old")) return true;
  if (normalized.includes("3-4 year olds")) return true;
  if (normalized.includes("3/4 year-old")) return true;
  if (normalized.includes("5 year-old")) return true;
  if (normalized.includes("5 year olds")) return true;
  return false;
}

function buildTeamNameFromSponsor(sponsor: string, headCoachLastName: string) {
  const normalizedSponsor = sponsor.trim();
  const normalizedLastName = headCoachLastName.trim();
  if (!normalizedSponsor || !normalizedLastName) return "";
  return `${normalizedSponsor} - ${normalizedLastName}`;
}

export default function AdminTeamsManager({ targetOrg }: { targetOrg: ContentOrgId }) {
  const orgQuery = `org=${targetOrg}`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
  const [showImportMappingModal, setShowImportMappingModal] = useState(false);
  const [showPlayersImportModal, setShowPlayersImportModal] = useState(false);
  const [showCoachImportModal, setShowCoachImportModal] = useState(false);
  const [showCoachImportMappingModal, setShowCoachImportMappingModal] = useState(false);
  const [importedDivisions, setImportedDivisions] = useState<string[]>([]);
  const [scheduleAgeGroupOptions, setScheduleAgeGroupOptions] = useState<string[]>([]);
  const [divisionMapping, setDivisionMapping] = useState<DivisionMapping>({});
  const [mappingError, setMappingError] = useState("");
  const [importPreviewRows, setImportPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [importStatus, setImportStatus] = useState<ImportJobStatus | null>(null);
  const [activeImportBatchId, setActiveImportBatchId] = useState<string | null>(null);
  const [importRows, setImportRows] = useState<Record<string, unknown>[]>([]);
  const [stopImportRequested, setStopImportRequested] = useState(false);
  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>([]);
  const [pendingUndoImport, setPendingUndoImport] = useState<ImportHistoryItem | null>(null);
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
      Array.from(new Set(teamsForSelectedSeason.map((team) => team.ageGroup))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [teamsForSelectedSeason],
  );
  const filteredTeamOptions = useMemo(() => {
    if (!teamFilterAgeGroup) return teamsForSelectedSeason;
    return teamsForSelectedSeason.filter((team) => team.ageGroup === teamFilterAgeGroup);
  }, [teamsForSelectedSeason, teamFilterAgeGroup]);

  useEffect(() => {
    void loadTeams();
    void loadCoachOptions(selectedTeamId || undefined);
    void loadImportHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetOrg, selectedTeamId]);

  useEffect(() => {
    void loadTeamSetupAgeGroupOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetOrg, seasonYear]);

  useEffect(() => {
    if (!selectedTeamId) {
      setPlayers([]);
      setAssignments([]);
      setTeamContactNotes("");
      setTeamPracticePlan("");
      return;
    }
    void loadTeamDetails(selectedTeamId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamId]);

  useEffect(() => {
    if (teamFilterSeasonYear || teamFilterSeasonOptions.length === 0) return;
    setTeamFilterSeasonYear(String(teamFilterSeasonOptions[0]));
  }, [teamFilterSeasonYear, teamFilterSeasonOptions]);

  useEffect(() => {
    setSelectedTeamId((current) =>
      current && filteredTeamOptions.some((team) => team.id === current)
        ? current
        : filteredTeamOptions[0]?.id || "",
    );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeImportBatchId, busy, orgQuery]);

  async function safeJson(response: Response) {
    const text = await response.text();
    if (!text.trim()) return {};
    return JSON.parse(text) as Record<string, unknown>;
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

  async function loadTeamSetupAgeGroupOptions() {
    try {
      const response = await fetch(
        `/api/admin/age-groups?org=${targetOrg}&seasonYear=${seasonYear}`,
        { cache: "no-store" },
      );
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
      setSetupAgeGroupOptions(options);
      setAgeGroup((current) =>
        current && options.includes(current) ? current : options[0] || "",
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load age groups");
      setSetupAgeGroupOptions([]);
    }
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

  async function removeTeam(teamId: string) {
    if (!window.confirm("Delete this team and all roster/coach assignments?")) return;
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
          }),
        });
        const chunkJson = await safeJson(chunkRes);
        if (!chunkRes.ok) throw new Error(String(chunkJson.error || "Chunk import failed"));
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
        setNotice(
          `Players import complete: ${finalStatus?.createdTeams || 0} teams created, ${finalStatus?.createdPlayers || 0} players created, ${finalStatus?.updatedPlayers || 0} updated, ${finalStatus?.skippedRows || 0} skipped.`,
        );
        setImportFile(null);
        await loadImportHistory();
        window.location.reload();
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
    const response = await fetch(`/api/admin/age-groups?${orgQuery}&seasonYear=${seasonYear}`, {
      cache: "no-store",
    });
    const json = await safeJson(response);
    if (!response.ok) {
      throw new Error(String(json.error || "Failed to load schedule age groups"));
    }
    const raw = Array.isArray(json.ageGroups) ? (json.ageGroups as unknown[]) : [];
    const options = raw
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim());
    setScheduleAgeGroupOptions(options);
    return options;
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
      return { divisions: [] as string[], preview: [] as ImportPreviewRow[], rows: [] as Record<string, unknown>[] };
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
      defval: "",
      raw: false,
    });

    const divisionSet = new Set<string>();
    const preview: ImportPreviewRow[] = [];
    const filteredRows: Record<string, unknown>[] = [];
    for (const row of rows) {
      const divisionName = String(
        row["Division Name"] || row["Age Group"] || row["age_group"] || "",
      ).trim();
      if (shouldSkipDivisionImport(divisionName)) {
        continue;
      }
      filteredRows.push(row);
      const teamName = String(
        row["Team Name"] || row["assigned_team"] || row["ASSIGNED_TEAM"] || "",
      ).trim();
      const playerName = [
        String(row["Player First Name"] || row["First Name"] || "").trim(),
        String(row["Player Last Name"] || row["Last Name"] || "").trim(),
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
      const userEmail = String(row["User Email"] || row["Email"] || "").trim();
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
    };
  }

  async function openImportMapping() {
    if (!importFile) return;
    setImportPreparing(true);
    setError("");
    setNotice("");
    setMappingError("");
    try {
      const [scheduleOptions, extracted] = await Promise.all([
        loadScheduleAgeGroupOptions(),
        extractImportPreview(importFile),
      ]);
      const lookup = new Map(scheduleOptions.map((item) => [item.toLowerCase(), item]));
      const initialMapping: DivisionMapping = {};
      for (const division of extracted.divisions) {
        initialMapping[division] = lookup.get(division.toLowerCase()) || "";
      }
      setImportedDivisions(extracted.divisions);
      setImportPreviewRows(extracted.preview);
      setImportRows(extracted.rows);
      setDivisionMapping(initialMapping);
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
    setShowImportMappingModal(false);
    setMappingError("");
    setImportStatus(null);
    await importPlayers(divisionMapping);
  }

  async function undoPreviousImport() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/teams/import?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "undo" }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to undo import"));
      setNotice("Previous import has been undone.");
      await loadImportHistory();
      window.location.reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to undo import");
    } finally {
      setBusy(false);
    }
  }

  async function undoImportById(batchId: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/teams/import?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "undo", batchId }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to undo selected import"));
      setNotice("Import undone.");
      await loadImportHistory();
      window.location.reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to undo selected import");
    } finally {
      setBusy(false);
    }
  }

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

  function getPlayerProfileCompleteness(player: TeamPlayer) {
    const checks = [
      {
        label: "Guardian contact",
        ok: Boolean(player.guardianEmail || player.guardianPhone || player.contactPhone),
      },
      { label: "Payment status", ok: Boolean(player.paymentStatus) },
      { label: "Birth certificate status", ok: Boolean(player.birthCertificateStatus) },
      { label: "Liability waiver", ok: player.liabilityWaiverAccepted === true },
      { label: "Code of conduct", ok: player.codeOfConductAccepted === true },
      { label: "Refund policy", ok: player.refundPolicyAccepted === true },
      { label: "Medical authorization", ok: player.medicalTreatmentAuthorized === true },
    ];
    const completeCount = checks.filter((check) => check.ok).length;
    const total = checks.length;
    return {
      completeCount,
      total,
      isComplete: completeCount === total,
      missingLabels: checks.filter((check) => !check.ok).map((check) => check.label),
    };
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
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Teams Setup</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCoachImportModal(true)}
              className="text-xs rounded-lg border border-zinc-600 text-zinc-200 hover:bg-zinc-800 px-3 py-1.5 font-semibold"
            >
              Import Coaches
            </button>
            <button
              type="button"
              onClick={() => setShowPlayersImportModal(true)}
              className="text-xs rounded-lg border border-brand-purple text-brand-purple hover:bg-brand-purple/10 px-3 py-1.5 font-semibold"
            >
              Import Players
            </button>
          </div>
        </div>
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
            Save Team
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          Team name format:{" "}
          <code className="text-zinc-300">{`{SPONSOR} - {HEAD COACH LAST NAME}`}</code>
          {buildTeamNameFromSponsor(sponsorName, headCoachLastName)
            ? ` → ${buildTeamNameFromSponsor(sponsorName, headCoachLastName)}`
            : ""}
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

      {pendingUndoImport ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-xl rounded-xl border border-zinc-700 bg-zinc-950 p-5 space-y-4">
            <h3 className="text-base font-semibold">Confirm Import Undo</h3>
            <p className="text-sm text-zinc-300">
              This will rollback this import batch and restore the previous state for players it updated.
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
              <button
                type="button"
                onClick={() => setPendingUndoImport(null)}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const selected = pendingUndoImport;
                  setPendingUndoImport(null);
                  if (!selected) return;
                  await undoImportById(selected.id);
                }}
                className="rounded-lg border border-amber-700 px-4 py-2 text-sm text-amber-300 hover:bg-amber-950/30 disabled:opacity-60"
              >
                Confirm Undo
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedTeam ? (
        <>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Roster</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!isEditingRoster}
                  onClick={() => setShowCoachAssignmentsModal(true)}
                  className="rounded-lg border border-brand-purple text-brand-purple hover:bg-brand-purple/10 px-3 py-1.5 text-xs disabled:opacity-50"
                  title={
                    isEditingRoster
                      ? "Manage coach assignments"
                      : "Click Edit first to manage assigned coaches"
                  }
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
            <div className="space-y-2">
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
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">First Name</th>
                      <th className="px-3 py-2">Last Name</th>
                      <th className="px-3 py-2">Phone</th>
                      <th className="px-3 py-2">Size</th>
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
              return (
                <>
                  <p className="text-sm text-zinc-300">
                    Score: {profile.completeCount}/{profile.total}
                  </p>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-300">
                    {profile.missingLabels.length === 0
                      ? "All profile checks are complete."
                      : `Missing: ${profile.missingLabels.join(", ")}`}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      {showCoachImportModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-3xl rounded-2xl border border-zinc-700 bg-zinc-900 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Import Coaches</h2>
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
                    : "Import Coaches"}
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
            {coachMappingError ? (
              <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">
                {coachMappingError}
              </div>
            ) : null}
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
                {coachImportBusy ? "Importing..." : "Import Coaches"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPlayersImportModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-4xl rounded-2xl border border-zinc-700 bg-zinc-900 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Players Import</h2>
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
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(event) => setImportFile(event.target.files?.[0] || null)}
                className="text-sm"
              />
              <button
                type="button"
                disabled={busy || importPreparing || !importFile}
                onClick={() => void openImportMapping()}
                className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                {importPreparing ? "Preparing Import..." : "Import Players"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void undoPreviousImport()}
                className="rounded-lg border border-amber-700 text-amber-300 px-4 py-2 text-sm disabled:opacity-60"
              >
                Undo Previous Import
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
            <p className="text-xs text-zinc-400">
              Before import, you will map each Division Name to a schedule age group and review a preview.
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
                      <th className="px-3 py-2">Started</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Progress</th>
                      <th className="px-3 py-2">Result</th>
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
                          <td className="px-3 py-2">{new Date(item.createdAt).toLocaleString()}</td>
                          <td className="px-3 py-2">
                            {item.undoneAt ? "UNDONE" : item.status}
                          </td>
                          <td className="px-3 py-2">
                            {item.processedRows}/{item.totalRows}
                          </td>
                          <td className="px-3 py-2">
                            +{item.createdTeams} teams, +{item.createdPlayers} players, {item.updatedPlayers} updated, {item.skippedRows} skipped
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
                disabled={busy}
                onClick={() => void confirmImportWithMapping()}
                className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
              >
                Confirm Import
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
