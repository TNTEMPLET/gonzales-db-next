"use client";

import { useEffect, useState } from "react";

import type { ContentOrgId } from "@/lib/siteConfig";

type OfficialRow = {
  id?: string | number;
  displayName?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  official?: boolean;
  assignor?: boolean;
  observer?: boolean;
  mobile_phone?: string;
};

export default function AdminAssignrOfficialsManager({
  targetOrg,
}: {
  targetOrg: ContentOrgId;
}) {
  const [search, setSearch] = useState("");
  const [officials, setOfficials] = useState<OfficialRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState<OfficialRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadOfficials(query = search) {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({ org: targetOrg });
      if (query.trim()) params.set("search", query.trim());
      const response = await fetch(`/api/admin/assignr/officials?${params}`);
      const json = (await response.json()) as {
        error?: string;
        data?: OfficialRow[];
      };
      if (!response.ok) {
        throw new Error(json.error || "Failed to load officials");
      }
      setOfficials(json.data ?? []);
    } catch (err: unknown) {
      setOfficials([]);
      setError(err instanceof Error ? err.message : "Failed to load officials");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadOfficials("");
  }, [targetOrg]);

  async function loadOfficial(id: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/assignr/officials/${id}?org=${targetOrg}`);
      const json = (await response.json()) as { error?: string; data?: OfficialRow };
      if (!response.ok) {
        throw new Error(json.error || "Failed to load official");
      }
      setDraft(json.data ?? null);
      setSelectedId(id);
    } catch (err: unknown) {
      setDraft(null);
      setError(err instanceof Error ? err.message : "Failed to load official");
    } finally {
      setBusy(false);
    }
  }

  async function saveOfficial() {
    if (!selectedId || !draft) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/admin/assignr/officials/${selectedId}?org=${targetOrg}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            first_name: draft.first_name,
            last_name: draft.last_name,
            mobile_phone: draft.mobile_phone,
            official: draft.official,
            assignor: draft.assignor,
            observer: draft.observer,
          }),
        },
      );
      const json = (await response.json()) as { error?: string; data?: OfficialRow };
      if (!response.ok) {
        throw new Error(json.error || "Failed to update official");
      }
      setDraft(json.data ?? draft);
      setNotice("Official profile updated in Assignr.");
      await loadOfficials();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update official");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-zinc-300">
          Search
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="mt-1 block w-64 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
            placeholder="Name or email"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadOfficials()}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          Search
        </button>
        <a
          href="https://app.assignr.com"
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Open Assignr for invites
        </a>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-300">{notice}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-950 text-left text-zinc-400">
              <tr>
                <th className="px-4 py-2">Official</th>
                <th className="px-4 py-2">Roles</th>
              </tr>
            </thead>
            <tbody>
              {officials.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-zinc-500" colSpan={2}>
                    {busy ? "Loading…" : "No officials found."}
                  </td>
                </tr>
              ) : (
                officials.map((official) => (
                  <tr key={String(official.id)} className="border-t border-zinc-800">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void loadOfficial(String(official.id))}
                        className="text-left text-zinc-100 hover:text-brand-gold"
                      >
                        {official.displayName ||
                          `${official.first_name || ""} ${official.last_name || ""}`.trim()}
                        <div className="text-xs text-zinc-500">{official.email || "—"}</div>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-400">
                      {official.official ? "Official " : ""}
                      {official.assignor ? "Assignor " : ""}
                      {official.observer ? "Observer" : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
          {!draft ? (
            <p className="text-sm text-zinc-500">Select an official to edit supported fields.</p>
          ) : (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-white">{draft.displayName}</h3>
              <label className="block text-sm text-zinc-300">
                First name
                <input
                  value={draft.first_name || ""}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, first_name: event.target.value } : current,
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
                />
              </label>
              <label className="block text-sm text-zinc-300">
                Last name
                <input
                  value={draft.last_name || ""}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, last_name: event.target.value } : current,
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
                />
              </label>
              <label className="block text-sm text-zinc-300">
                Mobile phone
                <input
                  value={draft.mobile_phone || ""}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, mobile_phone: event.target.value } : current,
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2"
                />
              </label>
              <div className="space-y-2 text-sm text-zinc-300">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.official)}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, official: event.target.checked } : current,
                      )
                    }
                  />
                  Official
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.assignor)}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, assignor: event.target.checked } : current,
                      )
                    }
                  />
                  Assignor
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.observer)}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, observer: event.target.checked } : current,
                      )
                    }
                  />
                  Observer
                </label>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveOfficial()}
                className="rounded-lg border border-brand-gold px-4 py-2 text-sm font-medium text-brand-gold hover:bg-brand-gold/10 disabled:opacity-50"
              >
                Save to Assignr
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
