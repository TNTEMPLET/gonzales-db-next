"use client";

import { useEffect, useState } from "react";

import {
  readAdminViewPreviewRole,
  type AdminViewPreviewRole,
} from "@/components/admin/AdminRolePreviewControl";
import { gameDayRainoutWriteForPreview } from "@/lib/rainout/dashboardPreview";
import type { ContentOrgId } from "@/lib/siteConfig";

/**
 * Live `canWrite` from the server, replaced while a dashboard role preview
 * is active. Starts at the live flag so server and client markup match, then
 * reads the same session preview the module grid uses.
 */
export function usePreviewedRainoutWrite(input: {
  organizationId: ContentOrgId;
  liveAllowed: boolean;
  allowRolePreview: boolean;
}): boolean {
  const { organizationId, liveAllowed, allowRolePreview } = input;
  const [previewRole, setPreviewRole] = useState<AdminViewPreviewRole>("NONE");

  useEffect(() => {
    if (!allowRolePreview) return;
    const sync = () => setPreviewRole(readAdminViewPreviewRole(organizationId));
    sync();
    window.addEventListener("admin-view-preview-updated", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("admin-view-preview-updated", sync);
      window.removeEventListener("storage", sync);
    };
  }, [allowRolePreview, organizationId]);

  if (!allowRolePreview) return liveAllowed;
  return gameDayRainoutWriteForPreview({ previewRole, liveAllowed });
}
