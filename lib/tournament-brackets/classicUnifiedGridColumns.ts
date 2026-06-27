/** Match + connector track templates for classic unified DE diagrams (5- and 6-team). */
export function classicUnifiedGridTemplateColumns(options: {
  withChampionColumn: boolean;
  fluidWidth?: boolean;
}): string {
  const matchCol = options.fluidWidth ? "minmax(9rem, 1fr)" : "minmax(11rem, 1fr)";
  const connCol = options.fluidWidth ? "minmax(0.75rem, 0.28fr)" : "minmax(1.25rem, 0.28fr)";
  const parts = [
    matchCol,
    connCol,
    matchCol,
    connCol,
    matchCol,
    connCol,
    matchCol,
  ];
  if (options.withChampionColumn) {
    parts.push(connCol, matchCol);
  }
  return parts.join(" ");
}
