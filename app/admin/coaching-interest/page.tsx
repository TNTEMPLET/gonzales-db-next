import { redirect } from "next/navigation";

/** Legacy URL — People hub Coaching Interest section. */
export default async function AdminCoachingInterestRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const { org } = await searchParams;
  const params = new URLSearchParams();
  params.set("section", "coaching-interest");
  if (org) params.set("org", org);
  else params.set("org", "fallball");
  redirect(`/admin/people?${params.toString()}`);
}
