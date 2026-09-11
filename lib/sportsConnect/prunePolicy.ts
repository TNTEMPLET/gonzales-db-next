export function pruneWouldBeUnsafe(input: {
  existingCount: number;
  keepCount: number;
  matchingCount: number;
}): string | null {
  if (input.keepCount < 1) return "Latest file produced no enrollment keys";
  const floor = Math.max(50, Math.floor(input.existingCount * 0.5));
  if (input.existingCount >= 50 && input.keepCount < floor) {
    return `Refusing to prune: file has ${input.keepCount} players but the site has ${input.existingCount}`;
  }
  if (input.existingCount >= 50 && input.matchingCount < floor) {
    return `Refusing to prune: only ${input.matchingCount} of ${input.existingCount} site players match the latest file`;
  }
  return null;
}
