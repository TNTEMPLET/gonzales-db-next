export function isCommunicationsModuleEnabled() {
  const value = (process.env.COMMUNICATIONS_MODULE_ENABLED || "true").trim().toLowerCase();
  return value !== "0" && value !== "false" && value !== "off";
}
