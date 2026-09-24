export function parkDirectorParkKey(org: string) {
  return `park-director-working-park:${org}`;
}

export function venueMatchesPark(venue: string, parkName: string) {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const left = normalize(venue);
  const right = normalize(parkName);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}
