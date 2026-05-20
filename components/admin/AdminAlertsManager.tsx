"use client";

import { useState, useTransition } from "react";
import type { ContentOrgId } from "@/lib/siteConfig";
import { createOrgAlert, deleteOrgAlert } from "@/app/admin/alerts/actions";

type OrgAlert = {
  id: string;
  organizationId: string;
  allParksOut: boolean;
  venues: string[];
  expiresAt: Date;
  createdAt: Date;
};

type Props = {
  activeAlerts: OrgAlert[];
  availableOrgs: { id: ContentOrgId; name: string }[];
  defaultOrg: ContentOrgId;
};

function formatLocal(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function defaultMidnight() {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  // datetime-local value needs format: YYYY-MM-DDTHH:MM
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T23:59`;
}

export default function AdminAlertsManager({ activeAlerts, availableOrgs, defaultOrg }: Props) {
  const [isPending, startTransition] = useTransition();
  const [allParksOut, setAllParksOut] = useState(true);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleDelete(id: string) {
    setDeleteError(null);
    startTransition(async () => {
      try {
        await deleteOrgAlert(id);
      } catch {
        setDeleteError("Failed to delete alert. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-10">
      {/* Active Alerts */}
      <section>
        <h2 className="mb-4 text-xl font-bold">Active Alerts</h2>
        {activeAlerts.length === 0 ? (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4 text-zinc-400">
            No active rainout alerts. Sites show the automatic Assignr detection.
          </p>
        ) : (
          <div className="space-y-3">
            {activeAlerts.map((alert) => {
              const org = availableOrgs.find((o) => o.id === alert.organizationId);
              return (
                <div
                  key={alert.id}
                  className="flex flex-col gap-3 rounded-xl border border-red-800/40 bg-red-950/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-red-700 px-2.5 py-0.5 text-xs font-semibold text-white">
                        {org?.name ?? alert.organizationId}
                      </span>
                      <span className="text-sm font-semibold text-red-300">
                        {alert.allParksOut ? "All Parks Rained Out" : `${alert.venues.length} venue(s) rained out`}
                      </span>
                    </div>
                    {!alert.allParksOut && alert.venues.length > 0 ? (
                      <p className="text-sm text-zinc-400">{alert.venues.join(", ")}</p>
                    ) : null}
                    <p className="text-xs text-zinc-500">
                      Expires: {formatLocal(new Date(alert.expiresAt))}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(alert.id)}
                    disabled={isPending}
                    className="shrink-0 rounded-lg border border-red-700 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-900/40 disabled:opacity-50"
                  >
                    Clear Alert
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {deleteError ? (
          <p className="mt-2 text-sm text-red-400">{deleteError}</p>
        ) : null}
      </section>

      {/* Create New Alert */}
      <section>
        <h2 className="mb-4 text-xl font-bold">Post New Rainout Alert</h2>
        <form
          action={createOrgAlert}
          className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-5"
        >
          {/* Org selector */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Site
            </label>
            <select
              name="org"
              defaultValue={defaultOrg}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
            >
              {availableOrgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          {/* All parks vs specific venues */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Scope
            </label>
            <div className="flex gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="allParksOut"
                  value="true"
                  checked={allParksOut}
                  onChange={() => setAllParksOut(true)}
                  className="accent-red-600"
                />
                All Parks
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="allParksOut"
                  value="false"
                  checked={!allParksOut}
                  onChange={() => setAllParksOut(false)}
                  className="accent-red-600"
                />
                Specific Venues
              </label>
            </div>
          </div>

          {/* Venue list (shown only when specific venues selected) */}
          {!allParksOut ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                Venues <span className="text-zinc-500">(one per line)</span>
              </label>
              <textarea
                name="venues"
                rows={4}
                placeholder={"Diamond Park #1\nGonzales Main Field"}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-600 focus:border-red-500 focus:outline-none"
              />
            </div>
          ) : (
            <input type="hidden" name="venues" value="" />
          )}

          {/* Expiry */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Expires At
            </label>
            <input
              type="datetime-local"
              name="expiresAt"
              defaultValue={defaultMidnight()}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Uses your browser&apos;s local time. Alert clears automatically after this time.
            </p>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-red-700 px-6 py-2.5 font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
          >
            Post Rainout Alert
          </button>
        </form>
      </section>
    </div>
  );
}
