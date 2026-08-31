"use client";

import { useState } from "react";

type EquipmentCheckoutRow = {
  id: string;
  teamId: string;
  teamName: string;
  headCoachName: string | null;
  kitLabel: string;
  status: "open" | "picked_up";
  pickedUpAt: string | null;
};

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

/**
 * Per-division equipment checkout tracker -- who's picked up their team's
 * gear kit. Mirrors the Cap/Shirt Orders fulfillment toggle pattern
 * (open/picked_up + timestamp), but flat: one row per team, not a
 * parent/item structure, since a team gets exactly one kit.
 */
export default function EquipmentCheckoutPanel({
  orgQuery,
  seasonYear,
  ageGroupOptions,
}: {
  orgQuery: string;
  seasonYear: number;
  ageGroupOptions: string[];
}) {
  const [ageGroup, setAgeGroup] = useState("");
  const [rows, setRows] = useState<EquipmentCheckoutRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function loadRows(nextAgeGroup: string) {
    setAgeGroup(nextAgeGroup);
    setRows([]);
    setError("");
    if (!nextAgeGroup) return;
    setBusy(true);
    try {
      const params = new URLSearchParams(orgQuery);
      params.set("seasonYear", String(seasonYear));
      params.set("ageGroup", nextAgeGroup);
      const response = await fetch(`/api/admin/teams/equipment-checkout?${params.toString()}`, { cache: "no-store" });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to load equipment checkout"));
      setRows(json.checkouts || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load equipment checkout");
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerate() {
    if (!ageGroup) return;
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams(orgQuery);
      const organizationId = params.get("org") || "";
      const response = await fetch("/api/admin/teams/equipment-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", organizationId, seasonYear, ageGroup }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to generate"));
      await loadRows(ageGroup);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggle(row: EquipmentCheckoutRow) {
    setTogglingId(row.id);
    try {
      const nextStatus = row.status === "picked_up" ? "open" : "picked_up";
      const response = await fetch("/api/admin/teams/equipment-checkout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutId: row.id, status: nextStatus }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to update"));
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, status: json.status, pickedUpAt: json.pickedUpAt } : r)),
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleKitLabelBlur(row: EquipmentCheckoutRow, value: string) {
    if (value === row.kitLabel) return;
    try {
      const response = await fetch("/api/admin/teams/equipment-checkout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutId: row.id, kitLabel: value }),
      });
      const json = await safeJson(response);
      if (!response.ok) throw new Error(String(json.error || "Failed to update"));
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, kitLabel: json.kitLabel } : r)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update");
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Equipment Checkout</p>
        <p className="text-sm text-zinc-400">Track which head coach has picked up their team&apos;s equipment kit.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={ageGroup}
          onChange={(e) => loadRows(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
        >
          <option value="">Select division...</option>
          {ageGroupOptions.map((ag) => (
            <option key={ag} value={ag}>
              {ag}
            </option>
          ))}
        </select>
        {ageGroup && (
          <button
            onClick={handleGenerate}
            disabled={busy}
            className="rounded-lg bg-brand-purple px-3 py-2 text-xs font-semibold text-white hover:bg-brand-purple-dark disabled:opacity-50"
          >
            Generate for Division
          </button>
        )}
      </div>

      {error && <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>}

      {ageGroup && rows.length === 0 && !busy && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-6 text-center text-sm text-zinc-500">
          No equipment checkout rows yet -- click &quot;Generate for Division&quot; to create one per team.
        </div>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="border-b border-zinc-800 text-[11px] uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Head Coach</th>
                <th className="px-4 py-3">Kit</th>
                <th className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-zinc-900/60">
                  <td className="px-4 py-3 font-semibold text-white">{row.teamName}</td>
                  <td className="px-4 py-3 text-zinc-400">{row.headCoachName || "Unassigned"}</td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      defaultValue={row.kitLabel}
                      onBlur={(e) => handleKitLabelBlur(row, e.target.value)}
                      className="w-40 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleToggle(row)}
                      disabled={togglingId === row.id}
                      className={`rounded-lg px-3 py-1 text-[11px] font-bold disabled:opacity-50 ${
                        row.status === "picked_up"
                          ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                      }`}
                    >
                      {row.status === "picked_up" ? "✓ Picked Up" : "Mark Picked Up"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
