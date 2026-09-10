import type { AdminModule } from "@/lib/auth/adminRoles";

export type AdminReportCard = {
  id: string;
  title: string;
  description: string;
  href: string;
  hash?: string;
  module: AdminModule;
  action: string;
  /** Money reports: never mix Gonzales, Ascension, and Fall Ball. */
  splitByOrg?: boolean;
};

export const ADMIN_REPORT_CATALOG: AdminReportCard[] = [
  {
    id: "parish-field-prep",
    title: "Parish field prep",
    description: "Per-park calendar: if any game is booked that night, the parish prepares that field.",
    href: "/admin/reports/parish-field-prep",
    module: "TEAMS",
    action: "Review & send",
  },
  {
    id: "parish-enrollment",
    title: "Parish enrollment & revenue",
    description:
      "Revenue totals plus the detailed player enrollment list for one organization (Gonzales, Ascension, or Fall Ball). PDF and CSV.",
    href: "/admin/reports/parish-enrollment",
    module: "ENROLLMENT_KPI",
    action: "Review & send",
    splitByOrg: true,
  },
  {
    id: "umpire-pay",
    title: "Umpire Pay",
    description:
      "Game assignment totals and umpire payout summaries for one organization. Email to that org's treasurer when ready.",
    href: "/admin/reports/umpire-pay",
    module: "REPORTS",
    action: "Review & send",
    splitByOrg: true,
  },
  {
    id: "tournament-income",
    title: "Tournament Income",
    description: "District 6 PayPal tournament payments, review queue, and CSV export.",
    href: "/admin/reports/tournament-income",
    module: "REPORTS",
    action: "Open income report",
  },
  {
    id: "enrollment",
    title: "Enrollment & KPIs",
    description:
      "Registration counts, revenue collected vs outstanding, and team fill for one organization.",
    href: "/admin/enrollment",
    module: "ENROLLMENT_KPI",
    action: "Open enrollment",
    splitByOrg: true,
  },
  {
    id: "jersey",
    title: "Jersey Report",
    description: "Numbers and sizes by division. Email the report from Teams.",
    href: "/admin/teams",
    hash: "jersey-report",
    module: "TEAMS",
    action: "Open jersey report",
  },
  {
    id: "schedule-workbook",
    title: "Schedule Workbook",
    description: "Assignr, SportsConnect, and GameChanger upload file from Scheduler Export.",
    href: "/admin/scheduler",
    hash: "scheduler-export",
    module: "TEAMS",
    action: "Open schedule export",
  },
  {
    id: "schedule-notify",
    title: "Coach & Director Schedules",
    description: "Email team PDFs to coaches or the park-board PDF to directors.",
    href: "/admin/scheduler",
    hash: "scheduler-notify",
    module: "TEAMS",
    action: "Open notify",
  },
  {
    id: "volunteers",
    title: "Volunteer Compliance",
    description: "JDP and Abuse Awareness status export from Volunteer Cards.",
    href: "/admin/volunteers",
    module: "VOLUNTEERS",
    action: "Open volunteers",
  },
];

export function reportHref(card: AdminReportCard, org: string): string {
  const params = new URLSearchParams({ org });
  const hash = card.hash ? `#${card.hash}` : "";
  return `${card.href}?${params.toString()}${hash}`;
}

export function reportsForRole(allowModule: (module: AdminModule) => boolean): AdminReportCard[] {
  return ADMIN_REPORT_CATALOG.filter((card) => allowModule(card.module));
}

export function canSeeReportsHub(allowModule: (module: AdminModule) => boolean): boolean {
  return reportsForRole(allowModule).length > 0;
}
