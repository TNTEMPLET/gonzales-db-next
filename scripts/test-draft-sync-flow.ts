/**
 * Integration test: merch draft create → PayPal-note match → shirt order row.
 * Uses the same helpers as admin sync + paypal-shirts webhook.
 * Cleans up test rows at the end.
 */
import prisma from "@/lib/prisma";
import {
  createMerchOrderDraft,
  extractMerchDraftCode,
  resolveShirtOrderFromDraft,
  toMerchDraftPublic,
} from "@/lib/merch/orderDrafts";
import {
  sizeLabelsForOrder,
  splitShirtNote,
} from "@/lib/merch/shirtSizes";

const PASS = "✓";
const FAIL = "✗";
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ${PASS} ${msg}`);
  else {
    console.log(`  ${FAIL} ${msg}`);
    failed++;
  }
}

async function main() {
  console.log("=== Merch draft order sync flow test ===\n");

  // 0) Table exists?
  console.log("0. Schema / table");
  try {
    const count = await prisma.merchOrderDraft.count();
    assert(true, `MerchOrderDraft reachable (count=${count})`);
  } catch (e) {
    console.error("  FATAL: MerchOrderDraft table missing or Prisma client stale:", e);
    process.exit(2);
  }

  // 1) Unit: code extraction + note parse
  console.log("\n1. Note parsing");
  const sampleNote = "MO-TEST01 | Test Player | YM, AL";
  assert(extractMerchDraftCode(sampleNote) === "MO-TEST01", "extractMerchDraftCode finds MO-TEST01");
  assert(extractMerchDraftCode("no code here") === null, "extract returns null without code");
  const split = splitShirtNote("MO-AB12CD | Jordan Smith | YM, AL");
  assert(split.draftCode === "MO-AB12CD", `draftCode=${split.draftCode}`);
  assert(split.player === "Jordan Smith", `player=${split.player}`);
  assert(split.sizes === "YM, AL", `sizes=${split.sizes}`);
  const labels = sizeLabelsForOrder("MO-AB12CD | Jordan Smith | YM, AL", 2);
  assert(labels.join(",") === "YM,AL", `expanded=${labels.join(",")}`);

  // 2) Create real draft (gonzales 11U)
  console.log("\n2. Create draft order");
  const draft = await createMerchOrderDraft({
    org: "gonzales",
    productId: "gonzales-11u-state-champs-shirt-2026",
    playerName: "Sync Flow Test Player",
    sizes: ["YM", "AL"],
    contactEmail: "draft-sync-test@example.com",
    createdByEmail: "draft-sync-test@example.com",
    allowClosedProduct: true,
  });
  console.log("  draft:", JSON.stringify({
    code: draft.code,
    status: draft.status,
    qty: draft.quantity,
    amount: draft.amountCents,
    note: draft.checkoutNote,
  }));
  assert(draft.status === "awaiting_payment", "status awaiting_payment");
  assert(draft.quantity === 2, "quantity 2");
  assert(draft.amountCents === 3000, "amount $30");
  assert(draft.checkoutNote.startsWith(draft.code), "note starts with code");
  assert(draft.checkoutNote.includes("Sync Flow Test Player"), "note has player");
  assert(draft.checkoutNote.includes("YM"), "note has YM");
  assert(draft.checkoutNote.includes("AL"), "note has AL");
  assert(extractMerchDraftCode(draft.checkoutNote) === draft.code, "code round-trips from note");

  const txId = `TEST-DRAFT-SYNC-${Date.now()}`;
  const fakePayPalNote = draft.checkoutNote; // what parent pastes / NCP stores

  // 3) Match path used by sync/webhook
  console.log("\n3. resolveShirtOrderFromDraft (sync/webhook path)");
  const resolved = await resolveShirtOrderFromDraft({
    note: fakePayPalNote,
    txId,
    amountCents: 3000,
    payerEmail: "payer@example.com",
    fallbackQuantity: 99, // should be overridden by draft
    fallbackOrg: "unknown",
  });
  console.log("  resolved:", resolved);
  assert(resolved.draftCode === draft.code, "matched draft code");
  assert(resolved.quantity === 2, "qty from draft not fallback 99");
  assert(resolved.org === "gonzales", "org from draft");
  assert(resolved.note === draft.checkoutNote, "structured note preserved");

  // 4) Draft row marked paid
  console.log("\n4. Draft marked paid in DB");
  const paid = await prisma.merchOrderDraft.findUnique({ where: { code: draft.code } });
  assert(!!paid, "draft still exists");
  assert(paid!.status === "paid", `status=${paid!.status}`);
  assert(paid!.paypalTxId === txId, `paypalTxId=${paid!.paypalTxId}`);
  assert(!!paid!.paidAt, "paidAt set");

  // 5) Create shirt order like sync does
  console.log("\n5. Create ShirtOrderRecord like sync");
  const order = await prisma.shirtOrderRecord.create({
    data: {
      txId,
      org: resolved.org,
      payerName: "Test Payer",
      payerEmail: "payer@example.com",
      amountCents: 3000,
      quantity: resolved.quantity,
      note: resolved.note,
      itemName: "Gonzales 11U DYB — State Champs Shirt (TEST)",
      txDate: new Date(),
      items: {
        create: Array.from({ length: resolved.quantity }, (_, i) => ({ seq: i + 1 })),
      },
    },
    include: { items: true },
  });
  assert(order.quantity === 2, "shirt order qty 2");
  assert(order.items.length === 2, "2 open items");
  const deskPlayer = splitShirtNote(order.note).player;
  const deskSizes = sizeLabelsForOrder(order.note, order.quantity);
  assert(deskPlayer === "Sync Flow Test Player", `desk player=${deskPlayer}`);
  assert(deskSizes.join(",") === "YM,AL", `desk sizes=${deskSizes.join(",")}`);

  // 6) Idempotency: same tx again should not re-match badly
  console.log("\n6. Idempotent re-resolve same txId");
  const again = await resolveShirtOrderFromDraft({
    note: fakePayPalNote,
    txId,
    amountCents: 3000,
    payerEmail: "payer@example.com",
    fallbackQuantity: 1,
    fallbackOrg: "unknown",
  });
  assert(again.draftCode === draft.code, "still matches");
  assert(again.quantity === 2, "still qty 2");
  const still = await prisma.merchOrderDraft.findUnique({ where: { code: draft.code } });
  assert(still!.paypalTxId === txId, "tx id unchanged");

  // 7) Unknown code does not throw
  console.log("\n7. Unknown MO- code is safe");
  const unknown = await resolveShirtOrderFromDraft({
    note: "MO-ZZZZZZ | Nobody | AS",
    txId: `TEST-UNKNOWN-${Date.now()}`,
    amountCents: 1500,
    fallbackQuantity: 1,
    fallbackOrg: "ascension",
  });
  assert(unknown.draftCode === null, "no draft match");
  assert(unknown.quantity === 1, "fallback qty");
  assert(unknown.org === "ascension", "fallback org");

  // 8) Cleanup test artifacts
  console.log("\n8. Cleanup");
  await prisma.shirtOrderItem.deleteMany({ where: { orderId: order.id } });
  await prisma.shirtOrderRecord.delete({ where: { id: order.id } });
  await prisma.merchOrderDraft.delete({ where: { id: draft.id } });
  assert(true, "test draft + shirt order removed");

  console.log("\n=== RESULT ===");
  if (failed === 0) {
    console.log("ALL CHECKS PASSED");
    process.exit(0);
  } else {
    console.log(`${failed} CHECK(S) FAILED`);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("Unhandled:", e);
    process.exit(2);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
