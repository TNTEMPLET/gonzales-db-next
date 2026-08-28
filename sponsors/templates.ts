import type { SponsorPackageTypeValue } from "@/lib/sponsors/catalog";

export type SponsorTemplate = {
  packageType: SponsorPackageTypeValue;
  label: string;
  minimumCommitmentCents: number | null;
  defaultAmountCents: number | null;
  additionalTeamAmountCents: number | null;
  twoYearCommitmentAmountCents: number | null;
  includesWebsiteLogo: boolean;
  includesSocialRecognition: boolean;
  includesUniformName: boolean;
  includesFieldSignage: boolean;
  includesSeasonScheduleName: boolean;
  includesAllStarMention: boolean;
};

export const SPONSOR_PACKAGE_TEMPLATES: SponsorTemplate[] = [
  {
    packageType: "BALLPARK_FENCE_SIGNS",
    label: "Ballpark Fence Signs",
    minimumCommitmentCents: 50000,
    defaultAmountCents: 50000,
    additionalTeamAmountCents: null,
    twoYearCommitmentAmountCents: null,
    includesWebsiteLogo: true,
    includesSocialRecognition: true,
    includesUniformName: false,
    includesFieldSignage: true,
    includesSeasonScheduleName: false,
    includesAllStarMention: false,
  },
  {
    packageType: "TEAM_SPONSORSHIPS",
    label: "Team Sponsorships",
    minimumCommitmentCents: 50000,
    defaultAmountCents: 50000,
    additionalTeamAmountCents: 45000,
    twoYearCommitmentAmountCents: null,
    includesWebsiteLogo: true,
    includesSocialRecognition: true,
    includesUniformName: true,
    includesFieldSignage: false,
    includesSeasonScheduleName: false,
    includesAllStarMention: false,
  },
  {
    packageType: "FIELD_SPONSORSHIPS",
    label: "Field Sponsorships",
    minimumCommitmentCents: 450000,
    defaultAmountCents: 450000,
    additionalTeamAmountCents: null,
    twoYearCommitmentAmountCents: 800000,
    includesWebsiteLogo: true,
    includesSocialRecognition: true,
    includesUniformName: false,
    includesFieldSignage: true,
    includesSeasonScheduleName: true,
    includesAllStarMention: true,
  },
];

export function getSponsorTemplate(packageType: SponsorPackageTypeValue) {
  return SPONSOR_PACKAGE_TEMPLATES.find(
    (entry) => entry.packageType === packageType,
  );
}
