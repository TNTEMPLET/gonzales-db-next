import { redirect } from "next/navigation";

const SECTION_TO_PATH: Record<string, string> = {
  directory: "/admin/users",
  volunteers: "/admin/volunteers",
  "coaching-interest": "/admin/coaching-interest",
  roles: "/admin/roles",
};

export default async function LegacyPeopleRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await searchParams;
  const sectionValue = resolvedParams.section;
  const userId = resolvedParams.userId;
  const section =
    typeof sectionValue === "string"
      ? sectionValue
      : userId
        ? "volunteers"
        : "directory";
  const basePath = SECTION_TO_PATH[section] || SECTION_TO_PATH.directory;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resolvedParams)) {
    if (key === "section") continue;
    if (value && typeof value === "string") {
      params.set(key, value);
    }
  }

  const query = params.toString();
  redirect(query ? `${basePath}?${query}` : basePath);
}
