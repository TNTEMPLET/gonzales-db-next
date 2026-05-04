/** SessionStorage key: login modal stashes context before navigating to /account/setup */
export const ACCOUNT_SETUP_PREFILL_KEY = "gdb-account-setup-prefill";

export type AccountSetupPrefillPayload = {
  email: string;
  password?: string;
  setupProfile?: {
    firstName?: string;
    lastName?: string;
    contactPhone?: string;
    ageGroup?: string;
    assignedTeam?: string;
  } | null;
};
