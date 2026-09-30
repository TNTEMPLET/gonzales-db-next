/**
 * Field column already says Field, so drop a trailing "Field"
 * ("1 - Impact Sports Field" → "1 - Impact Sports", "Aldridge Field" → "Aldridge").
 * Leave names like "Field 1" alone.
 */
export function formatReportFieldName(value: string | null | undefined): string {
  const trimmed = (value ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "—";
  const withoutField = trimmed.replace(/\s+fields?$/i, "").trim();
  return withoutField || trimmed;
}
