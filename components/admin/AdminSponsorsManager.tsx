"use client";

import { useEffect, useMemo, useState } from "react";

import { SPONSOR_PACKAGE_TYPES, type SponsorPackageTypeValue } from "@/lib/sponsors/catalog";
import { type ContentOrgId } from "@/lib/siteConfig";
import { SPONSOR_PACKAGE_TEMPLATES } from "@/lib/sponsors/templates";

type SponsorPlacement = {
  id: string;
  organizationId: ContentOrgId;
  showInFooterScroller: boolean;
  sortOrder: number;
};

type SponsorRecord = {
  id: string;
  businessName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  websiteUrl: string | null;
  logoUrl: string | null;
  logoMimeType: string | null;
  logoAlt: string | null;
  notes: string | null;
  isActive: boolean;
  startAt: string | null;
  endAt: string | null;
  packageEnrollment: {
    packageType: SponsorPackageTypeValue;
    packageLabel: string;
    minimumCommitmentCents: number | null;
    amountCents: number | null;
    additionalTeamAmountCents: number | null;
    twoYearCommitmentAmountCents: number | null;
    includesWebsiteLogo: boolean;
    includesSocialRecognition: boolean;
    includesUniformName: boolean;
    includesFieldSignage: boolean;
    includesSeasonScheduleName: boolean;
    includesAllStarMention: boolean;
    notes: string | null;
  } | null;
  placements: SponsorPlacement[];
};

type ApiListResponse = {
  data: SponsorRecord[];
  targetOrg: ContentOrgId;
};

type SponsorFormState = {
  businessName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  websiteUrl: string;
  logoUrl: string;
  logoMimeType: string;
  logoAlt: string;
  notes: string;
  isActive: boolean;
  startAt: string;
  endAt: string;
  packageType: SponsorPackageTypeValue;
  packageLabel: string;
  minimumCommitmentCents: string;
  amountCents: string;
  additionalTeamAmountCents: string;
  twoYearCommitmentAmountCents: string;
  includesWebsiteLogo: boolean;
  includesSocialRecognition: boolean;
  includesUniformName: boolean;
  includesFieldSignage: boolean;
  includesSeasonScheduleName: boolean;
  includesAllStarMention: boolean;
  packageNotes: string;
  orgTargets: ContentOrgId[];
  showInFooterScroller: boolean;
  sortOrder: string;
};

const EMPTY_FORM: SponsorFormState = {
  businessName: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  websiteUrl: "",
  logoUrl: "",
  logoMimeType: "",
  logoAlt: "",
  notes: "",
  isActive: true,
  startAt: "",
  endAt: "",
  packageType: "BALLPARK_FENCE_SIGNS",
  packageLabel: "Ballpark Fence Signs",
  minimumCommitmentCents: "50000",
  amountCents: "50000",
  additionalTeamAmountCents: "",
  twoYearCommitmentAmountCents: "",
  includesWebsiteLogo: true,
  includesSocialRecognition: true,
  includesUniformName: false,
  includesFieldSignage: true,
  includesSeasonScheduleName: false,
  includesAllStarMention: false,
  packageNotes: "",
  orgTargets: ["gonzales"],
  showInFooterScroller: true,
  sortOrder: "100",
};

function centsDisplay(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `$${(value / 100).toLocaleString()}`;
}

function mapSponsorToForm(sponsor: SponsorRecord): SponsorFormState {
  const enrollment = sponsor.packageEnrollment;
  return {
    businessName: sponsor.businessName,
    contactName: sponsor.contactName || "",
    contactEmail: sponsor.contactEmail || "",
    contactPhone: sponsor.contactPhone || "",
    websiteUrl: sponsor.websiteUrl || "",
    logoUrl: sponsor.logoUrl || "",
    logoMimeType: sponsor.logoMimeType || "",
    logoAlt: sponsor.logoAlt || "",
    notes: sponsor.notes || "",
    isActive: sponsor.isActive,
    startAt: sponsor.startAt ? sponsor.startAt.slice(0, 10) : "",
    endAt: sponsor.endAt ? sponsor.endAt.slice(0, 10) : "",
    packageType: enrollment?.packageType || "CUSTOM",
    packageLabel: enrollment?.packageLabel || "Custom",
    minimumCommitmentCents:
      enrollment?.minimumCommitmentCents?.toString() || "",
    amountCents: enrollment?.amountCents?.toString() || "",
    additionalTeamAmountCents:
      enrollment?.additionalTeamAmountCents?.toString() || "",
    twoYearCommitmentAmountCents:
      enrollment?.twoYearCommitmentAmountCents?.toString() || "",
    includesWebsiteLogo: enrollment?.includesWebsiteLogo ?? true,
    includesSocialRecognition: enrollment?.includesSocialRecognition ?? false,
    includesUniformName: enrollment?.includesUniformName ?? false,
    includesFieldSignage: enrollment?.includesFieldSignage ?? false,
    includesSeasonScheduleName: enrollment?.includesSeasonScheduleName ?? false,
    includesAllStarMention: enrollment?.includesAllStarMention ?? false,
    packageNotes: enrollment?.notes || "",
    orgTargets: sponsor.placements.map((entry) => entry.organizationId),
    showInFooterScroller: sponsor.placements.some(
      (entry) => entry.showInFooterScroller,
    ),
    sortOrder: sponsor.placements[0]?.sortOrder?.toString() || "100",
  };
}

export default function AdminSponsorsManager({
  targetOrg,
}: {
  targetOrg: ContentOrgId;
}) {
  const [sponsors, setSponsors] = useState<SponsorRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState<SponsorFormState>({
    ...EMPTY_FORM,
    orgTargets: [targetOrg],
  });
  const [editingSponsorId, setEditingSponsorId] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const orgQuery = `org=${targetOrg}`;

  const activeTemplate = useMemo(
    () =>
      SPONSOR_PACKAGE_TEMPLATES.find((entry) => entry.packageType === form.packageType),
    [form.packageType],
  );

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      orgTargets:
        prev.orgTargets.length > 0 ? prev.orgTargets : [targetOrg],
    }));
    void loadSponsors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetOrg]);

  async function loadSponsors() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/sponsors?${orgQuery}`, {
        cache: "no-store",
      });
      const json = (await response.json()) as ApiListResponse | { error?: string };
      if (!response.ok) {
        throw new Error(json && "error" in json ? json.error : "Failed to load");
      }
      setSponsors((json as ApiListResponse).data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load sponsors");
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setEditingSponsorId(null);
    setForm({ ...EMPTY_FORM, orgTargets: [targetOrg] });
  }

  function applyTemplate(packageType: SponsorPackageTypeValue) {
    const template = SPONSOR_PACKAGE_TEMPLATES.find(
      (entry) => entry.packageType === packageType,
    );
    setForm((prev) => ({
      ...prev,
      packageType,
      packageLabel: template?.label || "Custom",
      minimumCommitmentCents: template?.minimumCommitmentCents
        ? String(template.minimumCommitmentCents)
        : "",
      amountCents: template?.defaultAmountCents
        ? String(template.defaultAmountCents)
        : "",
      additionalTeamAmountCents: template?.additionalTeamAmountCents
        ? String(template.additionalTeamAmountCents)
        : "",
      twoYearCommitmentAmountCents: template?.twoYearCommitmentAmountCents
        ? String(template.twoYearCommitmentAmountCents)
        : "",
      includesWebsiteLogo: template?.includesWebsiteLogo ?? true,
      includesSocialRecognition: template?.includesSocialRecognition ?? false,
      includesUniformName: template?.includesUniformName ?? false,
      includesFieldSignage: template?.includesFieldSignage ?? false,
      includesSeasonScheduleName: template?.includesSeasonScheduleName ?? false,
      includesAllStarMention: template?.includesAllStarMention ?? false,
      showInFooterScroller: template?.includesWebsiteLogo ?? true,
    }));
  }

  function toggleTargetOrg(org: ContentOrgId) {
    setForm((prev) => {
      const hasOrg = prev.orgTargets.includes(org);
      if (hasOrg) {
        const nextTargets = prev.orgTargets.filter((entry) => entry !== org);
        return {
          ...prev,
          orgTargets: nextTargets.length > 0 ? nextTargets : [org],
        };
      }
      return {
        ...prev,
        orgTargets: [...prev.orgTargets, org],
      };
    });
  }

  async function uploadLogo(file: File) {
    setUploadingLogo(true);
    setError("");
    try {
      const payload = new FormData();
      payload.append("logo", file);
      const response = await fetch(`/api/admin/sponsors/upload?${orgQuery}`, {
        method: "POST",
        body: payload,
      });
      const json = (await response.json()) as {
        error?: string;
        data?: { logoUrl: string; logoMimeType: string };
      };
      if (!response.ok || !json.data) {
        throw new Error(json.error || "Failed to upload logo");
      }
      setForm((prev) => ({
        ...prev,
        logoUrl: json.data?.logoUrl || "",
        logoMimeType: json.data?.logoMimeType || "",
      }));
      setNotice("Logo uploaded.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload logo");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function saveSponsor() {
    if (!form.businessName.trim()) {
      setError("Business name is required.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        ...form,
        orgTargets: form.orgTargets,
        minimumCommitmentCents: form.minimumCommitmentCents
          ? Number(form.minimumCommitmentCents)
          : null,
        amountCents: form.amountCents ? Number(form.amountCents) : null,
        additionalTeamAmountCents: form.additionalTeamAmountCents
          ? Number(form.additionalTeamAmountCents)
          : null,
        twoYearCommitmentAmountCents: form.twoYearCommitmentAmountCents
          ? Number(form.twoYearCommitmentAmountCents)
          : null,
        sortOrder: form.sortOrder ? Number(form.sortOrder) : 100,
      };

      const response = await fetch(
        editingSponsorId
          ? `/api/admin/sponsors/${editingSponsorId}?${orgQuery}`
          : `/api/admin/sponsors?${orgQuery}`,
        {
          method: editingSponsorId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error || "Failed to save sponsor");
      }
      setNotice(editingSponsorId ? "Sponsor updated." : "Sponsor created.");
      resetForm();
      await loadSponsors();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save sponsor");
    } finally {
      setBusy(false);
    }
  }

  async function removeSponsor(id: string) {
    if (!confirm("Delete this sponsor?")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/sponsors/${id}?${orgQuery}`, {
        method: "DELETE",
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error || "Failed to delete sponsor");
      }
      setNotice("Sponsor deleted.");
      await loadSponsors();
      if (editingSponsorId === id) resetForm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete sponsor");
    } finally {
      setBusy(false);
    }
  }

  async function saveScrollerSettings(sponsor: SponsorRecord) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/admin/sponsors/${sponsor.id}/scroller?${orgQuery}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orgTargets: sponsor.placements.map((entry) => entry.organizationId),
            showInFooterScroller: sponsor.placements.some(
              (entry) => entry.showInFooterScroller,
            ),
            sortOrder: sponsor.placements[0]?.sortOrder || 100,
          }),
        },
      );
      const json = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(json.error || "Failed to save scroller settings");
      }
      setNotice(`Scroller settings updated for ${sponsor.businessName}.`);
      await loadSponsors();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to save scroller settings",
      );
    } finally {
      setBusy(false);
    }
  }

  const sortedScrollerSponsors = useMemo(
    () =>
      [...sponsors]
        .filter((entry) =>
          entry.placements.some(
            (placement) =>
              placement.organizationId === targetOrg &&
              placement.showInFooterScroller,
          ),
        )
        .sort((a, b) => {
          const aSort =
            a.placements.find((entry) => entry.organizationId === targetOrg)
              ?.sortOrder ?? 100;
          const bSort =
            b.placements.find((entry) => entry.organizationId === targetOrg)
              ?.sortOrder ?? 100;
          return aSort - bSort;
        }),
    [sponsors, targetOrg],
  );

  return (
    <section className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-300">
          {notice}
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {editingSponsorId ? "Edit Sponsor" : "Add Sponsor"}
          </h2>
          {editingSponsorId ? (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs"
            >
              Cancel Edit
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={form.businessName}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, businessName: event.target.value }))
            }
            placeholder="Business name"
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <input
            value={form.contactName}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, contactName: event.target.value }))
            }
            placeholder="Contact name"
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <input
            value={form.contactEmail}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, contactEmail: event.target.value }))
            }
            placeholder="Contact email"
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <input
            value={form.contactPhone}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, contactPhone: event.target.value }))
            }
            placeholder="Contact phone"
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <input
            value={form.websiteUrl}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, websiteUrl: event.target.value }))
            }
            placeholder="Website URL"
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <input
            value={form.logoAlt}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, logoAlt: event.target.value }))
            }
            placeholder="Logo alt text"
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-zinc-400">Logo Upload</label>
          <input
            type="file"
            accept="image/svg+xml,image/png,image/webp,image/jpeg,image/gif"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadLogo(file);
            }}
            className="text-xs"
          />
          {uploadingLogo ? (
            <span className="text-xs text-zinc-400">Uploading...</span>
          ) : null}
          {form.logoUrl ? (
            <a
              href={form.logoUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-brand-gold hover:underline"
            >
              View uploaded logo
            </a>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <select
            value={form.packageType}
            onChange={(event) =>
              applyTemplate(event.target.value as SponsorPackageTypeValue)
            }
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          >
            {SPONSOR_PACKAGE_TYPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <input
            value={form.packageLabel}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, packageLabel: event.target.value }))
            }
            placeholder="Package label"
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <input
            value={form.sortOrder}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, sortOrder: event.target.value }))
            }
            placeholder="Scroller order"
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <input
            value={form.minimumCommitmentCents}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                minimumCommitmentCents: event.target.value,
              }))
            }
            placeholder="Minimum commitment (cents)"
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <input
            value={form.amountCents}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, amountCents: event.target.value }))
            }
            placeholder="Package amount (cents)"
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <input
            value={form.additionalTeamAmountCents}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                additionalTeamAmountCents: event.target.value,
              }))
            }
            placeholder="Additional team amount (cents)"
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <input
            value={form.twoYearCommitmentAmountCents}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                twoYearCommitmentAmountCents: event.target.value,
              }))
            }
            placeholder="2-year commitment amount (cents)"
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={form.startAt}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, startAt: event.target.value }))
            }
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={form.endAt}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, endAt: event.target.value }))
            }
            className="rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
          />
        </div>

        <textarea
          value={form.notes}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, notes: event.target.value }))
          }
          rows={2}
          placeholder="Sponsor notes"
          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
        />
        <textarea
          value={form.packageNotes}
          onChange={(event) =>
            setForm((prev) => ({ ...prev, packageNotes: event.target.value }))
          }
          rows={2}
          placeholder="Package notes"
          className="w-full rounded-lg bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm"
        />

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
            <p className="text-xs font-semibold text-zinc-300 mb-2">
              Organization Targets
            </p>
            <div className="flex gap-4 text-sm">
              {(["gonzales", "ascension"] as const).map((org) => (
                <label key={org} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.orgTargets.includes(org)}
                    onChange={() => toggleTargetOrg(org)}
                  />
                  <span>{org}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
            <p className="text-xs font-semibold text-zinc-300 mb-2">
              Entitlements
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-300">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.includesWebsiteLogo}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      includesWebsiteLogo: event.target.checked,
                    }))
                  }
                />
                Website Logo
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.includesSocialRecognition}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      includesSocialRecognition: event.target.checked,
                    }))
                  }
                />
                Social Recognition
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.includesUniformName}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      includesUniformName: event.target.checked,
                    }))
                  }
                />
                Uniform Name
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.includesFieldSignage}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      includesFieldSignage: event.target.checked,
                    }))
                  }
                />
                Field Signage
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.includesSeasonScheduleName}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      includesSeasonScheduleName: event.target.checked,
                    }))
                  }
                />
                Season Schedule Name
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.includesAllStarMention}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      includesAllStarMention: event.target.checked,
                    }))
                  }
                />
                All-Star Mention
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, isActive: event.target.checked }))
              }
            />
            Active
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.showInFooterScroller}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  showInFooterScroller: event.target.checked,
                }))
              }
            />
            Show in Footer Scroller
          </label>
          {activeTemplate ? (
            <span className="text-zinc-400">
              Template minimum: {centsDisplay(activeTemplate.minimumCommitmentCents)}
            </span>
          ) : null}
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void saveSponsor()}
          className="rounded-lg bg-brand-purple hover:bg-brand-purple-dark px-4 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {busy ? "Saving..." : editingSponsorId ? "Save Sponsor" : "Create Sponsor"}
        </button>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4">
        <h2 className="text-lg font-semibold">Sponsors</h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-950/80 text-zinc-400">
              <tr>
                <th className="px-3 py-2 text-left">Business</th>
                <th className="px-3 py-2 text-left">Package</th>
                <th className="px-3 py-2 text-left">Amount</th>
                <th className="px-3 py-2 text-left">Targets</th>
                <th className="px-3 py-2 text-left">Scroller</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sponsors.map((sponsor) => (
                <tr key={sponsor.id} className="border-t border-zinc-800">
                  <td className="px-3 py-2">
                    <p className="font-medium">{sponsor.businessName}</p>
                    <p className="text-xs text-zinc-500">{sponsor.contactEmail || "—"}</p>
                  </td>
                  <td className="px-3 py-2">
                    {sponsor.packageEnrollment?.packageLabel || "Custom"}
                  </td>
                  <td className="px-3 py-2">
                    {centsDisplay(sponsor.packageEnrollment?.amountCents)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {sponsor.placements.map((entry) => entry.organizationId).join(", ")}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {sponsor.placements.some((entry) => entry.showInFooterScroller)
                      ? "Visible"
                      : "Hidden"}{" "}
                    (#{sponsor.placements[0]?.sortOrder || 100})
                  </td>
                  <td className="px-3 py-2 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSponsorId(sponsor.id);
                        setForm(mapSponsorToForm(sponsor));
                      }}
                      className="rounded border border-zinc-700 px-2 py-1 text-xs"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveScrollerSettings(sponsor)}
                      className="rounded border border-brand-gold px-2 py-1 text-xs text-brand-gold"
                    >
                      Sync Scroller
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeSponsor(sponsor.id)}
                      className="rounded border border-red-700 px-2 py-1 text-xs text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!busy && sponsors.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500">No sponsors yet.</p>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-3">
        <h2 className="text-lg font-semibold">Footer Scroller Preview</h2>
        <div className="flex flex-wrap gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
          {sortedScrollerSponsors.length === 0 ? (
            <p className="text-sm text-zinc-500">No logos selected for the scroller.</p>
          ) : (
            sortedScrollerSponsors.map((sponsor) => (
              <div
                key={`preview-${sponsor.id}`}
                className="rounded-lg border border-zinc-700 bg-zinc-900/70 px-3 py-2 text-xs"
              >
                <p className="font-semibold">{sponsor.businessName}</p>
                <p className="text-zinc-400">
                  #{sponsor.placements.find((entry) => entry.organizationId === targetOrg)?.sortOrder ?? 100}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
