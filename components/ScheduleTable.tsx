// components/ScheduleTable.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import RainoutPopup from "./RainoutPopup";

type Game = {
  id?: string | number;
  start_time?: string;
  age_group?: string | null;
  home_team?: string;
  away_team?: string;
  localized_date?: string;
  localized_time?: string;
  status?: string;
  _embedded?: { venue?: { name?: string } };
  subvenue?: string;
};

type Props = {
  initialGames: Game[];
  initialError: string | null;
  currentViewMode: "thisWeek" | "nextWeek" | "fullSeason";
};

type DayFilter = "all" | "yesterday" | "today" | "tomorrow";

const getAgeGroupSortValue = (ageGroup?: string | null) => {
  if (!ageGroup) return Number.POSITIVE_INFINITY;
  const normalized = ageGroup.trim().toUpperCase();
  const numericMatch =
    normalized.match(/^(\d+)\s*U$/) || normalized.match(/^(\d+)/);
  return numericMatch ? Number(numericMatch[1]) : Number.POSITIVE_INFINITY;
};

const sortAgeGroupLabels = (a: string, b: string) => {
  const aValue = getAgeGroupSortValue(a);
  const bValue = getAgeGroupSortValue(b);
  if (aValue !== bValue) return aValue - bValue;
  return a.localeCompare(b);
};

const getGameSortDateValue = (game: Game) => {
  if (game.start_time) {
    const date = new Date(game.start_time);
    if (!Number.isNaN(date.valueOf())) return date.valueOf();
  }
  if (game.localized_date) {
    const combined = `${game.localized_date} ${game.localized_time || ""}`;
    const parsed = new Date(combined);
    if (!Number.isNaN(parsed.valueOf())) return parsed.valueOf();
  }
  return Number.POSITIVE_INFINITY;
};

const compareStrings = (a?: string, b?: string) => {
  const left = (a || "").trim().toUpperCase();
  const right = (b || "").trim().toUpperCase();
  return left.localeCompare(right);
};

const compareDateTime = (a: Game, b: Game) => {
  const aValue = getGameSortDateValue(a);
  const bValue = getGameSortDateValue(b);
  if (aValue !== bValue) return aValue - bValue;
  return compareStrings(a.localized_time, b.localized_time);
};

const compareAgeGroup = (a: Game, b: Game) => {
  const aValue = getAgeGroupSortValue(a.age_group);
  const bValue = getAgeGroupSortValue(b.age_group);
  if (aValue !== bValue) return aValue - bValue;
  return compareStrings(a.age_group || "", b.age_group || "");
};

export default function ScheduleTable({
  initialGames,
  initialError,
  currentViewMode,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const previewRainout = searchParams.get("rainout") === "preview";
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<string[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string[]>([]);
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  const [ageDropdownOpen, setAgeDropdownOpen] = useState(false);
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);
  const ageDropdownRef = useRef<HTMLDivElement>(null);
  const teamDropdownRef = useRef<HTMLDivElement>(null);

  const lastUpdateTime = useMemo(() => new Date().toLocaleTimeString(), []);

  const handleViewChange = (mode: "thisWeek" | "nextWeek" | "fullSeason") => {
    if (mode === "nextWeek") setDayFilter("all");
    const url = mode === "thisWeek" ? "/#schedule" : `/?view=${mode}#schedule`;
    router.push(url);
  };

  // Extract unique age groups
  const ageGroups = useMemo(() => {
    const groups = new Set<string>();
    initialGames.forEach((game) => {
      if (game.age_group) groups.add(game.age_group);
    });
    return Array.from(groups).sort(sortAgeGroupLabels);
  }, [initialGames]);

  // Extract teams based on selected age group(s)
  const teams = useMemo(() => {
    const teamSet = new Set<string>();
    initialGames.forEach((game) => {
      if (
        selectedAgeGroup.length === 0 ||
        selectedAgeGroup.includes(game.age_group || "")
      ) {
        if (game.home_team) teamSet.add(game.home_team);
        if (game.away_team) teamSet.add(game.away_team);
      }
    });
    return Array.from(teamSet).sort();
  }, [initialGames, selectedAgeGroup]);

  const getGameDayTime = (game: Game) => {
    const dateSource = game.start_time || game.localized_date;
    if (!dateSource) return null;

    const parsedDate = new Date(dateSource);
    if (Number.isNaN(parsedDate.valueOf())) return null;

    return new Date(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate(),
    ).valueOf();
  };

  const targetDayByFilter = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const dayOffsetByFilter: Record<Exclude<DayFilter, "all">, number> = {
      yesterday: -1,
      today: 0,
      tomorrow: 1,
    };

    if (dayFilter === "all") return null;

    const target = new Date(now);
    target.setDate(now.getDate() + dayOffsetByFilter[dayFilter]);
    return target.valueOf();
  }, [dayFilter]);

  // Filter games based on selections
  const filteredGames = useMemo(() => {
    return initialGames.filter((game) => {
      const ageGroupMatch =
        selectedAgeGroup.length === 0 ||
        selectedAgeGroup.includes(game.age_group || "");
      const teamMatch =
        selectedTeam.length === 0 ||
        selectedTeam.includes(game.home_team || "") ||
        selectedTeam.includes(game.away_team || "");
      const gameDayTime = getGameDayTime(game);
      const dayMatch =
        dayFilter === "all"
          ? true
          : targetDayByFilter !== null && gameDayTime === targetDayByFilter;

      return ageGroupMatch && teamMatch && dayMatch;
    });
  }, [
    initialGames,
    selectedAgeGroup,
    selectedTeam,
    dayFilter,
    targetDayByFilter,
  ]);

  const sortedGames = useMemo(() => {
    return [...filteredGames].sort((a, b) => {
      const parkCmp = (a._embedded?.venue?.name || "").localeCompare(
        b._embedded?.venue?.name || "",
      );
      if (parkCmp !== 0) return parkCmp;
      const dayCmp = getGameSortDateValue(a) - getGameSortDateValue(b);
      if (dayCmp !== 0) return dayCmp;
      const ageCmp = compareAgeGroup(a, b);
      if (ageCmp !== 0) return ageCmp;
      return compareDateTime(a, b);
    });
  }, [filteredGames]);

  const groupedGames = useMemo(() => {
    const parkMap = new Map<
      string,
      Map<number, { dayLabel: string; games: Game[] }>
    >();
    for (const game of sortedGames) {
      const park = game._embedded?.venue?.name || "Unknown Venue";
      const daySortVal = getGameDayTime(game) ?? Number.POSITIVE_INFINITY;
      const dayLabel = (() => {
        const src = game.start_time || game.localized_date;
        if (!src) return "Unknown Date";
        const d = new Date(src);
        if (Number.isNaN(d.valueOf()))
          return game.localized_date || "Unknown Date";
        return d.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      })();
      if (!parkMap.has(park)) parkMap.set(park, new Map());
      const dayMap = parkMap.get(park)!;
      if (!dayMap.has(daySortVal))
        dayMap.set(daySortVal, { dayLabel, games: [] });
      dayMap.get(daySortVal)!.games.push(game);
    }
    return Array.from(parkMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([park, dayMap]) => ({
        park,
        days: Array.from(dayMap.entries())
          .sort(([a], [b]) => a - b)
          .map(([, dayData]) => dayData),
      }));
  }, [sortedGames]);

  useEffect(() => {
    const statuses = sortedGames.map((g) => ({ id: g.id, status: g.status }));
    console.log("Game statuses:", statuses);
  }, [sortedGames]);

  // Rainout detection — only today's games
  const { rainedOutVenues, allParksRainedOut } = useMemo(() => {
    const today = new Date().toLocaleDateString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
    });

    const allVenues = new Set<string>();
    const cancelledVenues = new Set<string>();

    initialGames.forEach((game) => {
      const venue = game._embedded?.venue?.name;
      if (!venue || !game.localized_date) return;

      // Only consider games scheduled for today
      const gameDate = new Date(game.localized_date).toLocaleDateString(
        "en-US",
        {
          month: "numeric",
          day: "numeric",
          year: "numeric",
        },
      );
      if (gameDate !== today) return;

      allVenues.add(venue);
      if (game.status === "C") {
        cancelledVenues.add(venue);
      }
    });

    const rainedOutVenues = Array.from(cancelledVenues).sort();
    const allParksRainedOut =
      allVenues.size > 0 && cancelledVenues.size === allVenues.size;

    return { rainedOutVenues, allParksRainedOut };
  }, [initialGames]);

  const toggleAgeSelection = (value: string) => {
    setSelectedAgeGroup((prev) => {
      const next = prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value];
      return next;
    });
    setSelectedTeam([]);
  };

  const toggleTeamSelection = (value: string) => {
    setSelectedTeam((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value],
    );
  };

  const resetAgeSelection = () => {
    setSelectedAgeGroup([]);
    setSelectedTeam([]);
  };

  const resetTeamSelection = () => {
    setSelectedTeam([]);
  };

  const handleDayFilterChange = (filter: Exclude<DayFilter, "all">) => {
    setDayFilter((current) => (current === filter ? "all" : filter));
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        ageDropdownRef.current &&
        !ageDropdownRef.current.contains(event.target as Node)
      ) {
        setAgeDropdownOpen(false);
      }
      if (
        teamDropdownRef.current &&
        !teamDropdownRef.current.contains(event.target as Node)
      ) {
        setTeamDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const downloadCSV = (games: Game[]) => {
    const headers = [
      "Date & Time",
      "Age Group",
      "Home Team",
      "Away Team",
      "Field",
      "Venue",
    ];
    const rows = games.map((game) => [
      game.localized_date
        ? `${game.localized_date} • ${game.localized_time || "TBD"}`
        : "TBD",
      game.age_group || "—",
      game.home_team || "TBD",
      game.away_team || "TBD",
      game.subvenue || "TBD",
      game._embedded?.venue?.name || "TBD",
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `schedule-${new Date().toISOString().split("T")[0]}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadXLSX = (games: Game[]) => {
    const data = games.map((game) => ({
      "Date & Time": game.localized_date
        ? `${game.localized_date} • ${game.localized_time || "TBD"}`
        : "TBD",
      "Age Group": game.age_group || "—",
      "Home Team": game.home_team || "TBD",
      "Away Team": game.away_team || "TBD",
      Field: game.subvenue || "TBD",
      Venue: game._embedded?.venue?.name || "TBD",
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Schedule");
    XLSX.writeFile(
      workbook,
      `schedule-${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  const downloadPDF = (games: Game[]) => {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    doc.setFontSize(20);
    doc.text("Schedules & Standings", 20, 20);
    doc.setFontSize(12);
    doc.text(`${getSubtitle()} • Live from Assignr`, 20, 35);

    // Build grouped body using cell objects so Park/Day rows span all columns
    type CellDef = {
      content: string;
      colSpan?: number;
      styles?: Record<string, unknown>;
    };
    type RowInput = (string | CellDef)[];
    const body: RowInput[] = [];

    const parkMap = new Map<
      string,
      Map<number, { dayLabel: string; games: Game[] }>
    >();
    for (const game of games) {
      const park = game._embedded?.venue?.name || "Unknown Venue";
      const src = game.start_time || game.localized_date;
      let daySortVal = Number.POSITIVE_INFINITY;
      let dayLabel = "Unknown Date";
      if (src) {
        const d = new Date(src);
        if (!Number.isNaN(d.valueOf())) {
          daySortVal = new Date(
            d.getFullYear(),
            d.getMonth(),
            d.getDate(),
          ).valueOf();
          dayLabel = d.toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
            year: "numeric",
          });
        } else {
          dayLabel = game.localized_date || "Unknown Date";
        }
      }
      if (!parkMap.has(park)) parkMap.set(park, new Map());
      const dayMap = parkMap.get(park)!;
      if (!dayMap.has(daySortVal))
        dayMap.set(daySortVal, { dayLabel, games: [] });
      dayMap.get(daySortVal)!.games.push(game);
    }

    Array.from(parkMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([park, dayMap]) => {
        body.push([
          {
            content: park,
            colSpan: 5,
            styles: {
              fillColor: [39, 39, 42],
              textColor: [161, 161, 170],
              fontStyle: "bold",
              fontSize: 9,
            },
          },
        ]);
        Array.from(dayMap.entries())
          .sort(([a], [b]) => a - b)
          .forEach(([, { dayLabel, games: dayGames }]) => {
            body.push([
              {
                content: `    ${dayLabel}`,
                colSpan: 5,
                styles: {
                  fillColor: [24, 24, 27],
                  textColor: [202, 138, 4],
                  fontStyle: "bold",
                  fontSize: 8,
                },
              },
            ]);
            const sorted = [...dayGames].sort((a, b) => {
              const ageDiff =
                getAgeGroupSortValue(a.age_group) -
                getAgeGroupSortValue(b.age_group);
              if (ageDiff !== 0) return ageDiff;
              return getGameSortDateValue(a) - getGameSortDateValue(b);
            });
            sorted.forEach((game) => {
              body.push([
                game.localized_time || "TBD",
                game.age_group || "—",
                game.home_team || "TBD",
                game.away_team || "TBD",
                game.subvenue || "TBD",
              ]);
            });
          });
      });

    autoTable(doc, {
      head: [["Time", "Age Group", "Home Team", "Away Team", "Field"]],
      body,
      startY: 45,
      styles: {
        fontSize: 8,
        cellPadding: 2,
        lineColor: [80, 80, 80],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [89, 2, 117],
        textColor: 255,
        lineWidth: 0.1,
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
      tableLineColor: [200, 200, 200],
      tableLineWidth: 0.1,
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 22 },
        2: { cellWidth: "auto" },
        3: { cellWidth: "auto" },
        4: { cellWidth: 38 },
      },
    });

    doc.save(`schedule-${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const selectedAgeGroupLabel =
    selectedAgeGroup.length === 0
      ? "All Age Groups"
      : selectedAgeGroup.length > 2
        ? `${selectedAgeGroup.length} selected`
        : selectedAgeGroup.join(", ");

  const selectedTeamLabel =
    selectedTeam.length === 0
      ? "All Teams"
      : selectedTeam.length > 2
        ? `${selectedTeam.length} selected`
        : selectedTeam.join(", ");

  // Build subtitle text based on filters
  const getSubtitle = () => {
    if (selectedAgeGroup.length > 0 && selectedTeam.length > 0) {
      return `${selectedAgeGroup.join(", ")} • ${selectedTeam.join(", ")}`;
    } else if (selectedAgeGroup.length > 0) {
      return selectedAgeGroup.join(", ");
    }
    return "All Games";
  };

  return (
    <section id="schedule" className="py-20 bg-zinc-950">
      <RainoutPopup
        rainedOutVenues={rainedOutVenues}
        allParksRainedOut={allParksRainedOut}
        _preview={previewRainout}
      />
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
          <div>
            <h2 className="text-4xl font-bold">Schedules</h2>
            <p className="text-zinc-400">{getSubtitle()} • Live from Assignr</p>
          </div>

          <div className="mt-6 md:mt-0 space-y-2">
            <div className="flex gap-2 justify-start md:justify-end">
              <button
                onClick={() => handleViewChange("thisWeek")}
                className={`px-6 py-3 rounded-xl font-medium transition-all ${
                  currentViewMode === "thisWeek"
                    ? "bg-brand-purple text-white"
                    : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                }`}
              >
                This Week
              </button>
              <button
                onClick={() => handleViewChange("nextWeek")}
                className={`px-6 py-3 rounded-xl font-medium transition-all ${
                  currentViewMode === "nextWeek"
                    ? "bg-brand-purple text-white"
                    : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                }`}
              >
                Next Week
              </button>
              <button
                onClick={() => handleViewChange("fullSeason")}
                className={`px-6 py-3 rounded-xl font-medium transition-all ${
                  currentViewMode === "fullSeason"
                    ? "bg-brand-purple text-white"
                    : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                }`}
              >
                Full Season
              </button>
            </div>

            {(currentViewMode === "thisWeek" ||
              currentViewMode === "fullSeason") && (
              <div className="flex gap-2 justify-start md:justify-end">
                <button
                  onClick={() => handleDayFilterChange("yesterday")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    dayFilter === "yesterday"
                      ? "bg-brand-gold text-black"
                      : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                  }`}
                >
                  Yesterday
                </button>
                <button
                  onClick={() => handleDayFilterChange("today")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    dayFilter === "today"
                      ? "bg-brand-gold text-black"
                      : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                  }`}
                >
                  Today
                </button>
                <button
                  onClick={() => handleDayFilterChange("tomorrow")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    dayFilter === "tomorrow"
                      ? "bg-brand-gold text-black"
                      : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                  }`}
                >
                  Tomorrow
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Filter Section */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex flex-col" ref={ageDropdownRef}>
            <label className="text-sm font-medium text-zinc-400 mb-2">
              Age Group
            </label>
            <button
              type="button"
              onClick={() => {
                setAgeDropdownOpen((value) => !value);
                setTeamDropdownOpen(false);
              }}
              className="flex items-center justify-between px-4 py-2 rounded-lg bg-zinc-800 text-white border border-zinc-700 hover:border-zinc-600 transition-colors cursor-pointer"
            >
              <span>{selectedAgeGroupLabel}</span>
              <span className="text-zinc-400">▾</span>
            </button>

            {ageDropdownOpen && (
              <div className="absolute left-0 top-full z-20 mt-2 w-full overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-xl">
                <button
                  type="button"
                  onClick={resetAgeSelection}
                  className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-900"
                >
                  All Age Groups
                </button>
                <div className="max-h-72 overflow-auto">
                  {ageGroups.map((group) => (
                    <button
                      key={group}
                      type="button"
                      onClick={() => toggleAgeSelection(group)}
                      className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-white hover:bg-zinc-900"
                    >
                      <span>{group}</span>
                      {selectedAgeGroup.includes(group) ? (
                        <span className="text-brand-gold">✓</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="relative flex flex-col" ref={teamDropdownRef}>
            <label className="text-sm font-medium text-zinc-400 mb-2">
              Team
            </label>
            <button
              type="button"
              onClick={() => {
                setTeamDropdownOpen((value) => !value);
                setAgeDropdownOpen(false);
              }}
              className="flex items-center justify-between px-4 py-2 rounded-lg bg-zinc-800 text-white border border-zinc-700 hover:border-zinc-600 transition-colors cursor-pointer"
            >
              <span>{selectedTeamLabel}</span>
              <span className="text-zinc-400">▾</span>
            </button>

            {teamDropdownOpen && (
              <div className="absolute left-0 top-full z-20 mt-2 w-full overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-xl">
                <button
                  type="button"
                  onClick={resetTeamSelection}
                  className="w-full px-4 py-2 text-left text-sm text-zinc-300 hover:bg-zinc-900"
                >
                  All Teams
                </button>
                <div className="max-h-72 overflow-auto">
                  {teams.map((team) => (
                    <button
                      key={team}
                      type="button"
                      onClick={() => toggleTeamSelection(team)}
                      className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-white hover:bg-zinc-900"
                    >
                      <span>{team}</span>
                      {selectedTeam.includes(team) ? (
                        <span className="text-brand-gold">✓</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Download Section */}
        {filteredGames.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-400">
                Download:
              </span>
              <button
                onClick={() => downloadCSV(sortedGames)}
                className="px-4 py-2 rounded-lg bg-zinc-800 text-white hover:bg-zinc-700 transition-colors text-sm font-medium"
              >
                CSV
              </button>
              <button
                onClick={() => downloadXLSX(sortedGames)}
                className="px-4 py-2 rounded-lg bg-zinc-800 text-white hover:bg-zinc-700 transition-colors text-sm font-medium"
              >
                Excel
              </button>
              <button
                onClick={() => downloadPDF(sortedGames)}
                className="px-4 py-2 rounded-lg bg-zinc-800 text-white hover:bg-zinc-700 transition-colors text-sm font-medium"
              >
                PDF
              </button>
            </div>
            <div className="text-xs text-zinc-500 flex items-center">
              {sortedGames.length} games • {getSubtitle()}
            </div>
          </div>
        )}

        {initialError ? (
          <div className="bg-red-950 border border-red-800 rounded-2xl p-8 text-center">
            <p className="text-red-400">Error: {initialError}</p>
          </div>
        ) : filteredGames.length === 0 ? (
          <div className="bg-zinc-900 rounded-2xl p-12 text-center">
            <p className="text-zinc-400">
              No games found for the selected filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-800">
                  <th className="py-5 px-6 text-left font-semibold">Time</th>
                  <th className="py-5 px-6 text-left font-semibold">
                    Age Group
                  </th>
                  <th className="py-5 px-6 text-left font-semibold">
                    Home Team
                  </th>
                  <th className="py-5 px-6 text-left font-semibold">
                    Away Team
                  </th>
                  <th className="py-5 px-6 text-left font-semibold">Field</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {groupedGames.map(({ park, days }) => (
                  <Fragment key={`park-group-${park}`}>
                    <tr key={`park-${park}`}>
                      <td
                        colSpan={5}
                        className="py-3 px-6 text-xs font-semibold uppercase tracking-widest text-zinc-400 bg-zinc-800/60"
                      >
                        {park.replace(/\s*Parks?$/i, "").trim() || park}
                      </td>
                    </tr>
                    {days.map(({ dayLabel, games }) => (
                      <Fragment key={`day-group-${park}-${dayLabel}`}>
                        <tr key={`day-${park}-${dayLabel}`}>
                          <td
                            colSpan={5}
                            className="py-2 px-8 text-xs font-semibold text-brand-gold/80 bg-zinc-900/80 tracking-wide"
                          >
                            {dayLabel}
                          </td>
                        </tr>
                        {games.map((game) => {
                          const fieldName = game.subvenue || "TBD";
                          const isCancelled = game.status === "C";
                          return (
                            <tr
                              key={game.id}
                              className={`transition-colors ${
                                isCancelled
                                  ? "bg-red-950/40 hover:bg-red-950/60"
                                  : "hover:bg-zinc-800/50"
                              }`}
                            >
                              <td
                                className={`py-4 px-6 font-medium whitespace-nowrap ${isCancelled ? "line-through text-red-400" : ""}`}
                              >
                                {game.localized_time || "TBD"}
                                {isCancelled && (
                                  <span
                                    className="ml-2 text-xs font-bold uppercase tracking-wide text-red-400"
                                    style={{ textDecoration: "none" }}
                                  >
                                    Cancelled
                                  </span>
                                )}
                              </td>
                              <td
                                className={`py-4 px-6 font-medium ${isCancelled ? "line-through text-red-400" : "text-brand-gold"}`}
                              >
                                {game.age_group || "—"}
                              </td>
                              <td
                                className={`py-4 px-6 ${isCancelled ? "line-through text-red-400" : ""}`}
                              >
                                {game.home_team || "TBD"}
                              </td>
                              <td
                                className={`py-4 px-6 ${isCancelled ? "line-through text-red-400" : ""}`}
                              >
                                {game.away_team || "TBD"}
                              </td>
                              <td
                                className={`py-4 px-6 font-medium ${isCancelled ? "line-through text-red-400" : "text-brand-gold"}`}
                              >
                                {fieldName}
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p
          className="text-center text-xs text-zinc-500 mt-8"
          suppressHydrationWarning
        >
          Data refreshes every 5 minutes • Last updated: {lastUpdateTime}
        </p>
      </div>
    </section>
  );
}
