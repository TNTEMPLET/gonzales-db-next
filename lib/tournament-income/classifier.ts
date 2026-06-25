import type { PayPalTransaction } from "@/lib/paypal/client";
import type { BracketOrgId } from "@/lib/siteConfig";
import {
  DEFAULT_TOURNAMENT_INCOME_ORG,
  type TournamentIncomeCategoryValue,
  type TournamentIncomeClassificationValue,
} from "@/lib/tournament-income/constants";

type KeywordRule = {
  category: Exclude<TournamentIncomeCategoryValue, "OTHER">;
  keywords: readonly string[];
};

const CATEGORY_RULES: readonly KeywordRule[] = [
  {
    category: "ENTRY_FEE",
    keywords: [
      "entry fee",
      "entry fees",
      "team entry",
      "tournament entry",
      "tournament fee",
      "registration fee",
      "registration",
      "register team",
      "team fee",
    ],
  },
  {
    category: "SPONSOR",
    keywords: [
      "sponsor",
      "sponsorship",
      "banner",
      "advertisement",
      "advertising",
      "donation",
      "donor",
    ],
  },
  {
    category: "MERCHANDISE",
    keywords: [
      "merch",
      "merchandise",
      "shirt",
      "t-shirt",
      "tshirt",
      "hoodie",
      "cap",
      "hat",
    ],
  },
  {
    category: "GATE",
    keywords: ["gate", "admission", "ticket", "tickets", "wristband", "pass"],
  },
] as const;

const ORG_KEYWORDS: Partial<Record<BracketOrgId, readonly string[]>> = {
  ladistrict6: [
    "district 6",
    "district six",
    "d6",
    "d-6",
    "dyb district 6",
    "louisiana district 6",
    "ladistrict6",
  ],
  ladistrict2: [
    "district 2",
    "district two",
    "d2",
    "d-2",
    "little league district 2",
    "ladistrict2",
  ],
  gonzales: ["gonzales", "gonzales dyb", "gdb"],
  ascension: ["ascension", "ascension ll", "ascension little league"],
};

export type TournamentIncomeClassificationResult = {
  category: TournamentIncomeCategoryValue;
  classificationStatus: TournamentIncomeClassificationValue;
  matchedKeywords: string[];
  matchedOrgKeywords: string[];
  targetOrg: BracketOrgId;
  reason: string;
};

function normalizeSearchText(parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function matchesKeyword(text: string, keyword: string): boolean {
  const normalized = keyword.toLowerCase();
  if (/^[a-z0-9 ]+$/.test(normalized)) {
    return new RegExp(`(^|\\b)${normalized.replace(/\s+/g, "\\s+")}(\\b|$)`).test(text);
  }
  return text.includes(normalized);
}

export function classifyTournamentIncomeTransaction(
  tx: Pick<PayPalTransaction, "itemName" | "itemCode" | "note" | "checkoutNote" | "payerName" | "payerEmail">,
  options?: { targetOrg?: BracketOrgId },
): TournamentIncomeClassificationResult {
  const targetOrg = options?.targetOrg ?? DEFAULT_TOURNAMENT_INCOME_ORG;
  const text = normalizeSearchText([
    tx.itemName,
    tx.itemCode,
    tx.note,
    tx.checkoutNote,
    tx.payerName,
    tx.payerEmail,
  ]);

  const matchedOrgKeywords = (ORG_KEYWORDS[targetOrg] ?? []).filter((keyword) =>
    matchesKeyword(text, keyword),
  );

  for (const rule of CATEGORY_RULES) {
    const matchedKeywords = rule.keywords.filter((keyword) => matchesKeyword(text, keyword));
    if (matchedKeywords.length > 0) {
      return {
        category: rule.category,
        classificationStatus: "MATCHED",
        matchedKeywords,
        matchedOrgKeywords,
        targetOrg,
        reason: `Matched ${rule.category.toLowerCase().replace(/_/g, " ")} keyword`,
      };
    }
  }

  return {
    category: "OTHER",
    classificationStatus: "UNMATCHED",
    matchedKeywords: [],
    matchedOrgKeywords,
    targetOrg,
    reason: matchedOrgKeywords.length
      ? "Matched organization keyword but no income category keyword"
      : "No income category keyword matched",
  };
}
