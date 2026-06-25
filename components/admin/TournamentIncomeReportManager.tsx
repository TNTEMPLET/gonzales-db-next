"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { BracketOrgId } from "@/lib/siteConfig";

type Category = "ENTRY_FEE" | "SPONSOR" | "MERCHANDISE" | "GATE" | "OTHER";
type Classification = "MATCHED" | "UNMATCHED" | "IGNORED" | "MANUAL";
type CategoryFilter = "all" | Category;
type ClassificationFilter = "all" | Classification;
type BulkCategory = "" | Category;
type BulkClassification = "" | Classification;

type IncomeTransaction = {
  id: string;
  organizationId: string;
  seasonYear: number;
  category: Category;
  paypalTxId: string;
  paypalTxDate: string;
  paypalStatus: string | null;
  payerName: string | null;
  payerEmail: string | null;
  itemName: string | null;
  paypalNote: string | null;
  paypalMemo: string | null;
  grossAmountCents: number;
  feeAmountCents: number;
  netAmountCents: number;
  classificationStatus: Classification;
  adminNotes: string | null;
};

type SummaryBucket = {
  count: number;
  grossAmountCents: number;
  feeAmountCents: number;
  netAmountCents: number;
};

type TournamentIncomeSummary = {
  totals: SummaryBucket;
  byClassification: Record<Classification, SummaryBucket>;
};

type SummaryResponse = {
  data?: {
    transactions: IncomeTransaction[];
    summary: TournamentIncomeSummary;
  };
  error?: string;
};

type SyncResponse = {
  data?: {
    dryRun: boolean;
    fetched: number;
    considered: number;
    created: number;
    updated: number;
    skipped: number;
    unmatched: number;
  };
  error?: string;
};

type Draft = {
  category: Category;
  classificationStatus: Classification;
  adminNotes: string;
};

type Props = {
  initialOrg: BracketOrgId;
};

const BRACKET_ORG_OPTIONS: Array<{ value: BracketOrgId; label: string }> = [
  { value: "ladistrict6", label: "District 6 DYB" },
  { value: "ladistrict2", label: "District 2 LL" },
  { value: "gonzales", label: "Gonzales DYB" },
  { value: "ascension", label: "Ascension LL" },
];

const CATEGORY_LABELS: Record<Category, string> = {
  ENTRY_FEE: "Entry fees",
  SPONSOR: "Sponsors",
  MERCHANDISE: "Merchandise",
  GATE: "Gate",
  OTHER: "Other / unmatched",
};

const CLASSIFICATION_LABELS: Record<Classification, string> = {
  MATCHED: "Auto-classified",
  UNMATCHED: "Needs review",
  IGNORED: "Ignored",
  MANUAL: "Manual override",
};

const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABELS) as Category[];
const CLASSIFICATION_OPTIONS = Object.keys(CLASSIFICATION_LABELS) as Classification[];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function seasonStartIsoDate() {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "Date unknown";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function buildQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  return query.toString();
}

function draftFromTransaction(row: IncomeTransaction): Draft {
  return {
    category: row.category,
    classificationStatus: row.classificationStatus,
    adminNotes: row.adminNotes ?? "",
  };
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

export default function TournamentIncomeReportManager({ initialOrg }: Props) {
  const currentYear = String(new Date().getFullYear());
  const [organizationId, setOrganizationId] = useState<BracketOrgId>(initialOrg);
  const [seasonYear, setSeasonYear] = useState(currentYear);
  const [startDate, setStartDate] = useState(seasonStartIsoDate());
  const [endDate, setEndDate] = useState(todayIsoDate());
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [classification, setClassification] = useState<ClassificationFilter>("all");
  const [dryRun, setDryRun] = useState(true);
  const [transactions, setTransactions] = useState<IncomeTransaction[]>([]);
  const [summary, setSummary] = useState<TournamentIncomeSummary | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState<BulkCategory>("");
  const [bulkClassification, setBulkClassification] = useState<BulkClassification>("");
  const [replaceBulkNotes, setReplaceBulkNotes] = useState(false);
  const [bulkAdminNotes, setBulkAdminNotes] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const queryString = useMemo(
    () =>
      buildQuery({
        org: organizationId,
        seasonYear: seasonYear.trim(),
        startDate,
        endDate,
        category: category === "all" ? undefined : category,
        classification: classification === "all" ? undefined : classification,
      }),
    [organizationId, seasonYear, startDate, endDate, category, classification],
  );

  const exportHref = `/api/admin/reports/tournament-income/export?${queryString}`;
  const unmatchedCount = summary?.byClassification.UNMATCHED.count ?? 0;
  const selectedCount = selectedIds.length;
  const selectedRows = useMemo(
    () => transactions.filter((transaction) => selectedIds.includes(transaction.id)),
    [transactions, selectedIds],
  );
  const allLoadedSelected = transactions.length > 0 && selectedCount === transactions.length;
  const bulkHasChanges = Boolean(bulkCategory || bulkClassification || replaceBulkNotes);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/reports/tournament-income/summary?${queryString}`);
      const json = (await response.json()) as SummaryResponse;
      if (!response.ok || !json.data) {
        throw new Error(json.error || "Failed to load tournament income");
      }
      setTransactions(json.data.transactions);
      setSummary(json.data.summary);
      setDrafts({});
      setSelectedIds([]);
      setNotice(`Loaded ${json.data.transactions.length} PayPal transactions.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load tournament income");
      setTransactions([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReport();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadReport]);


  function updateDraft(id: string, patch: Partial<Draft>) {
    const row = transactions.find((transaction) => transaction.id === id);
    if (!row) return;
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] ?? draftFromTransaction(row)), ...patch },
    }));
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((current) => {
      if (checked) return current.includes(id) ? current : [...current, id];
      return current.filter((selectedId) => selectedId !== id);
    });
  }

  function toggleAllLoaded(checked: boolean) {
    setSelectedIds(checked ? transactions.map((transaction) => transaction.id) : []);
  }

  function resetBulkControls() {
    setBulkCategory("");
    setBulkClassification("");
    setReplaceBulkNotes(false);
    setBulkAdminNotes("");
  }

  async function applyBulkChanges() {
    if (selectedRows.length === 0) {
      setError("Select at least one transaction before applying a bulk change.");
      return;
    }
    if (!bulkHasChanges) {
      setError("Choose a category, classification, or notes action before applying.");
      return;
    }

    const payload: Partial<Draft> = {};
    if (bulkCategory) payload.category = bulkCategory;
    if (bulkClassification) payload.classificationStatus = bulkClassification;
    if (replaceBulkNotes) payload.adminNotes = bulkAdminNotes;

    setBulkSaving(true);
    setError("");
    setNotice("");
    try {
      for (const row of selectedRows) {
        const response = await fetch(
          `/api/admin/reports/tournament-income/transactions/${row.id}?org=${organizationId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ org: organizationId, ...payload }),
          },
        );
        const json = (await response.json()) as { data?: IncomeTransaction; error?: string };
        if (!response.ok || !json.data) {
          throw new Error(json.error || `Failed to update ${row.payerName || row.paypalTxId}`);
        }
      }
      setDrafts((current) => {
        const next = { ...current };
        for (const row of selectedRows) delete next[row.id];
        return next;
      });
      setSelectedIds([]);
      resetBulkControls();
      setNotice(`Updated ${selectedRows.length} selected transaction${selectedRows.length === 1 ? "" : "s"}.`);
      void loadReport();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update selected transactions");
    } finally {
      setBulkSaving(false);
    }
  }

  async function saveTransaction(row: IncomeTransaction) {
    const draft = drafts[row.id] ?? draftFromTransaction(row);
    setSavingId(row.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/admin/reports/tournament-income/transactions/${row.id}?org=${organizationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            org: organizationId,
            category: draft.category,
            classificationStatus: draft.classificationStatus,
            adminNotes: draft.adminNotes,
          }),
        },
      );
      const json = (await response.json()) as { data?: IncomeTransaction; error?: string };
      if (!response.ok || !json.data) throw new Error(json.error || "Failed to save transaction");
      setTransactions((current) =>
        current.map((transaction) => (transaction.id === row.id ? json.data! : transaction)),
      );
      setDrafts((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      setNotice("Transaction saved.");
      void loadReport();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save transaction");
    } finally {
      setSavingId(null);
    }
  }

  async function syncPayPal() {
    setSyncing(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/reports/tournament-income/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org: organizationId,
          seasonYear: Number.parseInt(seasonYear, 10) || undefined,
          startDate,
          endDate,
          dryRun,
        }),
      });
      const json = (await response.json()) as SyncResponse;
      if (!response.ok || !json.data) throw new Error(json.error || "PayPal sync failed");
      const result = json.data;
      setNotice(
        `${result.dryRun ? "Dry run" : "Sync"} complete: ${result.considered} considered, ${result.created} created, ${result.updated} updated, ${result.unmatched} need review.`,
      );
      if (!result.dryRun) void loadReport();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "PayPal sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Income Controls</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              Use this after PayPal money starts coming in. Anything marked Needs Review should be checked by a baseball admin before you hand totals to the treasurer. Good PayPal item names like &quot;District 6 10U Entry Fee&quot; make the matching cleaner next time.
            </p>
          </div>
          <a
            href={exportHref}
            className="inline-flex items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
          >
            Export CSV
          </a>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <label className="block text-sm text-zinc-400">
            Organization
            <select
              value={organizationId}
              onChange={(event) => setOrganizationId(event.target.value as BracketOrgId)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
            >
              {BRACKET_ORG_OPTIONS.map((org) => (
                <option key={org.value} value={org.value}>{org.label}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-zinc-400">
            Season Year
            <input
              type="number"
              min="2020"
              value={seasonYear}
              onChange={(event) => setSeasonYear(event.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
            />
          </label>

          <label className="block text-sm text-zinc-400">
            Start Date
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
            />
          </label>

          <label className="block text-sm text-zinc-400">
            End Date
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
            />
          </label>

          <label className="block text-sm text-zinc-400">
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as CategoryFilter)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="all">All categories</option>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>{CATEGORY_LABELS[option]}</option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-zinc-400">
            Classification
            <select
              value={classification}
              onChange={(event) => setClassification(event.target.value as ClassificationFilter)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="all">All statuses</option>
              {CLASSIFICATION_OPTIONS.map((option) => (
                <option key={option} value={option}>{CLASSIFICATION_LABELS[option]}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex w-fit shrink-0 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(event) => setDryRun(event.target.checked)}
              className="h-4 w-4 rounded border-zinc-700 bg-zinc-900"
            />
            Dry-run PayPal sync
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadReport}
              disabled={loading || syncing}
              className="rounded-lg border border-transparent bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? "Loading..." : "Load Report"}
            </button>
            <button
              type="button"
              onClick={syncPayPal}
              disabled={loading || syncing}
              className="rounded-lg border border-amber-400/60 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
            >
              {syncing ? "Syncing..." : dryRun ? "Preview PayPal Sync" : "Sync PayPal"}
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-800 bg-red-900/20 px-4 py-2 text-sm text-red-300">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="mt-4 rounded-lg border border-emerald-800 bg-emerald-900/20 px-4 py-2 text-sm text-emerald-300">
            {notice}
          </div>
        ) : null}
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        <SummaryCard label="Gross" value={formatMoney(summary?.totals.grossAmountCents ?? 0)} tone="text-emerald-300" />
        <SummaryCard label="Fees" value={formatMoney(summary?.totals.feeAmountCents ?? 0)} tone="text-amber-200" />
        <SummaryCard label="Net" value={formatMoney(summary?.totals.netAmountCents ?? 0)} tone="text-white" />
        <SummaryCard label="Transactions" value={String(summary?.totals.count ?? 0)} tone="text-zinc-100" />
        <SummaryCard label="Unmatched" value={String(unmatchedCount)} tone={unmatchedCount ? "text-red-300" : "text-emerald-300"} />
      </section>

      <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
        <div className="border-b border-zinc-800 px-4 py-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">PayPal Transactions</h2>
            <p className="text-xs text-zinc-500">
              {selectedCount ? `${selectedCount} selected` : "Select rows to update several payments at once"}
            </p>
          </div>
        </div>

        <div className="border-b border-zinc-800 bg-zinc-950/30 px-4 py-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
            <label className="inline-flex w-fit items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={allLoadedSelected}
                onChange={(event) => toggleAllLoaded(event.target.checked)}
                disabled={transactions.length === 0 || loading || bulkSaving}
                className="h-4 w-4 rounded border-zinc-700 bg-zinc-900"
              />
              Select all loaded
            </label>

            <label className="min-w-44 flex-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 xl:max-w-52">
              Category
              <select
                value={bulkCategory}
                onChange={(event) => setBulkCategory(event.target.value as BulkCategory)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm normal-case text-zinc-100"
              >
                <option value="">Keep category</option>
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>{CATEGORY_LABELS[option]}</option>
                ))}
              </select>
            </label>

            <label className="min-w-44 flex-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 xl:max-w-52">
              Classification
              <select
                value={bulkClassification}
                onChange={(event) => setBulkClassification(event.target.value as BulkClassification)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm normal-case text-zinc-100"
              >
                <option value="">Keep classification</option>
                {CLASSIFICATION_OPTIONS.map((option) => (
                  <option key={option} value={option}>{CLASSIFICATION_LABELS[option]}</option>
                ))}
              </select>
            </label>

            <div className="flex-[1.5]">
              <label className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <input
                  type="checkbox"
                  checked={replaceBulkNotes}
                  onChange={(event) => setReplaceBulkNotes(event.target.checked)}
                  className="h-4 w-4 rounded border-zinc-700 bg-zinc-900"
                />
                Replace admin notes
              </label>
              <textarea
                value={bulkAdminNotes}
                onChange={(event) => setBulkAdminNotes(event.target.value)}
                rows={2}
                disabled={!replaceBulkNotes}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 disabled:opacity-50"
                placeholder="Notes to put on every selected transaction"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyBulkChanges}
                disabled={selectedCount === 0 || !bulkHasChanges || bulkSaving || loading}
                className="rounded-lg border border-emerald-500/60 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                {bulkSaving ? "Updating..." : "Apply to Selected"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedIds([]);
                  resetBulkControls();
                }}
                disabled={selectedCount === 0 && !bulkHasChanges}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full text-left text-sm">
            <thead className="bg-zinc-950/70 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-3">
                  <span className="sr-only">Select</span>
                </th>
                <th className="px-3 py-3">Date / Payer</th>
                <th className="px-3 py-3">PayPal Item</th>
                <th className="px-3 py-3 text-right">Gross</th>
                <th className="px-3 py-3 text-right">Fee</th>
                <th className="px-3 py-3 text-right">Net</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-3 py-3">Classification</th>
                <th className="px-3 py-3">Admin Notes</th>
                <th className="sticky right-0 bg-zinc-950/90 px-3 py-3 shadow-[-12px_0_18px_rgba(9,9,11,0.7)]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-zinc-400">
                    No transactions found for these filters.
                  </td>
                </tr>
              ) : (
                transactions.map((row) => {
                  const draft = drafts[row.id] ?? draftFromTransaction(row);
                  const selected = selectedIds.includes(row.id);
                  return (
                    <tr key={row.id} className={`align-top text-zinc-300 ${selected ? "bg-emerald-950/10" : ""}`}>
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => toggleSelected(row.id, event.target.checked)}
                          disabled={bulkSaving || loading}
                          aria-label={`Select transaction from ${row.payerName || row.payerEmail || row.paypalTxId}`}
                          className="h-4 w-4 rounded border-zinc-700 bg-zinc-900"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-zinc-100">{formatDate(row.paypalTxDate)}</div>
                        <div className="text-xs text-zinc-500">{row.payerName || "Unknown payer"}</div>
                        <div className="text-xs text-zinc-500">{row.payerEmail}</div>
                      </td>
                      <td className="max-w-[18rem] px-3 py-3">
                        <div className="font-medium text-zinc-100">{row.itemName || "No item name"}</div>
                        <div className="mt-1 text-xs text-zinc-500">Tx {row.paypalTxId}</div>
                        {row.paypalNote || row.paypalMemo ? (
                          <div className="mt-1 text-xs text-zinc-400">{row.paypalNote || row.paypalMemo}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-right text-emerald-300">{formatMoney(row.grossAmountCents)}</td>
                      <td className="px-3 py-3 text-right text-amber-200">{formatMoney(row.feeAmountCents)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-zinc-100">{formatMoney(row.netAmountCents)}</td>
                      <td className="px-3 py-3">
                        <select
                          value={draft.category}
                          onChange={(event) => updateDraft(row.id, { category: event.target.value as Category })}
                          disabled={bulkSaving}
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-2 text-xs text-zinc-100 disabled:opacity-50"
                        >
                          {CATEGORY_OPTIONS.map((option) => (
                            <option key={option} value={option}>{CATEGORY_LABELS[option]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          value={draft.classificationStatus}
                          onChange={(event) => updateDraft(row.id, { classificationStatus: event.target.value as Classification })}
                          disabled={bulkSaving}
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-2 text-xs text-zinc-100 disabled:opacity-50"
                        >
                          {CLASSIFICATION_OPTIONS.map((option) => (
                            <option key={option} value={option}>{CLASSIFICATION_LABELS[option]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <textarea
                          value={draft.adminNotes}
                          onChange={(event) => updateDraft(row.id, { adminNotes: event.target.value })}
                          rows={2}
                          disabled={bulkSaving}
                          className="w-44 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-2 text-xs text-zinc-100 disabled:opacity-50"
                          placeholder="Treasurer review notes"
                        />
                      </td>
                      <td className="sticky right-0 bg-zinc-900/95 px-3 py-3 shadow-[-12px_0_18px_rgba(9,9,11,0.7)]">
                        <button
                          type="button"
                          onClick={() => saveTransaction(row)}
                          disabled={savingId === row.id || bulkSaving}
                          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
                        >
                          {savingId === row.id ? "Saving..." : "Save"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
