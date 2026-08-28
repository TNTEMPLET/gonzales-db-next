/** Estimate missing guardian emails from raw import rows (preview / client-safe). */
export function estimateMissingGuardianEmailFromRows(
  rows: Array<Record<string, unknown>>,
  emailKeys: readonly string[] = [
    "User Email",
    "Account Email",
    "Parent Email",
    "Guardian Email",
    "Email",
    "email",
  ],
): { total: number; missingGuardianEmail: number } {
  let missingGuardianEmail = 0;
  for (const row of rows) {
    let email = "";
    for (const key of emailKeys) {
      const value = row[key];
      if (value === undefined || value === null) continue;
      const parsed = String(value).trim();
      if (parsed) {
        email = parsed;
        break;
      }
    }
    if (!email) missingGuardianEmail += 1;
  }
  return { total: rows.length, missingGuardianEmail };
}
