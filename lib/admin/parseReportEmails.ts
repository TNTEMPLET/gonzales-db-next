const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export function parseReportEmails(value: unknown): { emails: string[]; skipped: number } {
  const tokens = (typeof value === "string" ? value.split(/[,;\s]+/) : Array.isArray(value) ? value.map(String) : [])
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  const seen = new Set<string>();
  const emails: string[] = [];
  let skipped = 0;
  for (const token of tokens) {
    if (!EMAIL_RE.test(token)) {
      skipped += 1;
      continue;
    }
    if (seen.has(token)) continue;
    seen.add(token);
    emails.push(token);
  }
  return { emails, skipped };
}
