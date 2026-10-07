/**
 * Tickets URL. `shellOrg` is the admin console's current org (sidebar, dashboard).
 * Scout's own org filter is `orgTag`. List queries never read `shellOrg`.
 */
export function scoutTicketsHref(input: {
  shellOrg: string;
  status: string;
  orgTag: string;
  sender: string;
  ticketId?: string | null;
}): string {
  const params = new URLSearchParams();
  if (input.shellOrg) params.set("org", input.shellOrg);
  if (input.status && input.status !== "all") params.set("status", input.status);
  if (input.orgTag && input.orgTag !== "all") params.set("orgTag", input.orgTag);
  const sender = input.sender.trim();
  if (sender) params.set("sender", sender);
  if (input.ticketId) params.set("ticket", input.ticketId);
  const query = params.toString();
  return query ? `/admin/tickets?${query}` : "/admin/tickets";
}
