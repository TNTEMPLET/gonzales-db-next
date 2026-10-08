"use client";

import { useActionState } from "react";
import Link from "next/link";

import {
  checkInRemoteAction,
  createRemoteAction,
  updateRemoteAction,
  type RemoteActionState,
} from "@/app/admin/game-day/remoteActions";
import { SCOREBOARD_CONTROLLER_STATUSES, type RemoteInventoryScreen } from "@/lib/admin/scoreboardRemotes/present";

const initial: RemoteActionState = { error: null };

const fieldClass =
  "min-h-12 w-full rounded-xl border border-neutral-400 bg-white px-3 text-base text-neutral-950";

const STATUS_LABEL: Record<(typeof SCOREBOARD_CONTROLLER_STATUSES)[number], string> = {
  ACTIVE: "Active",
  MISSING: "Missing",
  REPAIR: "Repair",
  RETIRED: "Retired",
};

export default function ManageRemotes({
  orgId,
  screen,
  backHref,
}: {
  orgId: string;
  screen: RemoteInventoryScreen;
  backHref: string;
}) {
  return (
    <main className="min-h-screen bg-neutral-100 px-4 py-4 pb-16 text-neutral-950" data-manage-remotes="true">
      <div className="mx-auto max-w-lg">
        <Link href={backHref} className="text-sm font-semibold text-neutral-950 underline">
          Remote tab
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Remotes</h1>
        <p className="mt-2 text-base text-neutral-700">
          Each sticker on a remote is one row. Retired remotes stay on this list and stay off check-out.
        </p>
        {screen.canWrite ? null : (
          <p className="mt-3 rounded-xl bg-neutral-200 px-3 py-3 text-sm text-neutral-800">
            You can look up remotes. A league admin or the park director changes them.
          </p>
        )}
        {screen.venues.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-neutral-300 bg-white px-4 py-6 text-base text-neutral-700">
            No parks to manage. A director needs an assigned park. A league admin sees parks that league has linked.
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            {screen.venues.map((venue) => (
              <section key={venue.id} className="space-y-3">
                <h2 className="text-xl font-bold">{venue.name}</h2>
                {venue.remotes.length === 0 ? (
                  <p className="text-sm text-neutral-600">No remotes at this park yet.</p>
                ) : (
                  venue.remotes.map((remote) => (
                    <RemoteEditor key={remote.id} orgId={orgId} remote={remote} canWrite={screen.canWrite} />
                  ))
                )}
                {screen.canWrite ? <AddRemote orgId={orgId} venueId={venue.id} /> : null}
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function RemoteEditor({
  orgId,
  remote,
  canWrite,
}: {
  orgId: string;
  remote: RemoteInventoryScreen["venues"][number]["remotes"][number];
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(updateRemoteAction, initial);
  return (
    <div className="space-y-3 rounded-2xl border border-neutral-300 bg-white p-4">
      {remote.openCheckout ? (
        <div className="space-y-3 rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-950">
          <p>
            Out with {remote.openCheckout.volunteerName} since {remote.openCheckout.sinceLabel}. You can mark it
            missing.
          </p>
          <CheckInForm checkoutId={remote.openCheckout.id} />
        </div>
      ) : null}
      <form action={canWrite ? action : undefined} className="space-y-3">
      <input type="hidden" name="org" value={orgId} />
      <input type="hidden" name="controllerId" value={remote.id} />
      <label className="block text-sm font-semibold">
        Label
        {canWrite ? (
          <input name="label" required maxLength={40} defaultValue={remote.label} className={`${fieldClass} mt-1`} />
        ) : (
          <span className="mt-1 block text-base font-normal">{remote.label}</span>
        )}
      </label>
      <label className="block text-sm font-semibold">
        Home field
        {canWrite ? (
          <input
            name="homeFieldName"
            maxLength={80}
            defaultValue={remote.homeFieldName ?? ""}
            placeholder="Field 3"
            className={`${fieldClass} mt-1`}
          />
        ) : (
          <span className="mt-1 block text-base font-normal">{remote.homeFieldName || "None"}</span>
        )}
      </label>
      <label className="block text-sm font-semibold">
        Notes
        {canWrite ? (
          <textarea
            name="notes"
            maxLength={500}
            defaultValue={remote.notes ?? ""}
            rows={2}
            className={`${fieldClass} mt-1 py-2`}
          />
        ) : (
          <span className="mt-1 block text-base font-normal">{remote.notes || "None"}</span>
        )}
      </label>
      <label className="block text-sm font-semibold">
        Status
        {canWrite ? (
          <select name="status" defaultValue={remote.status} className={`${fieldClass} mt-1`}>
            {SCOREBOARD_CONTROLLER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        ) : (
          <span className="mt-1 block text-base font-normal">{STATUS_LABEL[remote.status]}</span>
        )}
      </label>
      {canWrite ? (
        <>
          {state.error ? <p className="text-sm font-medium text-red-800">{state.error}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="min-h-12 w-full rounded-xl bg-neutral-950 px-4 text-base font-semibold text-white disabled:opacity-60"
          >
            Save remote
          </button>
        </>
      ) : null}
      </form>
    </div>
  );
}

function CheckInForm({ checkoutId }: { checkoutId: string }) {
  const [state, action, pending] = useActionState(checkInRemoteAction, initial);
  return (
    <form action={action}>
      <input type="hidden" name="checkoutId" value={checkoutId} />
      {state.error ? <p className="mb-2 text-sm font-medium text-red-800">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-xl bg-neutral-950 px-4 text-base font-semibold text-white disabled:opacity-60"
      >
        Check in
      </button>
    </form>
  );
}

function AddRemote({ orgId, venueId }: { orgId: string; venueId: string }) {
  const [state, action, pending] = useActionState(createRemoteAction, initial);
  return (
    <form action={action} className="space-y-3 rounded-2xl border border-dashed border-neutral-400 bg-white p-4">
      <input type="hidden" name="org" value={orgId} />
      <input type="hidden" name="venueId" value={venueId} />
      <h3 className="text-base font-bold">Add a remote</h3>
      <label className="block text-sm font-semibold">
        Label
        <input name="label" required maxLength={40} placeholder="Stevens #3" className={`${fieldClass} mt-1`} />
      </label>
      <label className="block text-sm font-semibold">
        Home field
        <input name="homeFieldName" maxLength={80} placeholder="Field 3" className={`${fieldClass} mt-1`} />
      </label>
      <label className="block text-sm font-semibold">
        Notes
        <textarea name="notes" maxLength={500} rows={2} className={`${fieldClass} mt-1 py-2`} />
      </label>
      {state.error ? <p className="text-sm font-medium text-red-800">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-xl border border-neutral-950 px-4 text-base font-semibold text-neutral-950 disabled:opacity-60"
      >
        Add remote
      </button>
    </form>
  );
}
