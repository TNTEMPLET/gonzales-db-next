export const SPONSOR_PACKAGE_TYPES = [
  "BALLPARK_FENCE_SIGNS",
  "TEAM_SPONSORSHIPS",
  "FIELD_SPONSORSHIPS",
  "CUSTOM",
] as const;

export type SponsorPackageTypeValue = (typeof SPONSOR_PACKAGE_TYPES)[number];
