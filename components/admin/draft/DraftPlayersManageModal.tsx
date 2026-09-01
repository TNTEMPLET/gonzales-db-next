"use client";

import { useEffect, useRef, useState } from "react";
import type { DraftPlayerPoolItem } from "@/lib/draft/types";
import { getErrorMessage } from "@/lib/draft/clientError";
import { parseCsvLine, splitCsvLines } from "@/lib/csv/parseCsv";
import { toCsvDocument } from "@/lib/export/csv";

type DraftPlayer = DraftPlayerPoolItem;

type ImportRow = {
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  guardianEmail: string | null;
  guardianPhone: string | null;
  birthDate: string | null;
  evaluationScore: string | null;
  pitcherRating: string | null;
  catcherRating: string | null;
  notes: string | null;
};

const IMPORT_TEMPLATE_HEADERS = [
  "First Name",
  "Last Name",
  "Guardian Email",
  "Guardian Phone",
  "Birth Date",
  "Evaluation Score",
  "Pitcher Rating",
  "Catcher Rating",
  "Notes",
];

/** Matches a CSV header cell against one of several accepted spellings, case/space/underscore-insensitive. */
function matchHeader(header: string, candidates: string[]): boolean {
  const normalized = header.trim().toLowerCase().replace(/[\s_]+/g, "");
  return candidates.some((c) => c.toLowerCase().replace(/[\s_]+/g, "") === normalized);
}

function parsePlayersCsv(text: string): { rows: ImportRow[]; blankNameCount: number } {
  const lines = splitCsvLines(text.replace(/^﻿/, ""));
  if (lines.length === 0) return { rows: [], blankNameCount: 0 };

  const header = parseCsvLine(lines[0]);
  const colIndex = (candidates: string[]) => header.findIndex((h) => matchHeader(h, candidates));

  const idx = {
    firstName: colIndex(["First Name", "firstName", "First"]),
    lastName: colIndex(["Last Name", "lastName", "Last"]),
    fullName: colIndex(["Full Name", "fullName", "Name"]),
    guardianEmail: colIndex(["Guardian Email", "guardianEmail", "Email"]),
    guardianPhone: colIndex(["Guardian Phone", "guardianPhone", "Phone"]),
    birthDate: colIndex(["Birth Date", "birthDate", "DOB"]),
    evaluationScore: colIndex(["Evaluation Score", "evaluationScore", "Score"]),
    pitcherRating: colIndex(["Pitcher Rating", "pitcherRating"]),
    catcherRating: colIndex(["Catcher Rating", "catcherRating"]),
    notes: colIndex(["Notes", "notes"]),
  };

  const cell = (cols: string[], i: number) => (i >= 0 ? (cols[i] || "").trim() || null : null);

  let blankNameCount = 0;
  const rows: ImportRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const firstName = cell(cols, idx.firstName);
    const lastName = cell(cols, idx.lastName);
    const explicitFullName = cell(cols, idx.fullName);
    const fullName = explicitFullName || `${firstName || ""} ${lastName || ""}`.trim();
    if (!fullName) {
      blankNameCount++;
      continue;
    }
    rows.push({
      firstName,
      lastName,
      fullName,
      guardianEmail: cell(cols, idx.guardianEmail),
      guardianPhone: cell(cols, idx.guardianPhone),
      birthDate: cell(cols, idx.birthDate),
      evaluationScore: cell(cols, idx.evaluationScore),
      pitcherRating: cell(cols, idx.pitcherRating),
      catcherRating: cell(cols, idx.catcherRating),
      notes: cell(cols, idx.notes),
    });
  }
  return { rows, blankNameCount };
}

type Props = {
  sessionId: string;
  onClose: () => void;
  onUpdated: () => void;
};

export default function DraftPlayersManageModal({
  sessionId,
  onClose,
  onUpdated,
}: Props) {
  const [players, setPlayers] = useState<DraftPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Add / Edit form state
  const [editingPlayer, setEditingPlayer] = useState<DraftPlayer | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [evaluationScore, setEvaluationScore] = useState("");
  const [pitcherRating, setPitcherRating] = useState("");
  const [catcherRating, setCatcherRating] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // CSV import state
  const [showImportForm, setShowImportForm] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importBlankNameCount, setImportBlankNameCount] = useState(0);
  const [importFileName, setImportFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const fetchPlayers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/draft/sessions/${sessionId}/players`);
      const data = await res.json();
      if (data.players) {
        setPlayers(data.players);
      }
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayers();
  }, [sessionId]);

  const resetForm = () => {
    setEditingPlayer(null);
    setShowAddForm(false);
    setFirstName("");
    setLastName("");
    setGuardianEmail("");
    setGuardianPhone("");
    setEvaluationScore("");
    setPitcherRating("");
    setCatcherRating("");
    setNotes("");
  };

  const startEdit = (player: DraftPlayer) => {
    setEditingPlayer(player);
    setShowAddForm(true);
    setFirstName(player.firstName || "");
    setLastName(player.lastName || "");
    setGuardianEmail(player.guardianEmail || "");
    setGuardianPhone(player.guardianPhone || "");
    setEvaluationScore(player.evaluationScore ? String(player.evaluationScore) : "");
    setPitcherRating(player.pitcherRating ? String(player.pitcherRating) : "");
    setCatcherRating(player.catcherRating ? String(player.catcherRating) : "");
    setNotes(player.notes || "");
  };

  const handleSavePlayer = async () => {
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!fullName) {
      setError("First or Last Name is required");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editingPlayer) {
        // Update
        const res = await fetch(`/api/admin/draft/sessions/${sessionId}/players`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerId: editingPlayer.id,
            firstName: firstName.trim() || null,
            lastName: lastName.trim() || null,
            fullName,
            guardianEmail: guardianEmail.trim() || null,
            guardianPhone: guardianPhone.trim() || null,
            evaluationScore: evaluationScore ? parseFloat(evaluationScore) : null,
            pitcherRating: pitcherRating ? parseInt(pitcherRating, 10) : null,
            catcherRating: catcherRating ? parseInt(catcherRating, 10) : null,
            notes: notes.trim() || null,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update player");
        }
      } else {
        // Create
        const res = await fetch(`/api/admin/draft/sessions/${sessionId}/players`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            firstName: firstName.trim() || null,
            lastName: lastName.trim() || null,
            fullName,
            guardianEmail: guardianEmail.trim() || null,
            guardianPhone: guardianPhone.trim() || null,
            evaluationScore: evaluationScore ? parseFloat(evaluationScore) : null,
            pitcherRating: pitcherRating ? parseInt(pitcherRating, 10) : null,
            catcherRating: catcherRating ? parseInt(catcherRating, 10) : null,
            notes: notes.trim() || null,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to add player");
        }
      }

      resetForm();
      fetchPlayers();
      onUpdated();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlayer = async (playerId: string) => {
    if (!confirm("Are you sure you want to remove this player from the draft pool?")) return;
    try {
      const res = await fetch(
        `/api/admin/draft/sessions/${sessionId}/players?playerId=${playerId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete player");
      }
      fetchPlayers();
      onUpdated();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const handleDownloadTemplate = () => {
    const csv = toCsvDocument(IMPORT_TEMPLATE_HEADERS, [
      ["Jordan", "Smith", "parent@example.com", "555-123-4567", "2016-04-12", "85.5", "3", "2", "Left-handed"],
    ]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "draft-player-pool-template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportFileSelected = async (file: File) => {
    setError(null);
    setNotice(null);
    const text = await file.text();
    const { rows, blankNameCount } = parsePlayersCsv(text);
    setImportRows(rows);
    setImportBlankNameCount(blankNameCount);
    setImportFileName(file.name);
  };

  const handleConfirmImport = async () => {
    if (importRows.length === 0) return;
    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/draft/sessions/${sessionId}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import", players: importRows }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to import players");
      }
      const data = await res.json();
      const skippedNote = data.skipped > 0 ? ` (${data.skipped} row${data.skipped === 1 ? "" : "s"} skipped -- no name)` : "";
      setNotice(`Imported ${data.count} player${data.count === 1 ? "" : "s"}${skippedNote}.`);
      setShowImportForm(false);
      setImportRows([]);
      setImportBlankNameCount(0);
      setImportFileName("");
      if (importFileInputRef.current) importFileInputRef.current.value = "";
      fetchPlayers();
      onUpdated();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setImporting(false);
    }
  };

  const filteredPlayers = players.filter(
    (p) =>
      p.fullName.toLowerCase().includes(search.toLowerCase()) ||
      (p.guardianEmail && p.guardianEmail.toLowerCase().includes(search.toLowerCase())) ||
      (p.notes && p.notes.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl space-y-5 max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <h3 className="text-lg font-bold text-white">🏃 Draft Player Pool Management</h3>
            <p className="text-xs text-zinc-400">
              Add walk-up players, adjust evaluation scores & ratings, and manage pool ({players.length} Total)
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs text-rose-400">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-300">
            {notice}
          </div>
        )}

        {/* Action Header / Search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <input
            type="text"
            placeholder="Search players by name, email, notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-72 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-1.5 text-xs text-white focus:border-emerald-500"
          />

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadTemplate}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white"
              title="Download a CSV template with the expected columns"
            >
              ⬇️ Download Template
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setShowImportForm(true);
              }}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white"
            >
              ⬆️ Import CSV
            </button>
            <button
              onClick={() => {
                setShowImportForm(false);
                resetForm();
                setShowAddForm(true);
              }}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 shadow"
            >
              + Add Walk-up / Late Player
            </button>
          </div>
        </div>

        {/* CSV Import Drawer */}
        {showImportForm && (
          <div className="rounded-xl border border-emerald-500/30 bg-zinc-950 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h4 className="text-sm font-bold text-emerald-400">⬆️ Import Players from CSV</h4>
              <button
                onClick={() => {
                  setShowImportForm(false);
                  setImportRows([]);
                  setImportBlankNameCount(0);
                  setImportFileName("");
                  if (importFileInputRef.current) importFileInputRef.current.value = "";
                }}
                className="text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
            </div>

            <input
              ref={importFileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportFileSelected(file);
              }}
              className="w-full text-xs text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-zinc-300 hover:file:bg-zinc-700"
            />

            {importFileName && (
              <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-xs text-zinc-300 space-y-1">
                <div>
                  <span className="font-semibold text-white">{importFileName}</span> --{" "}
                  {importRows.length} player{importRows.length === 1 ? "" : "s"} ready to import
                  {importBlankNameCount > 0 && (
                    <span className="text-amber-400">
                      {" "}
                      ({importBlankNameCount} row{importBlankNameCount === 1 ? "" : "s"} skipped -- no name)
                    </span>
                  )}
                </div>
                {importRows.length > 0 && (
                  <div className="max-h-32 overflow-y-auto text-[11px] text-zinc-400 space-y-0.5 pt-1">
                    {importRows.slice(0, 8).map((r, i) => (
                      <div key={i}>
                        {r.fullName}
                        {r.guardianEmail ? ` -- ${r.guardianEmail}` : ""}
                      </div>
                    ))}
                    {importRows.length > 8 && <div>...and {importRows.length - 8} more</div>}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800/60">
              <button
                onClick={handleConfirmImport}
                disabled={importing || importRows.length === 0}
                className="rounded bg-emerald-600 px-4 py-1 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {importing ? "Importing..." : `Import ${importRows.length} Player${importRows.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        )}

        {/* Add / Edit Player Drawer/Form */}
        {showAddForm && (
          <div className="rounded-xl border border-emerald-500/30 bg-zinc-950 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h4 className="text-sm font-bold text-emerald-400">
                {editingPlayer ? `✏️ Edit Player: ${editingPlayer.fullName}` : "➕ Add New Player to Draft Pool"}
              </h4>
              <button onClick={resetForm} className="text-xs text-zinc-400 hover:text-white">
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Evaluation Score</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 85.5"
                  value={evaluationScore}
                  onChange={(e) => setEvaluationScore(e.target.value)}
                  className="w-full rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Pitcher Rating (1-5)</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  placeholder="1-5"
                  value={pitcherRating}
                  onChange={(e) => setPitcherRating(e.target.value)}
                  className="w-full rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Catcher Rating (1-5)</label>
                <input
                  type="number"
                  min="1"
                  max="5"
                  placeholder="1-5"
                  value={catcherRating}
                  onChange={(e) => setCatcherRating(e.target.value)}
                  className="w-full rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Guardian Email</label>
                <input
                  type="email"
                  placeholder="parent@email.com"
                  value={guardianEmail}
                  onChange={(e) => setGuardianEmail(e.target.value)}
                  className="w-full rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Guardian Phone</label>
                <input
                  type="text"
                  placeholder="555-123-4567"
                  value={guardianPhone}
                  onChange={(e) => setGuardianPhone(e.target.value)}
                  className="w-full rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Notes / Skills</label>
                <input
                  type="text"
                  placeholder="e.g. Left-handed, Fast"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800/60">
              <button
                onClick={resetForm}
                className="rounded px-3 py-1 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePlayer}
                disabled={saving}
                className="rounded bg-emerald-600 px-4 py-1 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {saving ? "Saving..." : editingPlayer ? "Update Player" : "Add Player"}
              </button>
            </div>
          </div>
        )}

        {/* Players Table */}
        <div className="flex-1 overflow-y-auto border border-zinc-800 rounded-xl bg-zinc-950">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="sticky top-0 bg-zinc-900 border-b border-zinc-800 text-[11px] uppercase text-zinc-400">
              <tr>
                <th className="px-3 py-2.5">Player</th>
                <th className="px-3 py-2.5 text-center">Eval Score</th>
                <th className="px-3 py-2.5 text-center">P / C</th>
                <th className="px-3 py-2.5">Guardian Contact</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-zinc-500 animate-pulse">
                    Loading player pool...
                  </td>
                </tr>
              ) : filteredPlayers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-zinc-500">
                    No players found.
                  </td>
                </tr>
              ) : (
                filteredPlayers.map((player) => (
                  <tr key={player.id} className="hover:bg-zinc-900/50">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-white">{player.fullName}</div>
                      {player.notes && <div className="text-[10px] text-zinc-500">{player.notes}</div>}
                    </td>
                    <td className="px-3 py-2 text-center font-mono font-bold text-amber-400">
                      {player.evaluationScore !== null ? player.evaluationScore.toFixed(1) : "—"}
                    </td>
                    <td className="px-3 py-2 text-center text-[10px] text-zinc-400">
                      {player.pitcherRating ? `P:${player.pitcherRating}` : ""}
                      {player.catcherRating ? ` C:${player.catcherRating}` : ""}
                      {!player.pitcherRating && !player.catcherRating && "—"}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-zinc-400">
                      <div>{player.guardianEmail || "—"}</div>
                      {player.guardianPhone && <div className="text-[10px] text-zinc-500">{player.guardianPhone}</div>}
                    </td>
                    <td className="px-3 py-2">
                      {player.isDrafted ? (
                        <span className="inline-flex rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                          Drafted
                        </span>
                      ) : (
                        <span className="inline-flex rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300">
                          Available
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right space-x-1">
                      <button
                        onClick={() => startEdit(player)}
                        className="rounded bg-zinc-800 px-2 py-1 text-[10px] font-bold text-zinc-300 hover:bg-zinc-700 hover:text-white"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeletePlayer(player.id)}
                        disabled={player.isDrafted}
                        title={player.isDrafted ? "Cannot delete drafted player" : "Delete player"}
                        className="rounded bg-zinc-800 px-2 py-1 text-[10px] font-bold text-rose-400 hover:bg-rose-500/20 disabled:opacity-20"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
          <span className="text-xs text-zinc-500">
            {players.filter((p) => !p.isDrafted).length} Available / {players.length} Total Players
          </span>
          <button
            onClick={onClose}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
