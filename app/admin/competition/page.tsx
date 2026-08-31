import { redirect } from "next/navigation";

const TAB_TO_PATH: Record<string, string> = {
  teams: "/admin/teams",
  "sports-connect": "/admin/sports-connect",
  enrollment: "/admin/enrollment",
  draft: "/admin/draft",
  scores: "/admin/scores",
  scheduler: "/admin/scheduler",
  assignr: "/admin/assignr",
  registration: "/admin/registration",
};

export default async function LegacyCompetitionRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await searchParams;
  const tabValue = resolvedParams.tab;
  const tab = typeof tabValue === "string" ? tabValue : "teams";
  const basePath = TAB_TO_PATH[tab] || TAB_TO_PATH.teams;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedParams)) {
    if (key === "tab") continue;
    if (value && typeof value === "string") {
      params.set(key, value);
    }
  }

  const query = params.toString();
  redirect(query ? `${basePath}?${query}` : basePath);
}
