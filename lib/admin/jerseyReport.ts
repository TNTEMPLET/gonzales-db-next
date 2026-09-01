import prisma from "@/lib/prisma";
import {
  describeUnmatchedJerseySize,
  sortPlayersBySize,
  type UnmatchedJerseySize,
} from "@/lib/admin/jerseySizes";

export type JerseyReportPlayer = {
  jerseyNumber: string | null;
  firstName: string;
  lastName: string;
  jerseySize: string | null;
};

export type JerseyReportCoach = {
  role: "HEAD_COACH" | "ASSISTANT_COACH";
  firstName: string;
  lastName: string;
  jerseySize: string | null;
};

export type JerseyReportTeam = {
  teamName: string;
  players: JerseyReportPlayer[];
  coaches: JerseyReportCoach[];
};

export type JerseyReportDivision = {
  organizationId: string;
  seasonYear: number;
  ageGroup: string;
  teams: JerseyReportTeam[];
  playerCount: number;
  missingNumberCount: number;
  missingSizeCount: number;
  unmatchedSizes: UnmatchedJerseySize[];
};

function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace === -1) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, lastSpace), lastName: trimmed.slice(lastSpace + 1) };
}

/**
 * Builds one division's jersey report — every team's roster (number, name,
 * size) plus coaching staff, in the same shape as SportsConnect's own
 * per-team jersey report but flattened across the whole division for one
 * email. Numeric jersey numbers sort numerically ("2" before "10"); blank
 * numbers sort last, not first, so an unnumbered player doesn't look like #0.
 */
export async function buildJerseyReportForDivision(params: {
  organizationId: string;
  seasonYear: number;
  ageGroup: string;
}): Promise<JerseyReportDivision> {
  const { organizationId, seasonYear, ageGroup } = params;

  const teams = await prisma.team.findMany({
    // Excludes the "Unallocated" catch-all team (same convention as
    // lib/enrollment/kpi.ts / lib/admin/jerseyNumbers.ts) -- players sitting
    // there haven't been placed on a real roster yet, so they don't belong
    // in a jersey order report.
    where: { organizationId, seasonYear, ageGroup, NOT: { teamName: { equals: "Unallocated", mode: "insensitive" } } },
    orderBy: { teamName: "asc" },
    select: {
      teamName: true,
      players: {
        select: { jerseyNumber: true, firstName: true, lastName: true, fullName: true, jerseySize: true },
      },
      coachAssignments: {
        select: {
          role: true,
          registeredUser: {
            select: {
              firstName: true,
              lastName: true,
              name: true,
              orgProfiles: {
                where: { organizationId },
                select: { jerseySize: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  let playerCount = 0;
  let missingNumberCount = 0;
  let missingSizeCount = 0;
  const unmatchedSizes: UnmatchedJerseySize[] = [];

  const reportTeams: JerseyReportTeam[] = teams.map((team) => {
    unmatchedSizes.push(...sortPlayersBySize(team.players).unmatched);
    const players: JerseyReportPlayer[] = team.players
      .map((p) => {
        const derived = p.firstName && p.lastName ? null : splitName(p.fullName);
        return {
          jerseyNumber: p.jerseyNumber,
          firstName: p.firstName || derived?.firstName || p.fullName,
          lastName: p.lastName || derived?.lastName || "",
          jerseySize: p.jerseySize,
        };
      })
      .sort((a, b) => {
        const aNum = a.jerseyNumber?.trim() ? Number(a.jerseyNumber) : null;
        const bNum = b.jerseyNumber?.trim() ? Number(b.jerseyNumber) : null;
        if (aNum !== null && bNum !== null && !Number.isNaN(aNum) && !Number.isNaN(bNum)) {
          return aNum - bNum;
        }
        if (aNum !== null && !Number.isNaN(aNum)) return -1;
        if (bNum !== null && !Number.isNaN(bNum)) return 1;
        return a.lastName.localeCompare(b.lastName);
      });

    playerCount += players.length;
    missingNumberCount += players.filter((p) => !p.jerseyNumber?.trim()).length;
    missingSizeCount += players.filter((p) => !p.jerseySize?.trim()).length;

    const coaches: JerseyReportCoach[] = team.coachAssignments
      .map((a) => {
        const derived = a.registeredUser.firstName && a.registeredUser.lastName
          ? null
          : splitName(a.registeredUser.name || "");
        return {
          role: a.role,
          firstName: a.registeredUser.firstName || derived?.firstName || a.registeredUser.name || "",
          lastName: a.registeredUser.lastName || derived?.lastName || "",
          jerseySize: a.registeredUser.orgProfiles[0]?.jerseySize ?? null,
        };
      })
      .sort((a, b) => (a.role === b.role ? a.lastName.localeCompare(b.lastName) : a.role === "HEAD_COACH" ? -1 : 1));

    return { teamName: team.teamName, players, coaches };
  });

  return {
    organizationId,
    seasonYear,
    ageGroup,
    teams: reportTeams,
    playerCount,
    missingNumberCount,
    missingSizeCount,
    unmatchedSizes,
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeCsv(value: string) {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function jerseyReportToHtml(report: JerseyReportDivision): string {
  const roleLabel = (role: JerseyReportCoach["role"]) =>
    role === "HEAD_COACH" ? "Head Coach" : "Assistant Coach";
  const teamBlocks = report.teams
    .map((team) => {
      const playerRows = team.players
        .map(
          (p) =>
            `<tr><td style="padding:4px 10px;border:1px solid #d4d4d8">${escapeHtml(p.jerseyNumber || "—")}</td>` +
            `<td style="padding:4px 10px;border:1px solid #d4d4d8">${escapeHtml(p.firstName)}</td>` +
            `<td style="padding:4px 10px;border:1px solid #d4d4d8">${escapeHtml(p.lastName)}</td>` +
            `<td style="padding:4px 10px;border:1px solid #d4d4d8">${escapeHtml(p.jerseySize || "—")}</td></tr>`,
        )
        .join("");
      const coachRows = team.coaches
        .map(
          (c) =>
            `<tr><td style="padding:4px 10px;border:1px solid #d4d4d8">${escapeHtml(roleLabel(c.role))}</td>` +
            `<td style="padding:4px 10px;border:1px solid #d4d4d8">${escapeHtml(c.firstName)}</td>` +
            `<td style="padding:4px 10px;border:1px solid #d4d4d8">${escapeHtml(c.lastName)}</td>` +
            `<td style="padding:4px 10px;border:1px solid #d4d4d8">${escapeHtml(c.jerseySize || "—")}</td></tr>`,
        )
        .join("");
      return (
        `<h3 style="font-family:system-ui,sans-serif;margin:20px 0 6px">${escapeHtml(team.teamName)}</h3>` +
        `<table style="border-collapse:collapse;font-family:system-ui,sans-serif;font-size:13px;margin-bottom:8px">` +
        `<thead><tr style="background:#18181b;color:#fff">` +
        `<th style="padding:4px 10px;border:1px solid #d4d4d8">#</th>` +
        `<th style="padding:4px 10px;border:1px solid #d4d4d8">First Name</th>` +
        `<th style="padding:4px 10px;border:1px solid #d4d4d8">Last Name</th>` +
        `<th style="padding:4px 10px;border:1px solid #d4d4d8">Jersey Size</th></tr></thead>` +
        `<tbody>${playerRows || `<tr><td colspan="4" style="padding:4px 10px;border:1px solid #d4d4d8;color:#71717a">No players</td></tr>`}</tbody></table>` +
        (team.coaches.length > 0
          ? `<table style="border-collapse:collapse;font-family:system-ui,sans-serif;font-size:13px">` +
            `<thead><tr style="background:#3f3f46;color:#fff">` +
            `<th style="padding:4px 10px;border:1px solid #d4d4d8">Role</th>` +
            `<th style="padding:4px 10px;border:1px solid #d4d4d8">First Name</th>` +
            `<th style="padding:4px 10px;border:1px solid #d4d4d8">Last Name</th>` +
            `<th style="padding:4px 10px;border:1px solid #d4d4d8">Jersey Size</th></tr></thead>` +
            `<tbody>${coachRows}</tbody></table>`
          : "")
      );
    })
    .join("");

  const unmatchedBlock =
    report.unmatchedSizes.length > 0
      ? `<p style="font-size:13px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 12px">` +
        `<strong>Needs review — ${report.unmatchedSizes.length} size${report.unmatchedSizes.length === 1 ? "" : "s"} couldn't be sorted automatically:</strong><br/>` +
        report.unmatchedSizes
          .map((u) => escapeHtml(describeUnmatchedJerseySize(u)))
          .join("<br/>") +
        `</p>`
      : "";

  return (
    `<div style="font-family:system-ui,sans-serif;color:#18181b">` +
    `<p><strong>Jersey Report — ${escapeHtml(report.ageGroup)}</strong> (${report.seasonYear})</p>` +
    `<p style="font-size:13px;color:#71717a">${report.teams.length} team${report.teams.length === 1 ? "" : "s"}, ${report.playerCount} player${report.playerCount === 1 ? "" : "s"}` +
    (report.missingNumberCount > 0 ? ` — ${report.missingNumberCount} missing a jersey number` : "") +
    (report.missingSizeCount > 0 ? ` — ${report.missingSizeCount} missing a jersey size` : "") +
    `</p>` +
    unmatchedBlock +
    teamBlocks +
    `</div>`
  );
}

export function jerseyReportToCsv(report: JerseyReportDivision): string {
  const lines = [
    ["Team", "Role", "Jersey Number", "First Name", "Last Name", "Jersey Size"].map(escapeCsv).join(","),
  ];
  for (const team of report.teams) {
    for (const p of team.players) {
      lines.push(
        [team.teamName, "Player", p.jerseyNumber || "", p.firstName, p.lastName, p.jerseySize || ""]
          .map(escapeCsv)
          .join(","),
      );
    }
    for (const c of team.coaches) {
      const roleLabel = c.role === "HEAD_COACH" ? "Head Coach" : "Assistant Coach";
      lines.push(
        [team.teamName, roleLabel, "", c.firstName, c.lastName, c.jerseySize || ""]
          .map(escapeCsv)
          .join(","),
      );
    }
  }
  return lines.join("\n");
}
