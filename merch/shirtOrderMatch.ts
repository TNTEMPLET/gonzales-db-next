import "server-only";

/**
 * Shared shirt-order matching helpers for PayPal reporting sync + webhooks.
 * NCP item titles vary slightly ("11U, DYB - …" vs shop display names).
 */

export function isShirtOrderItem(
  itemName: string | null | undefined,
  gonzalesKw = "",
  ascensionKw = "",
): boolean {
  const name = (itemName ?? "").toLowerCase();
  if (gonzalesKw || ascensionKw) {
    return (
      (!!gonzalesKw && name.includes(gonzalesKw.toLowerCase())) ||
      (!!ascensionKw && name.includes(ascensionKw.toLowerCase()))
    );
  }
  // Default when env keywords are unset — avoid matching unrelated PayPal activity.
  return (
    name.includes("shirt") ||
    name.includes("state champ") ||
    name.includes("team la") ||
    name.includes("waco")
  );
}

export function resolveShirtOrg(
  itemName: string | null | undefined,
  gonzalesKw = "",
  ascensionKw = "",
): string {
  const name = (itemName ?? "").toLowerCase();
  if (gonzalesKw && name.includes(gonzalesKw.toLowerCase())) return "gonzales";
  if (ascensionKw && name.includes(ascensionKw.toLowerCase())) return "ascension";
  if (gonzalesKw && !ascensionKw) return "gonzales";
  if (ascensionKw && !gonzalesKw) return "ascension";
  if (name.includes("gonzales") || name.includes("dyb") || name.includes("diamond")) {
    return "gonzales";
  }
  // Ascension LLB buttons often say "AP LL" (not "llb" / full "little league").
  if (
    name.includes("ascension") ||
    name.includes("llb") ||
    name.includes("little league") ||
    name.includes("ap ll") ||
    name.includes("team la") ||
    name.includes("waco") ||
    /\bll\b/.test(name)
  ) {
    return "ascension";
  }
  return "unknown";
}

/** Heuristic: $15 NCP shirt multiples when cart item name is missing (Reporting lag). */
export function looksLikeShirtAmount(amountCents: number, unitCents = 1500): boolean {
  if (amountCents <= 0 || unitCents <= 0) return false;
  if (amountCents % unitCents !== 0) return false;
  const qty = amountCents / unitCents;
  return qty >= 1 && qty <= 10;
}
