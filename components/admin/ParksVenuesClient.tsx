"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import type { ParksScreenModel, ParksScreenPark, ParksScreenVenue } from "@/lib/venues/screen";
import { parseVenueWrite } from "@/lib/venues/validate";

type VenueForm = {
  name: string;
  shortName: string;
  address: string;
  notes: string;
  isActive: boolean;
};

const emptyForm: VenueForm = {
  name: "",
  shortName: "",
  address: "",
  notes: "",
  isActive: true,
};

export default function ParksVenuesClient({ initial }: { initial: ParksScreenModel }) {
  const router = useRouter();
  const [model, setModel] = useState(initial);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setModel(initial);
  }, [initial]);

  async function send(url: string, body: unknown, method = "POST"): Promise<boolean> {
    setError("");
    setNotice("");
    setPending(true);
    try {
      const response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await response.json().catch(() => null)) as
        | { screen?: ParksScreenModel; error?: string }
        | null;
      if (!response.ok || !json?.screen) {
        setError(json?.error || "Could not save that change.");
        return false;
      }
      setModel(json.screen);
      setNotice("Saved.");
      router.refresh();
      return true;
    } catch {
      setError("Could not save that change.");
      return false;
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-8">
      <CountStrip model={model} />
      {error ? (
        <p role="alert" className="rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">
          {notice}
        </p>
      ) : null}

      <CreateVenueForm
        disabled={pending}
        onCreate={(form) => send("/api/admin/venues", form)}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-100">Shared parks</h2>
        {model.venues.length === 0 ? (
          <p className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-6 text-sm text-zinc-400">
            No shared parks yet. Create one here, or run the staging pre-fill for exact name matches.
          </p>
        ) : (
          <div className="grid gap-3">
            {model.venues.map((venue) => (
              <VenueCard
                key={venue.id}
                venue={venue}
                disabled={pending}
                onSave={(form) => send(`/api/admin/venues/${venue.id}`, form, "PATCH")}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-100">League parks</h2>
        <p className="text-sm text-zinc-500">
          Every league is listed. The org switcher does not filter this page.
        </p>
        {model.parks.length === 0 ? (
          <p className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-6 text-sm text-zinc-400">
            No league parks yet. Add parks in the scheduler, then link them here.
          </p>
        ) : (
          <div className="grid gap-3">
            {model.parks.map((park) => (
              <ParkCard
                key={park.id}
                park={park}
                venues={model.venues}
                disabled={pending}
                onLink={(venueId) =>
                  send("/api/admin/venues/link", { scheduleParkId: park.id, venueId })
                }
                onConfirm={() => send("/api/admin/venues/confirm", { parkId: park.id })}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CountStrip({ model }: { model: ParksScreenModel }) {
  const items = [
    ["Shared parks", model.counts.venues],
    ["Linked", model.counts.linked],
    ["Suggested", model.counts.suggested],
    ["Unlinked", model.counts.unlinked],
  ] as const;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</dt>
          <dd className="mt-1 text-2xl font-semibold text-zinc-50">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CreateVenueForm({
  disabled,
  onCreate,
}: {
  disabled: boolean;
  onCreate: (form: VenueForm) => Promise<boolean>;
}) {
  const [form, setForm] = useState<VenueForm>(emptyForm);
  const [localError, setLocalError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseVenueWrite(form);
    if (!parsed.ok) {
      setLocalError(parsed.error);
      return;
    }
    setLocalError("");
    void onCreate(form).then((ok) => {
      if (ok) setForm(emptyForm);
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-6">
      <h2 className="text-lg font-semibold text-zinc-100">New shared park</h2>
      <p className="mt-1 text-sm text-zinc-500">Name, short name, and address. Notes stay on this record.</p>
      <VenueFields form={form} onChange={setForm} idPrefix="create" />
      {localError ? <p className="mt-3 text-sm text-red-200">{localError}</p> : null}
      <button
        type="submit"
        disabled={disabled}
        className="mt-4 w-full rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50 sm:w-auto"
      >
        Create shared park
      </button>
    </form>
  );
}

function VenueCard({
  venue,
  disabled,
  onSave,
}: {
  venue: ParksScreenVenue;
  disabled: boolean;
  onSave: (form: VenueForm) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<VenueForm>(() => formFromVenue(venue));
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    setForm(formFromVenue(venue));
  }, [venue]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseVenueWrite(form);
    if (!parsed.ok) {
      setLocalError(parsed.error);
      return;
    }
    setLocalError("");
    void onSave(form).then((ok) => {
      if (ok) setEditing(false);
    });
  }

  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5">
      {editing ? (
        <form onSubmit={submit}>
          <VenueFields form={form} onChange={setForm} idPrefix={`edit-${venue.id}`} />
          {localError ? <p className="mt-3 text-sm text-red-200">{localError}</p> : null}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              disabled={disabled}
              className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
            >
              Save shared park
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(formFromVenue(venue));
                setLocalError("");
                setEditing(false);
              }}
              className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-500"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-zinc-50">{venue.name}</h3>
              {venue.shortName ? (
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">{venue.shortName}</span>
              ) : null}
              <StatusPill active={venue.isActive} />
            </div>
            <p className="mt-1 text-sm text-zinc-400">{venue.address || "No address yet"}</p>
            {venue.notes ? <p className="mt-1 text-sm text-zinc-500">{venue.notes}</p> : null}
            <p className="mt-2 text-xs uppercase tracking-[0.12em] text-zinc-500">
              {venue.leagueParkCount} league {venue.leagueParkCount === 1 ? "park" : "parks"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-500"
          >
            Edit
          </button>
        </div>
      )}
    </article>
  );
}

function ParkCard({
  park,
  venues,
  disabled,
  onLink,
  onConfirm,
}: {
  park: ParksScreenPark;
  venues: ParksScreenVenue[];
  disabled: boolean;
  onLink: (venueId: string | null) => void;
  onConfirm: () => void;
}) {
  const [venueId, setVenueId] = useState(park.venueId ?? "");

  useEffect(() => {
    setVenueId(park.venueId ?? "");
  }, [park.venueId]);

  const unchanged = (venueId || null) === park.venueId;

  return (
    <article className={`rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5 ${park.isActive ? "" : "opacity-70"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-semibold text-zinc-200">
          {park.organizationLabel}
        </span>
        <LinkStatus status={park.status} />
        {park.isActive ? null : <span className="text-xs uppercase tracking-[0.12em] text-zinc-500">Inactive</span>}
      </div>
      <h3 className="mt-2 text-base font-semibold text-zinc-50">{park.name}</h3>
      <p className="mt-1 text-sm text-zinc-400">
        {[park.shortName, park.address].filter(Boolean).join(" · ") || "No short name or address"}
      </p>
      {park.venueName ? (
        <p className="mt-2 text-sm text-zinc-300">
          Linked to <span className="font-medium text-zinc-100">{park.venueName}</span>
        </p>
      ) : null}
      {park.sameNameLabels.length > 0 ? (
        <p className="mt-2 text-sm text-zinc-400">Same name in {park.sameNameLabels.join(", ")}.</p>
      ) : null}
      {park.suggestion ? (
        <div className="mt-3 rounded-xl border border-amber-900/50 bg-amber-950/20 px-3 py-3">
          <p className="text-sm text-amber-100">
            {park.suggestion.exact ? "Exact match" : "Suggested match"}: {park.suggestion.label}.
            {park.suggestion.exact || park.suggestion.venueId
              ? " Confirm to link this league park to that shared park."
              : " Confirm to create one shared park for both and link them."}
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={onConfirm}
            className="mt-3 w-full rounded-md bg-amber-700 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50 sm:w-auto"
          >
            Confirm suggestion
          </button>
        </div>
      ) : null}
      {park.status === "linked" && park.similarVenue ? (
        <p className="mt-3 text-sm text-amber-100/90">
          Similar shared park: {park.similarVenue.name}. Change the link if this is the same place.
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="block flex-1 text-sm text-zinc-400">
          Shared park
          <select
            value={venueId}
            onChange={(event) => setVenueId(event.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="">Not linked</option>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
                {venue.isActive ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={disabled || unchanged}
          onClick={() => onLink(venueId || null)}
          className="rounded-md border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-100 hover:border-zinc-500 disabled:opacity-50"
        >
          {venueId ? "Save link" : "Unlink"}
        </button>
      </div>
    </article>
  );
}

function VenueFields({
  form,
  onChange,
  idPrefix,
}: {
  form: VenueForm;
  onChange: (form: VenueForm) => void;
  idPrefix: string;
}) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <Field label="Name" id={`${idPrefix}-name`}>
        <input
          id={`${idPrefix}-name`}
          value={form.name}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          required
          maxLength={120}
          className={inputClass}
        />
      </Field>
      <Field label="Short name" id={`${idPrefix}-short`}>
        <input
          id={`${idPrefix}-short`}
          value={form.shortName}
          onChange={(event) => onChange({ ...form, shortName: event.target.value })}
          maxLength={40}
          className={inputClass}
        />
      </Field>
      <Field label="Address" id={`${idPrefix}-address`} className="sm:col-span-2">
        <input
          id={`${idPrefix}-address`}
          value={form.address}
          onChange={(event) => onChange({ ...form, address: event.target.value })}
          maxLength={240}
          className={inputClass}
        />
      </Field>
      <Field label="Notes" id={`${idPrefix}-notes`} className="sm:col-span-2">
        <textarea
          id={`${idPrefix}-notes`}
          value={form.notes}
          onChange={(event) => onChange({ ...form, notes: event.target.value })}
          maxLength={2000}
          rows={2}
          className={inputClass}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm text-zinc-300 sm:col-span-2">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(event) => onChange({ ...form, isActive: event.target.checked })}
        />
        Active
      </label>
    </div>
  );
}

function Field({
  label,
  id,
  className,
  children,
}: {
  label: string;
  id: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={id} className={`block text-sm text-zinc-400 ${className ?? ""}`}>
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function LinkStatus({ status }: { status: ParksScreenPark["status"] }) {
  const styles = {
    linked: "bg-emerald-950/60 text-emerald-100",
    suggested: "bg-amber-950/60 text-amber-100",
    unlinked: "bg-zinc-800 text-zinc-300",
  } as const;
  const labels = { linked: "Linked", suggested: "Suggested", unlinked: "Unlinked" } as const;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${active ? "bg-emerald-950/60 text-emerald-100" : "bg-zinc-800 text-zinc-400"}`}>
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function formFromVenue(venue: ParksScreenVenue): VenueForm {
  return {
    name: venue.name,
    shortName: venue.shortName ?? "",
    address: venue.address ?? "",
    notes: venue.notes ?? "",
    isActive: venue.isActive,
  };
}

const inputClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100";
