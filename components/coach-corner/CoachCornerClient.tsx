"use client";

import { useEffect, useMemo, useState } from "react";
import type { ContentOrgId } from "@/lib/siteConfig";

type TeamPlayer = {
  id: string;
  fullName: string;
  contactPhone: string | null;
  guardianFirstName: string | null;
  guardianLastName: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
  gender: string | null;
  birthDate: string | null;
  jerseySize: string | null;
  paymentStatus: string | null;
  birthCertificateStatus: string | null;
  medicalConditionsSummary: string | null;
  medicalConditionsDetails: string | null;
  medicalTreatmentAuthorized: boolean | null;
  rosterStatus: string | null;
  jerseyNumber: string | null;
};

type TeamCoachAssignment = {
  id: string;
  role: "HEAD_COACH" | "ASSISTANT_COACH";
  registeredUser: CoachProfile;
};

type CoachProfile = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  abuseAwarenessTrainingCertificateUrl: string | null;
  abuseAwarenessTrainingCertificateFileName: string | null;
  abuseAwarenessTrainingCertificateMimeType: string | null;
  abuseAwarenessTrainingCertificateUploadedAt: string | null;
};

type TeamRecord = {
  id: string;
  seasonYear: number;
  ageGroup: string;
  teamName: string;
  contactNotes: string | null;
  practicePlan: string | null;
  players: TeamPlayer[];
  coachAssignments: TeamCoachAssignment[];
};

type ScheduleGame = {
  id: number | string;
  home_team?: string | null;
  away_team?: string | null;
  start_time?: string | null;
  localized_time?: string | null;
  age_group?: string | null;
  subvenue?: string | null;
  gameNote?: {
    note: string | null;
    availabilityNote: string | null;
  } | null;
};

export default function CoachCornerClient({ targetOrg }: { targetOrg: ContentOrgId }) {
  const orgQuery = `org=${targetOrg}`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [teamFilterSeasonYear, setTeamFilterSeasonYear] = useState("");
  const [teamFilterAgeGroup, setTeamFilterAgeGroup] = useState("");
  const [teamContactNotes, setTeamContactNotes] = useState("");
  const [teamPracticePlan, setTeamPracticePlan] = useState("");
  const [scheduleGames, setScheduleGames] = useState<ScheduleGame[]>([]);
  const [gameNotes, setGameNotes] = useState<Record<string, string>>({});
  const [availabilityNotes, setAvailabilityNotes] = useState<Record<string, string>>({});
  const [isActorAdmin, setIsActorAdmin] = useState(false);
  const [actorRegisteredUserId, setActorRegisteredUserId] = useState<string | null>(null);
  const [actorCoach, setActorCoach] = useState<CoachProfile | null>(null);
  const [aatUploadingCoachId, setAatUploadingCoachId] = useState<string | null>(null);
  const [activeProfilePlayerId, setActiveProfilePlayerId] = useState<string | null>(null);
  const [activeProfileSummaryPlayerId, setActiveProfileSummaryPlayerId] = useState<string | null>(
    null,
  );
  const [isEditingTeamProfile, setIsEditingTeamProfile] = useState(false);
  const [isEditingRoster, setIsEditingRoster] = useState(false);

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) || null,
    [teams, selectedTeamId],
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

  function getPlayerProfileCompleteness(player: TeamPlayer) {
    const checks = [
      {
        label: "Guardian contact",
        ok: Boolean(player.guardianEmail || player.guardianPhone || player.contactPhone),
      },
      { label: "Payment status", ok: Boolean(player.paymentStatus) },
      { label: "Birth certificate status", ok: Boolean(player.birthCertificateStatus) },
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
    const normalized = String(value || "").trim();
    if (!normalized) return "";
    const lower = normalized.toLowerCase();
    if (lower.startsWith("adult small")) return "AS";
    if (lower.startsWith("adult medium")) return "AM";
    if (lower.startsWith("adult large")) return "AL";
    if (lower.startsWith("adult xl")) return "AXL";
    if (lower.startsWith("youth small")) return "YS";
    if (lower.startsWith("youth medium")) return "YM";
    if (lower.startsWith("youth large")) return "YL";
    if (lower.startsWith("youth xl")) return "YXL";
    return normalized.toUpperCase().slice(0, 3);
  }

  function getRosterStatusIndicator(value: string | null) {
    const normalized = (value || "").trim().toLowerCase();
    const isCompleted = normalized.includes("completed");
    const isNotVerified = normalized.includes("not verified");
    if (isCompleted && isNotVerified) {
      return {
        icon: "✓",
        className: "text-amber-400",
        label: "Completed | Not Verified",
      };
    }
    if (isCompleted) {
      return {
        icon: "✓",
        className: "text-emerald-400",
        label: "Completed",
      };
    }
    return {
      icon: "•",
      className: "text-zinc-500",
      label: value || "No status",
    };
  }

  useEffect(() => {
    const id = window.setTimeout(() => void loadTeams(), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setError("");
      setNotice("");
      setTeams([]);
      setSelectedTeamId("");
      setTeamFilterSeasonYear("");
      setTeamFilterAgeGroup("");
      setTeamContactNotes("");
      setTeamPracticePlan("");
      setScheduleGames([]);
      setGameNotes({});
      setAvailabilityNotes({});
      setActorCoach(null);
      setIsEditingTeamProfile(false);
      setIsEditingRoster(false);
      setActiveProfilePlayerId(null);
      setActiveProfileSummaryPlayerId(null);
      void loadTeams();
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetOrg]);

  useEffect(() => {
    let id: number;
    if (!selectedTeamId) {
      id = window.setTimeout(() => {
        setScheduleGames([]);
        setGameNotes({});
        setAvailabilityNotes({});
      }, 0);
      return () => window.clearTimeout(id);
    }
    id = window.setTimeout(() => void loadSchedule(selectedTeamId), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamId]);

  useEffect(() => {
    if (teamFilterSeasonYear || teamFilterSeasonOptions.length === 0) return;
    const id = window.setTimeout(() => setTeamFilterSeasonYear(String(teamFilterSeasonOptions[0])), 0);
    return () => window.clearTimeout(id);
  }, [teamFilterSeasonYear, teamFilterSeasonOptions]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setSelectedTeamId((current) =>
        current && filteredTeamOptions.some((team) => team.id === current)
          ? current
          : filteredTeamOptions[0]?.id || "",
      );
    }, 0);
    return () => window.clearTimeout(id);
  }, [filteredTeamOptions]);

  async function safeJson(response: Response) {
    const text = await response.text();
    if (!text.trim()) return {};
    return JSON.parse(text) as Record<string, unknown>;
  }

  async function loadTeams() {
    try {
      const response = await fetch(`/api/coach-corner/teams?${orgQuery}`, { cache: "no-store" });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to load teams"));
      const data = Array.isArray(json.data) ? (json.data as TeamRecord[]) : [];
      const actor = json.actor as
        | { isAdmin?: unknown; registeredUserId?: unknown; coach?: unknown }
        | undefined;
      setIsActorAdmin(Boolean(actor?.isAdmin));
      setActorRegisteredUserId(
        typeof actor?.registeredUserId === "string" ? actor.registeredUserId : null,
      );
      setActorCoach(
        actor?.coach && typeof actor.coach === "object" ? (actor.coach as CoachProfile) : null,
      );
      setTeams(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load teams");
    }
  }

  async function uploadAbuseAwarenessCertificate(coachId: string, file: File) {
    setAatUploadingCoachId(coachId);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("certificate", file);
      const response = await fetch(`/api/coach-corner/abuse-awareness?${orgQuery}`, {
        method: "POST",
        body: formData,
      });
      const json = await safeJson(response);
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to upload certificate"));
      }
      setNotice("Abuse Awareness Training certificate uploaded.");
      await loadTeams();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload certificate");
    } finally {
      setAatUploadingCoachId(null);
    }
  }

  async function loadSchedule(teamId: string) {
    const response = await fetch(`/api/coach-corner/schedule?${orgQuery}&teamId=${teamId}`, {
      cache: "no-store",
    });
    const json = await safeJson(response);
    if (!response.ok) throw new Error(String(json.error || "Failed to load schedule"));
    const data = Array.isArray(json.data) ? (json.data as ScheduleGame[]) : [];
    setScheduleGames(data);
    const noteState: Record<string, string> = {};
    const availabilityState: Record<string, string> = {};
    for (const game of data) {
      noteState[String(game.id)] = game.gameNote?.note || "";
      availabilityState[String(game.id)] = game.gameNote?.availabilityNote || "";
    }
    setGameNotes(noteState);
    setAvailabilityNotes(availabilityState);
  }

  async function saveTeamProfile() {
    if (!selectedTeam) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/coach-corner/team-profile?${orgQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selectedTeam.id,
          contactNotes: teamContactNotes,
          practicePlan: teamPracticePlan,
        }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to save team profile"));
      setNotice("Team profile saved.");
      await loadTeams();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save team profile");
    } finally {
      setBusy(false);
    }
  }

  async function savePlayerStatus(player: TeamPlayer) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/coach-corner/players?${orgQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: player.id,
          rosterStatus: player.rosterStatus,
          jerseyNumber: player.jerseyNumber,
        }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to save player status"));
      setNotice("Player roster details saved.");
      await loadTeams();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save player status");
    } finally {
      setBusy(false);
    }
  }

  async function saveGameNote(gameId: string) {
    if (!selectedTeam) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/coach-corner/game-notes?${orgQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selectedTeam.id,
          gameExternalId: gameId,
          note: gameNotes[gameId] || "",
          availabilityNote: availabilityNotes[gameId] || "",
        }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to save game note"));
      setNotice("Game note saved.");
      await loadSchedule(selectedTeam.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save game note");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!selectedTeam) return;
    const id = window.setTimeout(() => {
      setTeamContactNotes(selectedTeam.contactNotes || "");
      setTeamPracticePlan(selectedTeam.practicePlan || "");
      setIsEditingTeamProfile(false);
      setIsEditingRoster(false);
      setActiveProfilePlayerId(null);
      setActiveProfileSummaryPlayerId(null);
    }, 0);
    return () => window.clearTimeout(id);
  }, [selectedTeam]);

  const activeProfilePlayer = useMemo(
    () => selectedTeam?.players.find((player) => player.id === activeProfilePlayerId) || null,
    [selectedTeam, activeProfilePlayerId],
  );
  const activeProfileSummaryPlayer = useMemo(
    () =>
      selectedTeam?.players.find((player) => player.id === activeProfileSummaryPlayerId) || null,
    [selectedTeam, activeProfileSummaryPlayerId],
  );
  const actorCoachLabel = actorCoach
    ? (actorCoach.firstName || actorCoach.lastName
        ? [actorCoach.firstName, actorCoach.lastName].filter(Boolean).join(" ")
        : actorCoach.name) || actorCoach.email
    : "";
  const actorAatUploadedAt = actorCoach?.abuseAwarenessTrainingCertificateUploadedAt
    ? new Date(actorCoach.abuseAwarenessTrainingCertificateUploadedAt).toLocaleDateString()
    : null;

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

      {actorCoach ? (
        <div className="space-y-4 rounded-xl border border-sky-800/60 bg-sky-950/20 p-4 sm:p-5">
          <div className="space-y-2 text-sm text-sky-100">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">
                  Coach Requirements
                </p>
                <h2 className="text-lg font-semibold text-zinc-100">
                  Abuse Awareness Training certificate
                </h2>
                <p className="text-xs text-zinc-400">
                  Signed in as {actorCoachLabel} ({actorCoach.email})
                </p>
              </div>
              {actorCoach.abuseAwarenessTrainingCertificateUrl ? (
                <a
                  href={actorCoach.abuseAwarenessTrainingCertificateUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-full border border-emerald-700 bg-emerald-950/30 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-950/50"
                >
                  AAT uploaded{actorAatUploadedAt ? ` ${actorAatUploadedAt}` : ""}
                </a>
              ) : (
                <span className="inline-flex items-center justify-center rounded-full border border-amber-700 bg-amber-950/30 px-3 py-1 text-xs text-amber-300">
                  AAT not uploaded
                </span>
              )}
            </div>
            <p>
              New coaches: create a Little League University account at{" "}
              <a
                href="https://www.littleleague.org/university/articles/create-a-little-league-training-account/"
                target="_blank"
                rel="noreferrer"
                className="text-sky-300 underline"
              >
                Little League University account setup
              </a>
              , follow the email prompts, then log into LLU and open the Abuse Awareness Training
              (AAT) course.
            </p>
            <p>
              Previous 2025 coaches: log into LLU at{" "}
              <a
                href="https://littleleague.smarteru.com/user/learnerdashboard/v2/#/cat/6196/pg/25019/course/356266"
                target="_blank"
                rel="noreferrer"
                className="text-sky-300 underline"
              >
                Abuse Awareness Training course
              </a>{" "}
              and open the AAT course.
            </p>
            {actorCoach.abuseAwarenessTrainingCertificateFileName ? (
              <p className="text-xs text-zinc-500 truncate">
                {actorCoach.abuseAwarenessTrainingCertificateFileName}
              </p>
            ) : null}
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-sky-700 px-3 py-1.5 text-xs text-sky-200 hover:bg-sky-950/40">
            {aatUploadingCoachId === actorCoach.id ? "Uploading..." : "Upload AAT"}
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
              disabled={aatUploadingCoachId !== null}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (file) void uploadAbuseAwarenessCertificate(actorCoach.id, file);
              }}
            />
          </label>
          {teams.length === 0 ? (
            <p className="text-xs text-zinc-500">
              No team is assigned to your coach account yet. You can still upload your AAT
              certificate here.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5">
        <h2 className="text-lg font-semibold">Team Selection</h2>
        <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)]">
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
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          >
            <option value="">All age groups</option>
            {teamFilterAgeGroupOptions.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </select>
        </div>
        <select
          value={selectedTeamId}
          onChange={(event) => setSelectedTeamId(event.target.value)}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
        >
          <option value="">Select your team…</option>
          {filteredTeamOptions.map((team) => (
            <option key={team.id} value={team.id}>
              {team.teamName}
            </option>
          ))}
        </select>
      </div>

      {selectedTeam ? (
        <>
          <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold">Roster</h2>
              <button
                type="button"
                onClick={() => setIsEditingRoster((value) => !value)}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                {isEditingRoster ? "Done" : "Edit"}
              </button>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Coaches
              </p>
              <div className="rounded-lg border border-sky-800/60 bg-sky-950/25 p-3 text-xs text-sky-100 space-y-2">
                <p className="font-semibold">Abuse Awareness Training certificate</p>
                <p>
                  New coaches: create a Little League University account at{" "}
                  <a
                    href="https://www.littleleague.org/university/articles/create-a-little-league-training-account/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-300 underline"
                  >
                    Little League University account setup
                  </a>
                  , follow the email prompts, then log into LLU and open the Abuse Awareness Training
                  (AAT) course.
                </p>
                <p>
                  Previous 2025 coaches: log into LLU at{" "}
                  <a
                    href="https://littleleague.smarteru.com/user/learnerdashboard/v2/#/cat/6196/pg/25019/course/356266"
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-300 underline"
                  >
                    Abuse Awareness Training course
                  </a>{" "}
                  and open the AAT course.
                </p>
              </div>
              <div className="rounded-lg border border-zinc-800 overflow-hidden">
                {selectedTeam.coachAssignments.length === 0 ? (
                  <p className="text-zinc-500 text-sm p-3">No coaches assigned to this team.</p>
                ) : (
                  selectedTeam.coachAssignments.map((assignment) => {
                    const coach = assignment.registeredUser;
                    const label =
                      (coach.firstName || coach.lastName
                        ? [coach.firstName, coach.lastName].filter(Boolean).join(" ")
                        : coach.name) || coach.email;
                    const canAdminTeam = assignment.role === "HEAD_COACH";
                    const canUploadAat = coach.id === actorRegisteredUserId;
                    const aatUploadedAt = coach.abuseAwarenessTrainingCertificateUploadedAt
                      ? new Date(coach.abuseAwarenessTrainingCertificateUploadedAt).toLocaleDateString()
                      : null;
                    return (
                      <div
                        key={assignment.id}
                        className="flex flex-col gap-3 border-b border-zinc-800 px-3 py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm">
                            {label} ({coach.email})
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] ${
                                canAdminTeam
                                  ? "border border-emerald-700 bg-emerald-950/40 text-emerald-300"
                                  : "border border-zinc-700 bg-zinc-950/40 text-zinc-300"
                              }`}
                            >
                              {canAdminTeam ? "Can Admin Team" : "Coach Access"}
                            </span>
                            {coach.abuseAwarenessTrainingCertificateUrl ? (
                              <a
                                href={coach.abuseAwarenessTrainingCertificateUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-full border border-emerald-700 bg-emerald-950/30 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-950/50"
                              >
                                AAT uploaded{aatUploadedAt ? ` ${aatUploadedAt}` : ""}
                              </a>
                            ) : (
                              <span className="rounded-full border border-amber-700 bg-amber-950/30 px-2 py-0.5 text-[11px] text-amber-300">
                                AAT not uploaded
                              </span>
                            )}
                          </div>
                          {coach.abuseAwarenessTrainingCertificateFileName ? (
                            <p className="text-xs text-zinc-500 truncate">
                              {coach.abuseAwarenessTrainingCertificateFileName}
                            </p>
                          ) : null}
                        </div>
                        {canUploadAat ? (
                          <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-sky-700 px-3 py-1.5 text-xs text-sky-200 hover:bg-sky-950/40">
                            {aatUploadingCoachId === coach.id ? "Uploading..." : "Upload AAT"}
                            <input
                              type="file"
                              accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
                              disabled={aatUploadingCoachId !== null}
                              className="sr-only"
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.currentTarget.value = "";
                                if (file) void uploadAbuseAwarenessCertificate(coach.id, file);
                              }}
                            />
                          </label>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
              {isActorAdmin ? (
                <p className="text-xs text-zinc-500">
                  Admin users (Park Director and above) also have team admin access in this workspace.
                </p>
              ) : null}
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Players
            </p>
            <div className="max-h-80 overflow-auto rounded-lg border border-zinc-800">
              {selectedTeam.players.length === 0 ? (
                <p className="text-zinc-500 text-sm p-3">No players assigned yet.</p>
              ) : (
                <table className="min-w-[760px] text-sm">
                  <thead className="sticky top-0 z-10 bg-zinc-900 text-zinc-300">
                    <tr className="text-center">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Full Name</th>
                      <th className="px-3 py-2">Phone</th>
                      <th className="px-3 py-2">Size</th>
                      <th className="px-3 py-2 text-center">Profile</th>
                      <th className="px-3 py-2 text-center">Status</th>
                      <th className="px-3 py-2 text-center">Details</th>
                      {isEditingRoster ? (
                        <th className="px-3 py-2 text-right">Actions</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTeam.players.map((player) => {
                      const profile = getPlayerProfileCompleteness(player);
                      const statusIndicator = getRosterStatusIndicator(player.rosterStatus);
                      const accountName = [player.guardianFirstName, player.guardianLastName]
                        .filter(Boolean)
                        .join(" ")
                        .trim();
                      return (
                        <tr key={player.id} className="border-t border-zinc-800">
                          <td className="px-3 py-2 text-center">
                            <input
                              value={player.jerseyNumber || ""}
                              onChange={(event) =>
                                setTeams((current) =>
                                  current.map((team) =>
                                    team.id !== selectedTeam.id
                                      ? team
                                      : {
                                          ...team,
                                          players: team.players.map((item) =>
                                            item.id === player.id
                                              ? {
                                                  ...item,
                                                  jerseyNumber:
                                                    event.target.value.replace(/\D/g, "").slice(0, 2) || null,
                                                }
                                              : item,
                                          ),
                                        },
                                  ),
                                )
                              }
                              inputMode="numeric"
                              maxLength={2}
                              disabled={!isEditingRoster}
                              className="w-14 rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm text-center"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">{player.fullName || "—"}</td>
                          <td className="px-3 py-2 text-center">
                            <div className="text-center">
                              <p>{player.contactPhone || "—"}</p>
                              <p className="text-[11px] text-zinc-500">{accountName || "—"}</p>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">{toJerseySizeCode(player.jerseySize) || "—"}</td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => setActiveProfileSummaryPlayerId(player.id)}
                              className={`rounded-full px-2 py-0.5 text-[11px] ${
                                profile.isComplete
                                  ? "bg-emerald-950/50 border border-emerald-700 text-emerald-300"
                                  : "bg-amber-950/50 border border-amber-700 text-amber-300"
                              }`}
                              title="Toggle profile completeness"
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
                              title="View profile details"
                            >
                              🧾
                            </button>
                          </td>
                          {isEditingRoster ? (
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <input
                                  value={player.rosterStatus || ""}
                                  onChange={(event) =>
                                    setTeams((current) =>
                                      current.map((team) =>
                                        team.id !== selectedTeam.id
                                          ? team
                                          : {
                                              ...team,
                                              players: team.players.map((item) =>
                                                item.id === player.id
                                                  ? { ...item, rosterStatus: event.target.value || null }
                                                  : item,
                                              ),
                                            },
                                      ),
                                    )
                                  }
                                  placeholder="Roster status"
                                  className="w-36 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm sm:w-44"
                                />
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void savePlayerStatus(player)}
                                  className="text-xs rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 disabled:opacity-60"
                                >
                                  Save
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

          <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5">
            <h2 className="text-lg font-semibold">Schedule + Game Notes</h2>
            <div className="max-h-96 overflow-auto rounded-lg border border-zinc-800">
              {scheduleGames.length === 0 ? (
                <p className="text-zinc-500 text-sm p-3">No matching games found for this team.</p>
              ) : (
                scheduleGames.map((game) => {
                  const gameId = String(game.id);
                  return (
                    <div key={gameId} className="space-y-2 border-b border-zinc-800 px-3 py-3 last:border-b-0">
                      <p className="text-sm font-medium">
                        {game.home_team || "Home"} vs {game.away_team || "Away"}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {game.start_time
                          ? new Date(game.start_time).toLocaleString()
                          : game.localized_time || "TBD"}
                        {game.subvenue ? ` · ${game.subvenue}` : ""}
                      </p>
                      <textarea
                        value={gameNotes[gameId] || ""}
                        onChange={(event) =>
                          setGameNotes((current) => ({ ...current, [gameId]: event.target.value }))
                        }
                        rows={2}
                        placeholder="Game note"
                        className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm"
                      />
                      <input
                        value={availabilityNotes[gameId] || ""}
                        onChange={(event) =>
                          setAvailabilityNotes((current) => ({
                            ...current,
                            [gameId]: event.target.value,
                          }))
                        }
                        placeholder="Availability note"
                        className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-sm"
                      />
                      <div className="flex justify-stretch sm:justify-end">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void saveGameNote(gameId)}
                          className="min-h-10 w-full rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-60 sm:w-auto"
                        >
                          Save Game Note
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
                  placeholder="Team contact info and notes"
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
                  disabled={busy}
                  onClick={() => void saveTeamProfile()}
                  className="min-h-11 rounded-lg bg-brand-purple px-4 py-2 text-sm font-semibold hover:bg-brand-purple-dark disabled:opacity-60"
                >
                  Save Team Info
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
        </>
      ) : null}
      {activeProfilePlayer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="max-h-[90dvh] w-full max-w-4xl space-y-4 overflow-auto rounded-xl border border-zinc-700 bg-zinc-950 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-semibold">Player Profile - {activeProfilePlayer.fullName}</h3>
              <button
                type="button"
                onClick={() => setActiveProfilePlayerId(null)}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Close
              </button>
            </div>
            <div className="grid md:grid-cols-3 gap-2 text-sm">
              <p className="md:col-span-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Guardian</p>
              <p className="rounded border border-zinc-800 bg-zinc-900/40 p-2">First Name: {activeProfilePlayer.guardianFirstName || "-"}</p>
              <p className="rounded border border-zinc-800 bg-zinc-900/40 p-2">Last Name: {activeProfilePlayer.guardianLastName || "-"}</p>
              <p className="rounded border border-zinc-800 bg-zinc-900/40 p-2">Email: {activeProfilePlayer.guardianEmail || "-"}</p>
              <p className="rounded border border-zinc-800 bg-zinc-900/40 p-2">Phone: {activeProfilePlayer.guardianPhone || "-"}</p>
              <p className="rounded border border-zinc-800 bg-zinc-900/40 p-2">Gender: {activeProfilePlayer.gender || "-"}</p>
              <p className="rounded border border-zinc-800 bg-zinc-900/40 p-2">Birth Date: {activeProfilePlayer.birthDate ? activeProfilePlayer.birthDate.slice(0, 10) : "-"}</p>
              <p className="md:col-span-3 mt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Registration</p>
              <p className="rounded border border-zinc-800 bg-zinc-900/40 p-2">Jersey Number: {activeProfilePlayer.jerseyNumber || "-"}</p>
              <p className="rounded border border-zinc-800 bg-zinc-900/40 p-2">Jersey Size: {activeProfilePlayer.jerseySize || "-"}</p>
              <p className="rounded border border-zinc-800 bg-zinc-900/40 p-2">Roster Status: {activeProfilePlayer.rosterStatus || "-"}</p>
              <p className="rounded border border-zinc-800 bg-zinc-900/40 p-2">Payment Status: {activeProfilePlayer.paymentStatus || "-"}</p>
              <p className="rounded border border-zinc-800 bg-zinc-900/40 p-2">Birth Certificate: {activeProfilePlayer.birthCertificateStatus || "-"}</p>
              <p className="md:col-span-3 mt-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Medical</p>
              <p className="md:col-span-3 rounded border border-zinc-800 bg-zinc-900/40 p-2">Summary: {activeProfilePlayer.medicalConditionsSummary || "-"}</p>
              <p className="md:col-span-3 rounded border border-zinc-800 bg-zinc-900/40 p-2">Details: {activeProfilePlayer.medicalConditionsDetails || "-"}</p>
            </div>
          </div>
        </div>
      ) : null}
      {activeProfileSummaryPlayer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-lg space-y-4 rounded-xl border border-zinc-700 bg-zinc-950 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-base font-semibold">
                Profile Completeness - {activeProfileSummaryPlayer.fullName}
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
    </section>
  );
}
