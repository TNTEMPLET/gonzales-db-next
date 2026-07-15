import { redirect } from "next/navigation";

/** Legacy URL — People hub Directory section. */
export default async function AdminUsersRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const params = new URLSearchParams();
  params.set("section", "directory");
  if (org) params.set("org", org);
  redirect(`/admin/people?${params.toString()}`);
}
