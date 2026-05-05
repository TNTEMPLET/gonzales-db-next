import { canApproveCampaign, canSendForOrg, isWithinQuietHours } from "@/lib/communications/policy";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

export function runCommunicationsPolicySmokeTests() {
  assert(canSendForOrg("ADMIN", "ascension", "ascension"), "admin should send for own org");
  assert(!canSendForOrg("ADMIN", "gonzales", "ascension"), "org admin cannot send cross-org");
  assert(canSendForOrg("MASTER_ADMIN", null, "ascension"), "master should send globally");

  assert(
    canApproveCampaign({
      approverRole: "BOARD_MEMBER",
      approverAdminId: "b",
      campaignCreatedByAdminId: "a",
    }),
    "board member should approve when not creator",
  );
  assert(
    !canApproveCampaign({
      approverRole: "BOARD_MEMBER",
      approverAdminId: "a",
      campaignCreatedByAdminId: "a",
    }),
    "creator should not approve own campaign",
  );

  const inside = new Date("2026-01-01T23:00:00.000Z");
  assert(isWithinQuietHours(inside, 22, 7), "23:00 should be quiet-hours for overnight window");
}
