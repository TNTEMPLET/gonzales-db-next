import type { SportsConnectReportCatalogEntry } from "./types";

/**
 * Operator checklist: which SportsConnect export feeds which platform job.
 * Update when SC report names change — keep synthetic fixtures in sync.
 */
export const SPORTS_CONNECT_REPORT_CATALOG: SportsConnectReportCatalogEntry[] = [
  {
    kind: "TEAM_LIST",
    title: "Team list",
    summary:
      "Create or update season teams (age group + team name / MLB name) before loading players.",
    exportHint:
      "If teams are not already built: export or build a simple Age Group + Team Name list (Fall Ball often uses MLB team names).",
    requiredColumnGroups: [["Age Group", "age_group", "Division Name"], ["Team Name", "MLB Team", "Team"]],
    optionalColumnHints: ["Sponsor", "Head Coach Last Name"],
    adminPath: "/admin/teams",
    adminLabel: "Teams → Import Team List",
    sortOrder: 10,
  },
  {
    kind: "PLAYER_REG",
    title: "Player registration report",
    summary:
      "Load registered players onto team rosters with guardian contact, payment, and waiver fields.",
    exportHint:
      "SportsConnect → Registration / Participants report for the program season. Export CSV or Excel. Include division, team, player name, and parent/account email when possible.",
    requiredColumnGroups: [
      ["Division Name", "Division", "Program Division", "Age Group"],
      ["Team Name", "Team", "Assigned Team", "Roster Team Name"],
      [
        "Player Full Name",
        "Participant Name",
        "Player Name",
        "Player First Name",
        "Full Name",
      ],
    ],
    optionalColumnHints: [
      "User Email",
      "Parent Email",
      "Guardian Email",
      "Order Payment Status",
      "Birth Certificate",
      "Player Birth Date",
      "Jersey Number",
    ],
    adminPath: "/admin/teams",
    adminLabel: "Teams → SportsConnect Player Import",
    sortOrder: 20,
  },
  {
    kind: "COACH_VOLUNTEER",
    title: "Coach / volunteer sheet",
    summary:
      "Create coach accounts and optional team assignments from volunteer registration exports.",
    exportHint:
      "SportsConnect volunteer / coach registration export with email and role. Rows without coach roles are skipped.",
    requiredColumnGroups: [
      ["email", "Email", "User Email", "Account Email", "Volunteer Email Address", "Volunteer Email"],
      ["Volunteer Role", "Role", "role"],
    ],
    optionalColumnHints: [
      "first_name",
      "last_name",
      "Volunteer First Name",
      "Volunteer Last Name",
      "contact_phone",
      "age_group",
      "assigned_team",
      "Volunteer Telephone",
      "Volunteer Cellphone",
    ],
    adminPath: "/admin/teams",
    adminLabel: "Teams → Coach Import",
    sortOrder: 30,
  },
];

export function getReportCatalogEntry(kind: string) {
  return SPORTS_CONNECT_REPORT_CATALOG.find((e) => e.kind === kind) ?? null;
}

export function recommendedLoadOrder(): SportsConnectReportCatalogEntry[] {
  return [...SPORTS_CONNECT_REPORT_CATALOG].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}
