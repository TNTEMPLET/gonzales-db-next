"use client";

import { useMemo, useRef, useState } from "react";

import {
  assignrScopeLabel,
  assignrScopeToQueryParam,
  isAllSitesAssignrScope,
  type AdminAssignrScope,
} from "@/lib/admin/assignrOrgScope";
import {
  CONTENT_ORGS,
  getOrgDisplayName,
  type ContentOrgId,
} from "@/lib/siteConfig";

type VenueCatalogEntry = {
  venue: string;
  subVenue: string;
};

type PreviewRow = {
  draft: {
    sourceTournament: string;
    sourcePark: string;
    sourceField: string;
    dateLabel: string;
    time: string;
    homeTeam: string;
    awayTeam: string;
    sourceGameNumber: string;
    sourceRow: number;
    sourceColumn: number;
    fieldKey: string;
  };
  preview: {
    date: string;
    time: string;
    venue: string;
    subVenue: string;
    ageGroup: string;
    homeTeam: string;
    awayTeam: string;
    notes: string;
  };
  warnings: string[];
  skipped: boolean;
};

type FieldOption = {
  sourcePark: string;
  sourceField: string;
  key: string;
};

type PreviewResponse = {
  scope: AdminAssignrScope;
  seasonYear: number;
  parsedCount: number;
  tournaments: string[];
  parks: string[];
  fields: FieldOption[];
  ageGroups: string[];
  ageGroupsByOrg: Record<ContentOrgId, string[]>;
  venues: string[];
  venueCatalog: VenueCatalogEntry[];
  suggestedMappings: {
    ageGroupMappings: Record<string, string>;
    contentOrgMappings: Record<string, string>;
    parkMappings: Record<string, string>;
    fieldMappings: Record<string, string>;
  };
  rows: PreviewRow[];
  error?: string;
};

async function safeJson(response: Response) {
  return response.json().catch(() => ({}));
}

export default function AdminGamesImportManager({
  scope,
}: {
  scope: AdminAssignrScope;
}) {
  const orgQuery = assignrScopeToQueryParam(scope);
  const allSites = isAllSitesAssignrScope(scope);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [seasonYear, setSeasonYear] = useState("2026");
  const [league, setLeague] = useState("");
  const [leagueByOrg, setLeagueByOrg] = useState<Record<ContentOrgId, string>>({
    gonzales: "",
    ascension: "",
  });
  const [gameType, setGameType] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [ageGroupMappings, setAgeGroupMappings] = useState<Record<string, string>>(
    {},
  );
  const [contentOrgMappings, setContentOrgMappings] = useState<
    Record<string, ContentOrgId>
  >({});
  const [parkMappings, setParkMappings] = useState<Record<string, string>>({});
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});
  const [tournamentFilter, setTournamentFilter] = useState("");
  const [showWarningsOnly, setShowWarningsOnly] = useState(false);

  const subVenueOptionsByVenue = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const entry of preview?.venueCatalog ?? []) {
      const current = map.get(entry.venue) ?? [];
      if (!current.includes(entry.subVenue)) {
        current.push(entry.subVenue);
      }
      map.set(entry.venue, current);
    }
    for (const [venue, values] of map.entries()) {
      map.set(
        venue,
        values.sort((a, b) => a.localeCompare(b)),
      );
    }
    return map;
  }, [preview?.venueCatalog]);

  const filteredRows = useMemo(() => {
    const rows = preview?.rows ?? [];
    return rows.filter((row) => {
      if (
        tournamentFilter &&
        row.draft.sourceTournament !== tournamentFilter
      ) {
        return false;
      }
      if (showWarningsOnly && row.warnings.length === 0) {
        return false;
      }
      return true;
    });
  }, [preview?.rows, showWarningsOnly, tournamentFilter]);

  const missingSites = useMemo(() => {
    if (!allSites) return [];
    return (preview?.tournaments ?? []).filter(
      (tournament) => !contentOrgMappings[tournament]?.trim(),
    );
  }, [allSites, contentOrgMappings, preview?.tournaments]);

  const missingAgeGroups = useMemo(() => {
    return (preview?.tournaments ?? []).filter(
      (tournament) => !ageGroupMappings[tournament]?.trim(),
    );
  }, [ageGroupMappings, preview?.tournaments]);

  const missingParks = useMemo(() => {
    return (preview?.parks ?? []).filter((park) => !parkMappings[park]?.trim());
  }, [parkMappings, preview?.parks]);

  const missingFields = useMemo(() => {
    return (preview?.fields ?? []).filter(
      (field) => !fieldMappings[field.key]?.trim(),
    );
  }, [fieldMappings, preview?.fields]);

  async function handlePreview(file: File) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("seasonYear", seasonYear);

      const response = await fetch(
        orgQuery
          ? `/api/admin/games/import/preview?${orgQuery}`
          : "/api/admin/games/import/preview",
        {
          method: "POST",
          body: formData,
        },
      );
      const json = (await safeJson(response)) as PreviewResponse;
      if (!response.ok) {
        throw new Error(String(json.error || "Failed to preview import"));
      }

      setPreview(json);
      setAgeGroupMappings(json.suggestedMappings.ageGroupMappings ?? {});
      setContentOrgMappings(
        (json.suggestedMappings.contentOrgMappings ?? {}) as Record<
          string,
          ContentOrgId
        >,
      );
      setParkMappings(json.suggestedMappings.parkMappings ?? {});
      setFieldMappings(json.suggestedMappings.fieldMappings ?? {});
      setNotice(`Parsed ${json.parsedCount} games.`);
    } catch (err: unknown) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Failed to preview import");
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    if (!uploadedFile) {
      setError("Upload a schedule file before exporting.");
      return;
    }
    if (
      missingAgeGroups.length > 0 ||
      missingSites.length > 0 ||
      missingParks.length > 0 ||
      missingFields.length > 0
    ) {
      setError("Complete site, age group, venue, and field mappings before exporting.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("file", uploadedFile);
      formData.append("seasonYear", seasonYear);
      formData.append("ageGroupMappings", JSON.stringify(ageGroupMappings));
      if (allSites) {
        formData.append("contentOrgMappings", JSON.stringify(contentOrgMappings));
        formData.append("leagueByOrg", JSON.stringify(leagueByOrg));
      }
      formData.append("parkMappings", JSON.stringify(parkMappings));
      formData.append("fieldMappings", JSON.stringify(fieldMappings));
      formData.append("league", league);
      formData.append("gameType", gameType);

      const response = await fetch(
        orgQuery
          ? `/api/admin/games/import/export?${orgQuery}`
          : "/api/admin/games/import/export",
        {
          method: "POST",
          body: formData,
        },
      );

      if (!response.ok) {
        const json = await safeJson(response);
        throw new Error(String(json.error || "Failed to export Assignr CSV"));
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "assignr-games-import.csv";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      const exportedCount = response.headers.get("X-Export-Count");
      const skippedCount = response.headers.get("X-Skipped-Count");
      setNotice(
        `Exported ${exportedCount ?? "0"} games${
          skippedCount ? ` (${skippedCount} skipped)` : ""
        }.`,
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to export Assignr CSV");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-900/40">
      <details className="group/details">
        <summary className="cursor-pointer list-none p-6 [&::-webkit-details-marker]:hidden">
          <ImportHeader scope={scope} />
        </summary>

        <div className="space-y-6 border-t border-zinc-800 px-6 pb-6 pt-6">
          <ImportUploadControls
            allSites={allSites}
            busy={busy}
            fileInputRef={fileInputRef}
            gameType={gameType}
            league={league}
            leagueByOrg={leagueByOrg}
            seasonYear={seasonYear}
            setGameType={setGameType}
            setLeague={setLeague}
            setLeagueByOrg={setLeagueByOrg}
            setSeasonYear={setSeasonYear}
            onFileSelected={(file) => {
              setUploadedFile(file);
              void handlePreview(file);
            }}
          />

          {error ? <ImportError message={error} /> : null}
          {notice ? <ImportNotice message={notice} /> : null}

          {preview ? (
            <>
              <ImportMappingSection
                ageGroupMappings={ageGroupMappings}
                ageGroups={preview.ageGroups}
                ageGroupsByOrg={preview.ageGroupsByOrg}
                allSites={allSites}
                contentOrgMappings={contentOrgMappings}
                fieldMappings={fieldMappings}
                fields={preview.fields}
                missingAgeGroups={missingAgeGroups}
                missingFields={missingFields}
                missingParks={missingParks}
                missingSites={missingSites}
                parkMappings={parkMappings}
                parks={preview.parks}
                setAgeGroupMappings={setAgeGroupMappings}
                setContentOrgMappings={setContentOrgMappings}
                setFieldMappings={setFieldMappings}
                setParkMappings={setParkMappings}
                subVenueOptionsByVenue={subVenueOptionsByVenue}
                tournaments={preview.tournaments}
                venues={preview.venues}
              />

              <ImportPreviewSection
                filteredRows={filteredRows}
                showWarningsOnly={showWarningsOnly}
                setShowWarningsOnly={setShowWarningsOnly}
                setTournamentFilter={setTournamentFilter}
                tournamentFilter={tournamentFilter}
                tournaments={preview.tournaments}
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleExport()}
                  className="rounded-lg border border-brand-gold px-4 py-2 text-sm font-medium text-brand-gold hover:bg-brand-gold/10 disabled:opacity-50"
                >
                  {busy ? "Working..." : "Download Assignr CSV"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </details>
    </section>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className ?? "h-4 w-4"}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ImportHeader({ scope }: { scope: AdminAssignrScope }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1 space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">
          Create Assignr Import CSV
        </h2>
        <p className="text-sm text-zinc-400 group-open/details:hidden">
          Turn a games schedule spreadsheet into an Assignr bulk-import file.
        </p>
        <p className="hidden max-w-3xl text-sm text-zinc-400 group-open/details:block">
          Upload a games schedule spreadsheet, map schedule sections to Assignr
          age groups, normalize parks and fields against the live schedule
          catalog, then download an Assignr bulk-import file.
        </p>
        <p className="hidden text-xs uppercase tracking-wide text-zinc-500 group-open/details:block">
          Assignr scope: {assignrScopeLabel(scope)}
        </p>
      </div>
      <ChevronDownIcon className="mt-1 h-4 w-4 shrink-0 text-zinc-400 transition-transform group-open/details:rotate-180" />
    </div>
  );
}

function ImportUploadControls({
  allSites,
  busy,
  fileInputRef,
  seasonYear,
  setSeasonYear,
  league,
  setLeague,
  leagueByOrg,
  setLeagueByOrg,
  gameType,
  setGameType,
  onFileSelected,
}: {
  allSites: boolean;
  busy: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  seasonYear: string;
  setSeasonYear: (value: string) => void;
  league: string;
  setLeague: (value: string) => void;
  leagueByOrg: Record<ContentOrgId, string>;
  setLeagueByOrg: React.Dispatch<
    React.SetStateAction<Record<ContentOrgId, string>>
  >;
  gameType: string;
  setGameType: (value: string) => void;
  onFileSelected: (file: File) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr_1fr_auto]">
      <label className="space-y-1">
        <span className="block text-xs uppercase tracking-wide text-zinc-400">
          Schedule file
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFileSelected(file);
          }}
          className="block w-full text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border file:border-zinc-700 file:bg-zinc-950 file:px-3 file:py-2 file:text-sm file:text-zinc-200"
        />
      </label>
      <label className="space-y-1">
        <span className="block text-xs uppercase tracking-wide text-zinc-400">
          Season year
        </span>
        <input
          value={seasonYear}
          disabled={busy}
          onChange={(event) => setSeasonYear(event.target.value)}
          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
        />
      </label>
      <label className="space-y-1">
        <span className="block text-xs uppercase tracking-wide text-zinc-400">
          Default league
        </span>
        <input
          value={league}
          disabled={busy || allSites}
          onChange={(event) => setLeague(event.target.value)}
          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm disabled:opacity-50"
        />
      </label>
      <label className="space-y-1">
        <span className="block text-xs uppercase tracking-wide text-zinc-400">
          Default game type
        </span>
        <input
          value={gameType}
          disabled={busy}
          onChange={(event) => setGameType(event.target.value)}
          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
        />
      </label>
      </div>
      {allSites ? (
        <div className="grid gap-4 md:grid-cols-2">
          {CONTENT_ORGS.map((org) => (
            <label key={org} className="space-y-1">
              <span className="block text-xs uppercase tracking-wide text-zinc-400">
                Default league ({getOrgDisplayName(org)})
              </span>
              <input
                value={leagueByOrg[org]}
                disabled={busy}
                onChange={(event) =>
                  setLeagueByOrg((current) => ({
                    ...current,
                    [org]: event.target.value,
                  }))
                }
                className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
              />
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ImportError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">
      {message}
    </div>
  );
}

function ImportNotice({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-emerald-700 bg-emerald-950/20 p-3 text-sm text-emerald-200">
      {message}
    </div>
  );
}

function ImportMappingSection(props: {
  tournaments: string[];
  ageGroups: string[];
  ageGroupsByOrg: Record<ContentOrgId, string[]>;
  allSites: boolean;
  contentOrgMappings: Record<string, ContentOrgId>;
  parks: string[];
  venues: string[];
  fields: FieldOption[];
  ageGroupMappings: Record<string, string>;
  parkMappings: Record<string, string>;
  fieldMappings: Record<string, string>;
  setAgeGroupMappings: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  setContentOrgMappings: React.Dispatch<
    React.SetStateAction<Record<string, ContentOrgId>>
  >;
  setParkMappings: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setFieldMappings: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  subVenueOptionsByVenue: Map<string, string[]>;
  missingAgeGroups: string[];
  missingSites: string[];
  missingParks: string[];
  missingFields: FieldOption[];
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <div className="border-b border-zinc-800 bg-zinc-900/80 px-4 py-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
            Section to age group mapping
          </h3>
          {props.missingSites.length > 0 ? (
            <p className="mt-1 text-xs text-amber-300">
              {props.missingSites.length} schedule section
              {props.missingSites.length === 1 ? "" : "s"} still need a site.
            </p>
          ) : null}
          {props.missingAgeGroups.length > 0 ? (
            <p className="mt-1 text-xs text-amber-300">
              {props.missingAgeGroups.length} schedule section
              {props.missingAgeGroups.length === 1 ? "" : "s"} still need an age
              group.
            </p>
          ) : null}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-zinc-950">
            <tr className="text-left text-zinc-400">
              <th className="px-4 py-2">Imported section</th>
              {props.allSites ? <th className="px-4 py-2">Site</th> : null}
              <th className="px-4 py-2">Assignr age group</th>
            </tr>
          </thead>
          <tbody>
            {props.tournaments.map((tournament) => (
              <tr key={tournament} className="border-t border-zinc-800">
                <td className="px-4 py-2">{tournament}</td>
                {props.allSites ? (
                  <td className="px-4 py-2">
                    <select
                      value={props.contentOrgMappings[tournament] || ""}
                      onChange={(event) =>
                        props.setContentOrgMappings((current) => ({
                          ...current,
                          [tournament]: event.target.value as ContentOrgId,
                        }))
                      }
                      className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                    >
                      <option value="">Select site…</option>
                      {CONTENT_ORGS.map((org) => (
                        <option key={org} value={org}>
                          {getOrgDisplayName(org)}
                        </option>
                      ))}
                    </select>
                  </td>
                ) : null}
                <td className="px-4 py-2">
                  <select
                    value={props.ageGroupMappings[tournament] || ""}
                    onChange={(event) =>
                      props.setAgeGroupMappings((current) => ({
                        ...current,
                        [tournament]: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                  >
                    <option value="">Select age group…</option>
                    {props.allSites
                      ? CONTENT_ORGS.map((org) => (
                          <optgroup key={org} label={getOrgDisplayName(org)}>
                            {(props.ageGroupsByOrg[org] ?? []).map((option) => (
                              <option key={`${org}-${option}`} value={option}>
                                {option}
                              </option>
                            ))}
                          </optgroup>
                        ))
                      : props.ageGroups.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <div className="border-b border-zinc-800 bg-zinc-900/80 px-4 py-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
              Park to venue mapping
            </h3>
            {props.missingParks.length > 0 ? (
              <p className="mt-1 text-xs text-amber-300">
                {props.missingParks.length} park label
                {props.missingParks.length === 1 ? "" : "s"} still need a venue.
              </p>
            ) : null}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-zinc-950">
              <tr className="text-left text-zinc-400">
                <th className="px-4 py-2">Imported park</th>
                <th className="px-4 py-2">Assignr venue</th>
              </tr>
            </thead>
            <tbody>
              {props.parks.map((park) => (
                <tr key={park} className="border-t border-zinc-800">
                  <td className="px-4 py-2">{park}</td>
                  <td className="px-4 py-2">
                    <select
                      value={props.parkMappings[park] || ""}
                      onChange={(event) =>
                        props.setParkMappings((current) => ({
                          ...current,
                          [park]: event.target.value,
                        }))
                      }
                      className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                    >
                      <option value="">Select venue…</option>
                      {props.venues.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <FieldMappingTable {...props} />
      </div>
    </div>
  );
}

function FieldLabel({ field }: { field: FieldOption }) {
  return (
    <>
      <div>{field.sourceField}</div>
      <div className="text-xs text-zinc-500">{field.sourcePark}</div>
    </>
  );
}

function FieldMappingTable(props: {
  fields: FieldOption[];
  fieldMappings: Record<string, string>;
  setFieldMappings: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >;
  parkMappings: Record<string, string>;
  subVenueOptionsByVenue: Map<string, string[]>;
  missingFields: FieldOption[];
}) {
  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      <div className="border-b border-zinc-800 bg-zinc-900/80 px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
          Field to sub-venue mapping
        </h3>
        {props.missingFields.length > 0 ? (
          <p className="mt-1 text-xs text-amber-300">
            {props.missingFields.length} field label
            {props.missingFields.length === 1 ? "" : "s"} still need a sub-venue.
          </p>
        ) : null}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-zinc-950">
          <tr className="text-left text-zinc-400">
            <th className="px-4 py-2">Imported field</th>
            <th className="px-4 py-2">Assignr sub-venue</th>
          </tr>
        </thead>
        <tbody>
          {props.fields.map((field) => {
            const mappedVenue = props.parkMappings[field.sourcePark] || "";
            const scopedOptions = mappedVenue
              ? props.subVenueOptionsByVenue.get(mappedVenue) ?? []
              : Array.from(props.subVenueOptionsByVenue.values()).flat();

            return (
              <tr key={field.key} className="border-t border-zinc-800">
                <td className="px-4 py-2">
                  <FieldLabel field={field} />
                </td>
                <td className="px-4 py-2">
                  <select
                    value={props.fieldMappings[field.key] || ""}
                    onChange={(event) =>
                      props.setFieldMappings((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
                  >
                    <option value="">Select sub-venue…</option>
                    {scopedOptions.map((option) => (
                      <option key={`${field.key}-${option}`} value={option}>
                        {option || "(blank)"}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ImportPreviewSection({
  tournaments,
  tournamentFilter,
  setTournamentFilter,
  showWarningsOnly,
  setShowWarningsOnly,
  filteredRows,
}: {
  tournaments: string[];
  tournamentFilter: string;
  setTournamentFilter: (value: string) => void;
  showWarningsOnly: boolean;
  setShowWarningsOnly: (value: boolean) => void;
  filteredRows: PreviewRow[];
}) {
  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      <ImportPreviewSectionHeader
        setShowWarningsOnly={setShowWarningsOnly}
        setTournamentFilter={setTournamentFilter}
        showWarningsOnly={showWarningsOnly}
        tournamentFilter={tournamentFilter}
        tournaments={tournaments}
      />
      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-zinc-950">
            <tr className="text-left text-zinc-400">
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Time</th>
              <th className="px-4 py-2">Venue</th>
              <th className="px-4 py-2">Field</th>
              <th className="px-4 py-2">Age group</th>
              <th className="px-4 py-2">Matchup</th>
              <th className="px-4 py-2">Warnings</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-zinc-500" colSpan={7}>
                  No preview rows match the current filters.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr
                  key={`${row.draft.sourceRow}-${row.draft.sourceColumn}-${row.draft.sourceGameNumber}`}
                  className="border-t border-zinc-800 align-top"
                >
                  <td className="px-4 py-2">{row.preview.date}</td>
                  <td className="px-4 py-2">{row.preview.time}</td>
                  <td className="px-4 py-2">{row.preview.venue || "—"}</td>
                  <td className="px-4 py-2">{row.preview.subVenue || "—"}</td>
                  <td className="px-4 py-2">{row.preview.ageGroup || "—"}</td>
                  <td className="px-4 py-2">
                    {row.preview.homeTeam} vs {row.preview.awayTeam}
                  </td>
                  <td className="px-4 py-2 text-amber-300">
                    {row.warnings.join(", ") || "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImportPreviewSectionHeader({
  tournaments,
  tournamentFilter,
  setTournamentFilter,
  showWarningsOnly,
  setShowWarningsOnly,
}: {
  tournaments: string[];
  tournamentFilter: string;
  setTournamentFilter: (value: string) => void;
  showWarningsOnly: boolean;
  setShowWarningsOnly: (value: boolean) => void;
}) {
  return (
    <div className="border-b border-zinc-800 bg-zinc-900/80 px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
        Preview
      </h3>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={tournamentFilter}
          onChange={(event) => setTournamentFilter(event.target.value)}
          className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
        >
          <option value="">All sections</option>
          {tournaments.map((tournament) => (
            <option key={tournament} value={tournament}>
              {tournament}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={showWarningsOnly}
            onChange={(event) => setShowWarningsOnly(event.target.checked)}
          />
          Show warnings only
        </label>
      </div>
    </div>
  );
}
