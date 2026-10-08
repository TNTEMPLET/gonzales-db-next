/**
 * Same marker as scripts/staging/scrub.sql. Production must never carry
 * public._environment = 'staging'. Missing, empty, or any other value refuses.
 */
export type StagingMarker = "missing" | "multiple" | string | null;

export function stagingMarkerRefusal(marker: StagingMarker): string | null {
  if (marker === "missing") {
    return "refusing to prefill venues: public._environment marker is missing";
  }
  if (marker === "multiple") {
    return "refusing to prefill venues: public._environment must contain exactly one row";
  }
  if (marker !== "staging") {
    return "refusing to prefill venues: public._environment value is not staging";
  }
  return null;
}
