import { createElement, Fragment, type ReactNode } from "react";

/**
 * Cloudflare Email Address Obfuscation rewrites addresses in `text/html` and
 * skips the RSC payload, so a ticket row hydrates as `Name · ` while the
 * client still has the address. `<!--email_off-->` … `<!--/email_off-->` is
 * Cloudflare's documented opt-out for a section of HTML.
 *
 * Cloudflare removes those comments after honoring them, so the HTML the
 * browser hydrates is empty while the client still has the comment.
 * `suppressHydrationWarning` accepts either form. Ticket text stays a React
 * child. Only these two constant comments are inserted as HTML, so a subject
 * cannot terminate the opt-out or open a tag.
 */
const EMAIL_OFF_OPEN_HTML = "<!--email_off-->";
const EMAIL_OFF_CLOSE_HTML = "<!--/email_off-->";

function emailOffMarker(which: "open" | "close"): ReactNode {
  return createElement("span", {
    hidden: true,
    "aria-hidden": "true",
    "data-scout-email": which,
    suppressHydrationWarning: true,
    dangerouslySetInnerHTML: {
      __html: which === "open" ? EMAIL_OFF_OPEN_HTML : EMAIL_OFF_CLOSE_HTML,
    },
  });
}

/** Opts a Scout subtree out of Email Address Obfuscation without parsing its text as HTML. */
export function ScoutEmailOff({ children }: { children: ReactNode }): ReactNode {
  return createElement(Fragment, null, emailOffMarker("open"), children, emailOffMarker("close"));
}

export function scoutSenderLine(name: string | null, email: string): string {
  return name ? `${name} · ${email}` : email;
}

/** One text node for a list row so the address, time, and org stay together. */
export function scoutTicketListMeta(input: {
  senderName: string | null;
  senderEmail: string;
  when: string;
  orgLabel: string | null;
}): string {
  const sender = scoutSenderLine(input.senderName, input.senderEmail);
  return input.orgLabel ? `${sender} · ${input.when} · ${input.orgLabel}` : `${sender} · ${input.when}`;
}

export function scoutMessageMeta(input: {
  senderName: string | null;
  senderEmail: string;
  when: string;
}): string {
  return `${scoutSenderLine(input.senderName, input.senderEmail)} · ${input.when}`;
}
