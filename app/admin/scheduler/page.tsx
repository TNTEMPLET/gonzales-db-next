import { redirect } from "next/navigation";

export default async function LegacyRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await searchParams;
  const targetBase = "/admin/competition?tab=scheduler";
  const params = new URLSearchParams();
  
  if (targetBase.includes("?")) {
    const [path, query] = targetBase.split("?");
    const existing = new URLSearchParams(query);
    existing.forEach((value, key) => params.set(key, value));
  }

  for (const [key, value] of Object.entries(resolvedParams)) {
    if (value && typeof value === "string") {
      params.set(key, value);
    }
  }

  const basePath = targetBase.split("?")[0];
  redirect(`${basePath}?${params.toString()}`);
}
