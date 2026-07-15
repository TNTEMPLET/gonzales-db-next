import { redirect } from "next/navigation";

/** Legacy URL — People hub Volunteer Cards section. */
export default async function AdminVolunteersRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; userId?: string }>;
}) {
  const { org, userId } = await searchParams;
  const params = new URLSearchParams();
  params.set("section", "volunteers");
  if (org) params.set("org", org);
  if (userId) params.set("userId", userId);
  redirect(`/admin/people?${params.toString()}`);
}
