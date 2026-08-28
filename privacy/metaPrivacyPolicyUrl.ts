import { getSiteConfig, isMasterDeployment } from "@/lib/siteConfig";

const MASTER_PRIVACY_PATH = "/privacy";

function stripTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

/** Public privacy policy URL for the Meta developer app (master admin deployment). */
export function getMetaPrivacyPolicyUrl(): string {
  const override = process.env.META_PRIVACY_POLICY_URL?.trim();
  if (override) return override;

  if (isMasterDeployment()) {
    return `${stripTrailingSlash(getSiteConfig().siteUrl)}${MASTER_PRIVACY_PATH}`;
  }

  return `https://admin.apbaseball.com${MASTER_PRIVACY_PATH}`;
}
