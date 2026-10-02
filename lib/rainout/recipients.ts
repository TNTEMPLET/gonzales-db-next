import { formatNotifyClock, formatNotifyDate } from "@/lib/scheduler/coachScheduleEmail";

import { displayParkName, parkIsListed, parkKey } from "./parks";

export type RainoutTeamRef = {
  id: string;
  teamName: string;
  ageGroup: string;
};

export type RainoutGameInput = {
  id: string;
  parkName: string;
  startTime: string;
  division: string;
  ageGroup: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeTeamName: string;
  awayTeamName: string;
};

export type RainoutPlayerInput = {
  teamId: string;
  fullName: string;
  guardianEmail: string | null;
};

export type RainoutAppearance = {
  playerName: string;
  teamName: string;
  ageGroup: string;
  parkName: string;
  startTime: string;
  timeLabel: string;
  opponent: string;
  rainedOut: boolean;
};

export type RainoutFamilyEmail = {
  email: string;
  mode: "all_games" | "mixed";
  subject: string;
  text: string;
  html: string;
  appearances: RainoutAppearance[];
};

export function normalizeGuardianEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const email = value.trim().toLowerCase();
  if (!email.includes("@")) return null;
  const [local, domain] = email.split("@");
  if (!local || !domain || domain.includes("@")) return null;
  return email;
}

export function resolveRainoutTeam(
  teams: RainoutTeamRef[],
  side: {
    teamId: string | null;
    teamName: string;
    division: string;
    ageGroup: string | null;
  },
): RainoutTeamRef | null {
  if (side.teamId) {
    return teams.find((team) => team.id === side.teamId) ?? null;
  }
  const name = side.teamName.trim();
  if (!name) return null;
  const ageGroup = side.ageGroup?.trim() || "";
  const division = side.division.trim();
  return (
    teams.find((team) => {
      if (team.teamName.trim() !== name) return false;
      if (!ageGroup && !division) return true;
      return team.ageGroup === ageGroup || team.ageGroup === division;
    }) ?? null
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function appearanceLine(appearance: RainoutAppearance): string {
  const team = appearance.ageGroup
    ? `${appearance.teamName}, ${appearance.ageGroup}`
    : appearance.teamName;
  const versus = appearance.opponent ? ` vs ${appearance.opponent}` : "";
  return `${appearance.playerName} (${team}) at ${appearance.parkName}, ${appearance.timeLabel}${versus}`;
}

function renderFamilyEmail(input: {
  orgName: string;
  calendarDate: string;
  email: string;
  appearances: RainoutAppearance[];
}): RainoutFamilyEmail {
  const allOut = input.appearances.every((appearance) => appearance.rainedOut);
  const mode = allOut ? "all_games" : "mixed";
  const dateLabel = formatNotifyDate(input.calendarDate) || input.calendarDate;
  const heading = allOut
    ? "All of your games today are rained out."
    : "Some of your games today are rained out. Others are still on.";
  const subject = allOut
    ? `${input.orgName}: all of your games today are rained out`
    : `${input.orgName}: some of your games today are rained out`;

  const lines = input.appearances.map(appearanceLine);
  const cancelled = input.appearances.filter((appearance) => appearance.rainedOut).map(appearanceLine);
  const stillOn = input.appearances.filter((appearance) => !appearance.rainedOut).map(appearanceLine);

  const text = allOut
    ? [heading, "", `${input.orgName} — ${dateLabel}`, "", ...lines.map((line) => `- ${line}`)].join("\n")
    : [
        heading,
        "",
        `${input.orgName} — ${dateLabel}`,
        "",
        "Cancelled:",
        ...cancelled.map((line) => `- ${line}`),
        "",
        "Still on:",
        ...stillOn.map((line) => `- ${line}`),
      ].join("\n");

  const list = (items: string[]) =>
    `<ul>${items.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`;
  const html = allOut
    ? `<p><strong>${escapeHtml(heading)}</strong></p><p>${escapeHtml(input.orgName)} — ${escapeHtml(dateLabel)}</p>${list(lines)}`
    : `<p><strong>${escapeHtml(heading)}</strong></p><p>${escapeHtml(input.orgName)} — ${escapeHtml(dateLabel)}</p><p>Cancelled:</p>${list(cancelled)}<p>Still on:</p>${list(stillOn)}`;

  return {
    email: input.email,
    mode,
    subject,
    text,
    html,
    appearances: input.appearances,
  };
}

/**
 * One email per guardian. Families with no child at a newly rained-out park are omitted.
 * Appearances include the family's other games today so mixed days can say what is still on.
 */
export function groupRainoutFamilies(input: {
  orgName: string;
  calendarDate: string;
  games: RainoutGameInput[];
  teams: RainoutTeamRef[];
  players: RainoutPlayerInput[];
  allParksOut: boolean;
  rainedOutParks: string[];
  newlyAffectedParks: string[];
}): RainoutFamilyEmail[] {
  const playersByTeam = new Map<string, RainoutPlayerInput[]>();
  for (const player of input.players) {
    const list = playersByTeam.get(player.teamId) ?? [];
    list.push(player);
    playersByTeam.set(player.teamId, list);
  }

  const grouped = new Map<string, Map<string, RainoutAppearance>>();

  for (const game of input.games) {
    const parkName = displayParkName(game.parkName);
    const rainedOut = input.allParksOut || parkIsListed(parkName, input.rainedOutParks);
    const sides = [
      {
        teamId: game.homeTeamId,
        teamName: game.homeTeamName,
        division: game.division,
        ageGroup: game.ageGroup,
        opponent: game.awayTeamName.trim(),
      },
      {
        teamId: game.awayTeamId,
        teamName: game.awayTeamName,
        division: game.division,
        ageGroup: game.ageGroup,
        opponent: game.homeTeamName.trim(),
      },
    ];

    for (const side of sides) {
      const team = resolveRainoutTeam(input.teams, side);
      if (!team) continue;
      for (const player of playersByTeam.get(team.id) ?? []) {
        const email = normalizeGuardianEmail(player.guardianEmail);
        const playerName = player.fullName.trim();
        if (!email || !playerName) continue;
        const appearance: RainoutAppearance = {
          playerName,
          teamName: team.teamName,
          ageGroup: team.ageGroup,
          parkName,
          startTime: game.startTime.trim(),
          timeLabel: formatNotifyClock(game.startTime) || game.startTime.trim(),
          opponent: side.opponent,
          rainedOut,
        };
        const key = [
          parkKey(parkName),
          appearance.startTime,
          team.id,
          playerName.toLowerCase(),
          appearance.rainedOut ? "out" : "on",
        ].join("|");
        const family = grouped.get(email) ?? new Map<string, RainoutAppearance>();
        if (!family.has(key)) family.set(key, appearance);
        grouped.set(email, family);
      }
    }
  }

  const families: RainoutFamilyEmail[] = [];
  for (const [email, appearances] of grouped) {
    const rows = [...appearances.values()].sort((a, b) => {
      return (
        a.startTime.localeCompare(b.startTime) ||
        a.parkName.localeCompare(b.parkName) ||
        a.playerName.localeCompare(b.playerName)
      );
    });
    const triggersSend = rows.some(
      (appearance) => appearance.rainedOut && parkIsListed(appearance.parkName, input.newlyAffectedParks),
    );
    if (!triggersSend) continue;
    families.push(
      renderFamilyEmail({
        orgName: input.orgName,
        calendarDate: input.calendarDate,
        email,
        appearances: rows,
      }),
    );
  }

  families.sort((a, b) => a.email.localeCompare(b.email));
  return families;
}
