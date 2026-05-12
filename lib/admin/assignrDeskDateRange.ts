export function todayIsoDate(reference = new Date()) {
  const year = reference.getFullYear();
  const month = String(reference.getMonth() + 1).padStart(2, "0");
  const day = String(reference.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function endOfYearIsoDate(from?: string) {
  const year = from?.trim()
    ? Number.parseInt(from.slice(0, 4), 10)
    : new Date().getFullYear();
  if (!Number.isFinite(year)) {
    return `${new Date().getFullYear()}-12-31`;
  }
  return `${year}-12-31`;
}

export function resolveAssignrDeskDateRange(params: {
  startDate?: string | null;
  endDate?: string | null;
}) {
  const startDate = params.startDate?.trim() || todayIsoDate();
  const endDate = params.endDate?.trim() || endOfYearIsoDate(startDate);
  return { startDate, endDate };
}
