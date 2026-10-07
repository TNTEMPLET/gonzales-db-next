const EMAIL_IN_TEXT = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** Escape text that will be inserted with `dangerouslySetInnerHTML`. */
export function escapeScoutHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * HTML for a Scout string that may contain an email address.
 *
 * Cloudflare Email Address Obfuscation rewrites addresses in `text/html` and
 * skips `<script>` payloads. The tickets page then hydrates with the real
 * address from props while the DOM text node stops at the space before the
 * address (`Name · `). `<!--email_off-->` is Cloudflare's per-address opt-out.
 */
export function scoutVisibleHtml(text: string): string {
  const escaped = escapeScoutHtml(text);
  if (!EMAIL_IN_TEXT.test(text)) return escaped;
  return `<!--email_off-->${escaped}<!--/email_off-->`;
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
