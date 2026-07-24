export const DEFAULT_TRIP_INVITE_SUBJECT =
  "Action needed: {{player_name}} travel form — {{event_name}}";

export const DEFAULT_TRIP_INVITE_BODY = `Hi {{guardian_first_name}},

Please complete the travel roster form for {{player_name}} for {{event_name}}.

Open your personalized link (do not forward — this form is only for this player):
{{invite_url}}

Thank you,
{{org_name}}`;

export type TripInviteMergeVars = {
  player_name: string;
  player_first_name: string;
  guardian_name: string;
  guardian_first_name: string;
  event_name: string;
  team_label: string;
  org_name: string;
  invite_url: string;
};

export function applyTripInviteTemplate(
  template: string,
  vars: TripInviteMergeVars,
): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, value);
  }
  out = out.replace(/\{\{[a-z0-9_]+\}\}/gi, "");
  return out;
}
