export function isCommunicationsModuleEnabled() {
  const value = (process.env.COMMUNICATIONS_MODULE_ENABLED || "true").trim().toLowerCase();
  return value !== "0" && value !== "false" && value !== "off";
}

export function isSmsSendingEnabled() {
  const value = (process.env.COMMUNICATIONS_SMS_ENABLED || "false").trim().toLowerCase();
  return value === "1" || value === "true" || value === "on";
}
