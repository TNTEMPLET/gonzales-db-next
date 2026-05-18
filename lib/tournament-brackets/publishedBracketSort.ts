export type PublishedBracketSortInput = {
  id: string;
  name: string;
  seasonYear: number;
  updatedAt: Date | string | number;
  priority?: number | null;
  divisionLabel?: string | null;
};

type BracketAgeKey = {
  hasAge: boolean;
  age: number;
  label: string;
};

const AGE_GROUP_RE = /\b(\d{1,2})\s*U\b/i;

function normalizeSortText(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

export function bracketAgeSortKey(bracket: Pick<PublishedBracketSortInput, "divisionLabel" | "name">): BracketAgeKey {
  const label = normalizeSortText(bracket.divisionLabel) || normalizeSortText(bracket.name);
  const match = label.match(AGE_GROUP_RE);
  if (!match) {
    return {
      hasAge: false,
      age: Number.POSITIVE_INFINITY,
      label: label.toLocaleLowerCase("en-US"),
    };
  }

  return {
    hasAge: true,
    age: Number.parseInt(match[1]!, 10),
    label: label.toLocaleLowerCase("en-US"),
  };
}

function updatedAtMs(value: Date | string | number): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function comparePublishedBrackets(
  left: PublishedBracketSortInput,
  right: PublishedBracketSortInput,
): number {
  const leftPriority = Number.isFinite(left.priority) ? Number(left.priority) : 0;
  const rightPriority = Number.isFinite(right.priority) ? Number(right.priority) : 0;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  const leftAge = bracketAgeSortKey(left);
  const rightAge = bracketAgeSortKey(right);

  if (leftAge.hasAge !== rightAge.hasAge) {
    return leftAge.hasAge ? -1 : 1;
  }
  if (leftAge.age !== rightAge.age) {
    return leftAge.age - rightAge.age;
  }

  const labelCompare = leftAge.label.localeCompare(rightAge.label, "en-US", {
    numeric: true,
    sensitivity: "base",
  });
  if (labelCompare !== 0) return labelCompare;

  const nameCompare = normalizeSortText(left.name).localeCompare(normalizeSortText(right.name), "en-US", {
    numeric: true,
    sensitivity: "base",
  });
  if (nameCompare !== 0) return nameCompare;

  if (left.seasonYear !== right.seasonYear) {
    return right.seasonYear - left.seasonYear;
  }

  const updatedCompare = updatedAtMs(right.updatedAt) - updatedAtMs(left.updatedAt);
  if (updatedCompare !== 0) return updatedCompare;

  return left.id.localeCompare(right.id);
}

export function sortPublishedBrackets<T extends PublishedBracketSortInput>(brackets: readonly T[]): T[] {
  return [...brackets].sort(comparePublishedBrackets);
}
