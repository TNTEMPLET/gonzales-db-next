"use client";

import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

import RainoutPopup from "./RainoutPopup";
import StandingsTabs from "@/components/standings/StandingsTabs";
import type { AgeGroupStandings } from "@/lib/standings";
import {
  filterPublicGames,
  filterPublicPractices,
  groupPublicGames,
  groupPublicPractices,
  uniqueAgeGroupsFromGames,
  uniqueAgeGroupsFromPractices,
  uniqueParksFromGames,
  uniqueParksFromPractices,
  uniqueTeamsFromGames,
  uniqueTeamsFromPractices,
  type PublicPracticeSlot,
  type PublicScheduleGame,
} from "@/lib/schedule/publicSchedule";
import {
  buildSeasonGamesPdf,
  buildSeasonPracticesPdf,
  buildTeamSchedulePdf,
  downloadPdfBuffer,
} from "@/lib/schedule/publicSchedulePdf";

type Props = {
  siteName: string;
  seasonName: string;
  initialGames: PublicScheduleGame[];
  initialPractices: PublicPracticeSlot[];
  initialError: string | null;
  currentViewMode: "thisWeek" | "nextWeek" | "fullSeason";
  standings: AgeGroupStandings[];
  forceRainout?: { allParksOut: boolean; venues: string[] };
};

type DayFilter = "all" | "yesterday" | "today" | "tomorrow";
type ScheduleTab = "games" | "practices";

function todayDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function downloadTextFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function fileStem(parts: string[]) {
  return parts
    .map((part) => part.trim().replace(/[^a-zA-Z0-9]+/g, "-"))
    .filter(Boolean)
    .join("-")
    .replace(/^-+|-+$/g, "");
}

export default function ScheduleTable({
  siteName,
  seasonName,
  initialGames,
  initialPractices,
  initialError,
  currentViewMode,
  standings,
  forceRainout,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<ScheduleTab>("games");
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<string[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string[]>([]);
  const [selectedPark, setSelectedPark] = useState<string[]>([]);
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  const [ageDropdownOpen, setAgeDropdownOpen] = useState(false);
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);
  const [parkDropdownOpen, setParkDropdownOpen] = useState(false);
  const ageDropdownRef = useRef<HTMLDivElement>(null);
  const teamDropdownRef = useRef<HTMLDivElement>(null);
  const parkDropdownRef = useRef<HTMLDivElement>(null);

  const handleViewChange = (mode: "thisWeek" | "nextWeek" | "fullSeason") => {
    if (mode === "nextWeek") setDayFilter("all");
    const onSchedulePage = pathname?.startsWith("/schedule");
    const url = onSchedulePage
      ? mode === "thisWeek"
        ? "/schedule"
        : `/schedule?view=${mode}`
      : mode === "thisWeek"
        ? "/#schedule"
        : `/?view=${mode}#schedule`;
    router.push(url);
  };

  const sourceGames = useMemo(() => {
    if (dayFilter === "all") return initialGames;
    const today = todayDateKey();
    const target =
      dayFilter === "yesterday"
        ? shiftDateKey(today, -1)
        : dayFilter === "tomorrow"
          ? shiftDateKey(today, 1)
          : today;
    return initialGames.filter((game) => game.dateKey === target);
  }, [initialGames, dayFilter]);

  const ageGroups = useMemo(
    () =>
      tab === "games"
        ? uniqueAgeGroupsFromGames(sourceGames)
        : uniqueAgeGroupsFromPractices(initialPractices),
    [tab, sourceGames, initialPractices],
  );

  const parks = useMemo(
    () =>
      tab === "games"
        ? uniqueParksFromGames(sourceGames, selectedAgeGroup)
        : uniqueParksFromPractices(initialPractices, selectedAgeGroup),
    [tab, sourceGames, initialPractices, selectedAgeGroup],
  );

  const teams = useMemo(
    () =>
      tab === "games"
        ? uniqueTeamsFromGames(sourceGames, selectedAgeGroup, selectedPark)
        : uniqueTeamsFromPractices(initialPractices, selectedAgeGroup, selectedPark),
    [tab, sourceGames, initialPractices, selectedAgeGroup, selectedPark],
  );

  const filteredGames = useMemo(
    () =>
      filterPublicGames(sourceGames, {
        ageGroups: selectedAgeGroup,
        teams: selectedTeam,
        parks: selectedPark,
      }),
    [sourceGames, selectedAgeGroup, selectedTeam, selectedPark],
  );
  const filteredPractices = useMemo(
    () =>
      filterPublicPractices(initialPractices, {
        ageGroups: selectedAgeGroup,
        teams: selectedTeam,
        parks: selectedPark,
      }),
    [initialPractices, selectedAgeGroup, selectedTeam, selectedPark],
  );

  const groupedGames = useMemo(() => groupPublicGames(filteredGames), [filteredGames]);
  const groupedPractices = useMemo(
    () => groupPublicPractices(filteredPractices),
    [filteredPractices],
  );

  const { rainedOutVenues, allParksRainedOut } = useMemo(() => {
    if (forceRainout) {
      const venues =
        forceRainout.venues.length > 0
          ? forceRainout.venues
          : forceRainout.allParksOut
            ? ["All Parks"]
            : [];
      return { rainedOutVenues: venues, allParksRainedOut: forceRainout.allParksOut };
    }
    return { rainedOutVenues: [] as string[], allParksRainedOut: false };
  }, [forceRainout]);

  const toggleAgeSelection = (value: string) => {
    setSelectedAgeGroup((prev) => {
      const next = prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value];
      return next;
    });
    setSelectedTeam([]);
  };

  const toggleTeamSelection = (value: string) => {
    setSelectedTeam((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  };

  const toggleParkSelection = (value: string) => {
    setSelectedPark((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ageDropdownRef.current && !ageDropdownRef.current.contains(event.target as Node)) {
        setAgeDropdownOpen(false);
      }
      if (teamDropdownRef.current && !teamDropdownRef.current.contains(event.target as Node)) {
        setTeamDropdownOpen(false);
      }
      if (parkDropdownRef.current && !parkDropdownRef.current.contains(event.target as Node)) {
        setParkDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedAgeGroupLabel =
    selectedAgeGroup.length === 0
      ? "All divisions"
      : selectedAgeGroup.length > 2
        ? `${selectedAgeGroup.length} selected`
        : selectedAgeGroup.join(", ");
  const selectedTeamLabel =
    selectedTeam.length === 0
      ? "All teams"
      : selectedTeam.length > 2
        ? `${selectedTeam.length} selected`
        : selectedTeam.join(", ");
  const selectedParkLabel =
    selectedPark.length === 0
      ? "All parks"
      : selectedPark.length > 2
        ? `${selectedPark.length} selected`
        : selectedPark.join(", ");

  const subtitle =
    selectedAgeGroup.length || selectedTeam.length || selectedPark.length
      ? [selectedAgeGroup.join(", "), selectedTeam.join(", "), selectedPark.join(", ")]
          .filter(Boolean)
          .join(" · ")
      : tab === "games"
        ? "All games"
        : "Weekly practices";

  const singleTeam = selectedTeam.length === 1 ? selectedTeam[0]! : null;
  const stamp = new Date().toISOString().slice(0, 10);
  const rowsForCount = tab === "games" ? filteredGames.length : filteredPractices.length;

  function downloadCSV() {
    if (tab === "practices") {
      const headers = ["Weekday", "Time", "Age", "Team", "Park", "Field", "Shares with"];
      const rows = filteredPractices.map((slot) => [
        slot.weekdayName,
        slot.timeLabel,
        slot.ageGroup,
        slot.teamName,
        slot.parkName,
        slot.fieldName,
        slot.pairTeamName || "",
      ]);
      const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
      downloadTextFile(csv, `${fileStem(["practices", subtitle, stamp])}.csv`, "text/csv;charset=utf-8;");
      return;
    }
    const headers = ["Date", "Weekday", "Time", "Age", "Home", "Away", "Park", "Field"];
    const rows = filteredGames.map((game) => [
      game.dateKey,
      game.weekdayName,
      game.timeLabel,
      game.ageGroup,
      game.homeTeam,
      game.awayTeam,
      game.parkName,
      game.fieldName,
    ]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
    downloadTextFile(csv, `${fileStem(["schedule", subtitle, stamp])}.csv`, "text/csv;charset=utf-8;");
  }

  function downloadXLSX() {
    if (tab === "practices") {
      const data = filteredPractices.map((slot) => ({
        Weekday: slot.weekdayName,
        Time: slot.timeLabel,
        Age: slot.ageGroup,
        Team: slot.teamName,
        Park: slot.parkName,
        Field: slot.fieldName,
        "Shares with": slot.pairTeamName || "",
      }));
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Practices");
      XLSX.writeFile(workbook, `${fileStem(["practices", subtitle, stamp])}.xlsx`);
      return;
    }
    const data = filteredGames.map((game) => ({
      Date: game.dateKey,
      Weekday: game.weekdayName,
      Time: game.timeLabel,
      Age: game.ageGroup,
      Home: game.homeTeam,
      Away: game.awayTeam,
      Park: game.parkName,
      Field: game.fieldName,
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Schedule");
    XLSX.writeFile(workbook, `${fileStem(["schedule", subtitle, stamp])}.xlsx`);
  }

  function downloadPDF() {
    if (singleTeam) {
      const teamGames = filterPublicGames(sourceGames, {
        ageGroups: selectedAgeGroup,
        teams: [singleTeam],
        parks: selectedPark,
      });
      const teamPractices = filterPublicPractices(initialPractices, {
        ageGroups: selectedAgeGroup,
        teams: [singleTeam],
        parks: selectedPark,
      });
      const ageGroup =
        teamGames[0]?.ageGroup || teamPractices[0]?.ageGroup || selectedAgeGroup[0] || "";
      const pdf = buildTeamSchedulePdf({
        orgName: siteName,
        seasonName,
        ageGroup,
        teamName: singleTeam,
        games: teamGames,
        practices: teamPractices,
      });
      downloadPdfBuffer(pdf.buffer, `${fileStem([ageGroup, singleTeam, "schedule"])}.pdf`);
      return;
    }
    if (tab === "practices") {
      const pdf = buildSeasonPracticesPdf({
        orgName: siteName,
        seasonName,
        subtitle,
        slots: filteredPractices,
      });
      downloadPdfBuffer(pdf.buffer, `${fileStem(["practices", subtitle, stamp])}.pdf`);
      return;
    }
    const pdf = buildSeasonGamesPdf({
      orgName: siteName,
      seasonName,
      subtitle,
      games: filteredGames,
    });
    downloadPdfBuffer(pdf.buffer, `${fileStem(["schedule", subtitle, stamp])}.pdf`);
  }

  const empty =
    tab === "games" ? filteredGames.length === 0 : filteredPractices.length === 0;

  return (
    <section id="schedule" className="bg-zinc-950 py-10 sm:py-14">
      <RainoutPopup
        siteName={siteName}
        rainedOutVenues={rainedOutVenues}
        allParksRainedOut={allParksRainedOut}
      />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl">Schedules</h2>
            <p className="mt-1 text-sm text-zinc-400">
              {seasonName} · {subtitle}
            </p>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 sm:flex sm:justify-end">
              {(
                [
                  ["thisWeek", "This week"],
                  ["nextWeek", "Next week"],
                  ["fullSeason", "Season"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => handleViewChange(mode)}
                  className={`min-h-10 rounded-lg px-3 py-2 text-sm font-medium ${
                    currentViewMode === mode
                      ? "bg-brand-purple text-white"
                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {currentViewMode !== "nextWeek" ? (
              <div className="grid grid-cols-3 gap-2 sm:flex sm:justify-end">
                {(
                  [
                    ["yesterday", "Yesterday"],
                    ["today", "Today"],
                    ["tomorrow", "Tomorrow"],
                  ] as const
                ).map(([filter, label]) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setDayFilter((current) => (current === filter ? "all" : filter))}
                    className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-medium ${
                      dayFilter === filter
                        ? "bg-brand-gold text-black"
                        : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mb-4 flex gap-2">
          {(
            [
              ["games", "Games"],
              ["practices", "Practices"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                tab === value
                  ? "bg-white text-zinc-950"
                  : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <div className="relative" ref={ageDropdownRef}>
            <label className="mb-1 block text-xs font-medium text-zinc-500">Division</label>
            <button
              type="button"
              onClick={() => {
                setAgeDropdownOpen((open) => !open);
                setTeamDropdownOpen(false);
                setParkDropdownOpen(false);
              }}
              className="flex min-h-10 w-full items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            >
              <span className="truncate">{selectedAgeGroupLabel}</span>
              <span className="text-zinc-400">▾</span>
            </button>
            {ageDropdownOpen ? (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAgeGroup([]);
                    setSelectedTeam([]);
                  }}
                  className="min-h-10 w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-900"
                >
                  All divisions
                </button>
                <div className="max-h-64 overflow-auto">
                  {ageGroups.map((group) => (
                    <button
                      key={group}
                      type="button"
                      onClick={() => toggleAgeSelection(group)}
                      className="flex min-h-10 w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-900"
                    >
                      <span>{group}</span>
                      {selectedAgeGroup.includes(group) ? (
                        <span className="text-brand-gold">✓</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="relative" ref={teamDropdownRef}>
            <label className="mb-1 block text-xs font-medium text-zinc-500">Team</label>
            <button
              type="button"
              onClick={() => {
                setTeamDropdownOpen((open) => !open);
                setAgeDropdownOpen(false);
                setParkDropdownOpen(false);
              }}
              className="flex min-h-10 w-full items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            >
              <span className="truncate">{selectedTeamLabel}</span>
              <span className="text-zinc-400">▾</span>
            </button>
            {teamDropdownOpen ? (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-xl">
                <button
                  type="button"
                  onClick={() => setSelectedTeam([])}
                  className="min-h-10 w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-900"
                >
                  All teams
                </button>
                <div className="max-h-64 overflow-auto">
                  {teams.map((team) => (
                    <button
                      key={team}
                      type="button"
                      onClick={() => toggleTeamSelection(team)}
                      className="flex min-h-10 w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-900"
                    >
                      <span>{team}</span>
                      {selectedTeam.includes(team) ? (
                        <span className="text-brand-gold">✓</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="relative" ref={parkDropdownRef}>
            <label className="mb-1 block text-xs font-medium text-zinc-500">Park</label>
            <button
              type="button"
              onClick={() => {
                setParkDropdownOpen((open) => !open);
                setAgeDropdownOpen(false);
                setTeamDropdownOpen(false);
              }}
              className="flex min-h-10 w-full items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
            >
              <span className="truncate">{selectedParkLabel}</span>
              <span className="text-zinc-400">▾</span>
            </button>
            {parkDropdownOpen ? (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-xl">
                <button
                  type="button"
                  onClick={() => setSelectedPark([])}
                  className="min-h-10 w-full px-3 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-900"
                >
                  All parks
                </button>
                <div className="max-h-64 overflow-auto">
                  {parks.map((park) => (
                    <button
                      key={park}
                      type="button"
                      onClick={() => toggleParkSelection(park)}
                      className="flex min-h-10 w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-900"
                    >
                      <span>{park}</span>
                      {selectedPark.includes(park) ? (
                        <span className="text-brand-gold">✓</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {!empty ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-zinc-500">Download</span>
              <button
                type="button"
                onClick={downloadCSV}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={downloadXLSX}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
              >
                Excel
              </button>
              <button
                type="button"
                onClick={downloadPDF}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
              >
                PDF
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              {rowsForCount} {tab === "games" ? "games" : "practice slots"}
              {singleTeam ? " · team sheet is one page" : ""}
            </p>
          </div>
        ) : null}

        {initialError ? (
          <div className="rounded-xl border border-red-800 bg-red-950/40 p-6 text-center text-sm text-red-300">
            {initialError}
          </div>
        ) : empty ? (
          <div className="rounded-xl bg-zinc-900 p-8 text-center text-sm text-zinc-400">
            {tab === "games"
              ? "No games for these filters."
              : "No practice slots for these filters."}
          </div>
        ) : tab === "games" ? (
          <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-800/80 text-left text-xs uppercase tracking-wide text-zinc-400">
                  <th className="px-3 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Time</th>
                  <th className="px-3 py-2 font-semibold">Age</th>
                  <th className="px-3 py-2 font-semibold">Home</th>
                  <th className="px-3 py-2 font-semibold">Away</th>
                </tr>
              </thead>
              <tbody>
                {groupedGames.map((park) => (
                  <Fragment key={park.parkName}>
                    <tr>
                      <td
                        colSpan={5}
                        className="bg-zinc-800 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400"
                      >
                        {park.parkName}
                      </td>
                    </tr>
                    {park.fields.map((field) => (
                      <Fragment key={`${park.parkName}-${field.fieldName}`}>
                        {field.weekdays.map((weekday) => (
                          <Fragment key={`${park.parkName}-${field.fieldName}-${weekday.weekdayIndex}`}>
                            <tr>
                              <td
                                colSpan={5}
                                className="bg-zinc-950/70 px-3 py-1 text-xs font-medium text-brand-gold/80"
                              >
                                {field.fieldName} · {weekday.weekdayName}
                              </td>
                            </tr>
                            {weekday.games.map((row) => (
                              <tr key={row.id} className="border-t border-zinc-800/80 hover:bg-zinc-800/40">
                                <td className="whitespace-nowrap px-3 py-1.5 text-zinc-300">
                                  {row.dateLabel.replace(/^[A-Za-z]{3},\s/, "")}
                                </td>
                                <td className="whitespace-nowrap px-3 py-1.5 font-medium">{row.timeLabel}</td>
                                <td className="px-3 py-1.5 text-brand-gold">{row.ageGroup}</td>
                                <td className="px-3 py-1.5">{row.homeTeam}</td>
                                <td className="px-3 py-1.5">{row.awayTeam}</td>
                              </tr>
                            ))}
                          </Fragment>
                        ))}
                      </Fragment>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-800/80 text-left text-xs uppercase tracking-wide text-zinc-400">
                  <th className="px-3 py-2 font-semibold">Time</th>
                  <th className="px-3 py-2 font-semibold">Age</th>
                  <th className="px-3 py-2 font-semibold">Team</th>
                  <th className="px-3 py-2 font-semibold">Shares with</th>
                </tr>
              </thead>
              <tbody>
                {groupedPractices.map((park) => (
                  <Fragment key={park.parkName}>
                    <tr>
                      <td
                        colSpan={4}
                        className="bg-zinc-800 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-400"
                      >
                        {park.parkName}
                      </td>
                    </tr>
                    {park.fields.map((field) => (
                      <Fragment key={`${park.parkName}-${field.fieldName}`}>
                        {field.weekdays.map((weekday) => (
                          <Fragment key={`${park.parkName}-${field.fieldName}-${weekday.weekdayIndex}`}>
                            <tr>
                              <td
                                colSpan={4}
                                className="bg-zinc-950/70 px-3 py-1 text-xs font-medium text-brand-gold/80"
                              >
                                {field.fieldName} · {weekday.weekdayName}
                              </td>
                            </tr>
                            {weekday.slots.map((slot) => (
                              <tr key={slot.id} className="border-t border-zinc-800/80 hover:bg-zinc-800/40">
                                <td className="whitespace-nowrap px-3 py-1.5 font-medium">{slot.timeLabel}</td>
                                <td className="px-3 py-1.5 text-brand-gold">{slot.ageGroup}</td>
                                <td className="px-3 py-1.5">{slot.teamName}</td>
                                <td className="px-3 py-1.5 text-zinc-400">{slot.pairTeamName || "—"}</td>
                              </tr>
                            ))}
                          </Fragment>
                        ))}
                      </Fragment>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {standings.length > 0 ? (
          <div className="mt-10">
            <StandingsTabs standings={standings} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
