"use client";

import { useEffect, useState } from "react";

import type { ContentOrgId } from "@/lib/siteConfig";

type StatementRow = {
  id?: string | number;
  status?: string;
  total?: number | string;
  created_at?: string;
  _embedded?: {
    official?: {
      first_name?: string;
      last_name?: string;
    };
  };
};

export default function AdminAssignrPayManager({ targetOrg }: { targetOrg: ContentOrgId }) {
  const [statements, setStatements] = useState<StatementRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadStatements() {
      setBusy(true);
      setError("");
      try {
        const response = await fetch(`/api/admin/assignr/pay/statements?org=${targetOrg}`);
        const json = (await response.json()) as {
          error?: string;
          data?: StatementRow[];
        };
        if (!response.ok) {
          throw new Error(json.error || "Failed to load statements");
        }
        if (!cancelled) {
          setStatements(json.data ?? []);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setStatements([]);
          setError(err instanceof Error ? err.message : "Failed to load statements");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void loadStatements();
    return () => {
      cancelled = true;
    };
  }, [targetOrg]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        Read-only statement reconciliation from Assignr. Operational payout math remains in
        Reports until Assignr fee fields are validated for this site.
      </p>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <div className="overflow-hidden rounded-2xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-950 text-left text-zinc-400">
            <tr>
              <th className="px-4 py-2">Statement</th>
              <th className="px-4 py-2">Official</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {statements.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-zinc-500" colSpan={4}>
                  {busy ? "Loading…" : "No statements returned."}
                </td>
              </tr>
            ) : (
              statements.map((statement) => {
                const official = statement._embedded?.official;
                const officialName = official
                  ? `${official.first_name || ""} ${official.last_name || ""}`.trim()
                  : "—";
                return (
                  <tr key={String(statement.id)} className="border-t border-zinc-800">
                    <td className="px-4 py-3">{statement.id}</td>
                    <td className="px-4 py-3">{officialName}</td>
                    <td className="px-4 py-3">{statement.status || "—"}</td>
                    <td className="px-4 py-3">{statement.total ?? "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
