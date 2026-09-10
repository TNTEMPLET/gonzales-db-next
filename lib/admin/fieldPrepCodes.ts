import type { HeatmapPark } from "@/lib/admin/fieldCapacityHeatmap";

export type FieldPrepCode = {
  fieldId: string;
  parkId: string;
  parkName: string;
  parkCode: string;
  fieldName: string;
  fieldToken: string;
  columnCode: string;
};

function lettersOnly(value: string): string {
  return value.toUpperCase().replace(/[^A-Z]/g, "");
}

export function parkCodeFromName(name: string, shortName?: string | null): string {
  const short = shortName?.trim() ?? "";
  if (/^[A-Za-z]{2,4}$/.test(short)) return short.toUpperCase().slice(0, 3);
  const letters = lettersOnly(short) || lettersOnly(name);
  return (letters.slice(0, 3) || "PK").padEnd(3, "X");
}

export function fieldTokenFromName(name: string, shortName?: string | null): string {
  const numbered = `${shortName ?? ""} ${name}`.match(/\d+/);
  if (numbered) return String(Number(numbered[0]));
  const letters = lettersOnly(name).replace(/^FIELD/, "") || lettersOnly(shortName ?? "") || lettersOnly(name);
  return letters.slice(0, 3) || "FLD";
}

function uniquify(code: string, used: Set<string>): string {
  if (!used.has(code)) {
    used.add(code);
    return code;
  }
  for (const suffix of "BCDEFGHJKMNPQRSTVWXYZ") {
    const next = `${code}${suffix}`;
    if (!used.has(next)) {
      used.add(next);
      return next;
    }
  }
  let i = 2;
  while (used.has(`${code}${i}`)) i += 1;
  const next = `${code}${i}`;
  used.add(next);
  return next;
}

export function buildFieldPrepCodes(parks: HeatmapPark[], fieldIds: Iterable<string>): FieldPrepCode[] {
  const wanted = new Set(fieldIds);
  const byPark = new Map<string, Set<string>>();
  const rows: FieldPrepCode[] = [];

  for (const park of parks) {
    const parkCode = parkCodeFromName(park.name, park.shortName);
    const used = byPark.get(park.id) ?? new Set<string>();
    byPark.set(park.id, used);
    for (const field of park.fields) {
      if (!wanted.has(field.id)) continue;
      const fieldToken = uniquify(fieldTokenFromName(field.name, field.shortName), used);
      rows.push({
        fieldId: field.id,
        parkId: park.id,
        parkName: park.name,
        parkCode,
        fieldName: field.shortName || field.name,
        fieldToken,
        columnCode: `${parkCode} ${fieldToken}`,
      });
    }
  }

  return rows.sort(
    (a, b) =>
      a.parkName.localeCompare(b.parkName) ||
      a.columnCode.localeCompare(b.columnCode, undefined, { numeric: true }),
  );
}
