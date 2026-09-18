/**
 * Which of a "Division played" question's options are valid for each org.
 * Gonzales DYB divisions are tagged "DYB"/"DBB" in their option text; every
 * other option belongs to Ascension LL. Fall Ball sees everything.
 */
export function divisionsForOrg(org: string, allOptions: string[]): string[] {
  const isDybOrDbb = (opt: string) => opt.includes("DYB") || opt.includes("DBB");
  if (org === "gonzales") return allOptions.filter(isDybOrDbb);
  if (org === "ascension") return allOptions.filter((opt) => !isDybOrDbb);
  if (org === "fallball") return allOptions;
  return [];
}

export function isDivisionQuestion(questionText: string): boolean {
  return questionText.toLowerCase().includes("division");
}
