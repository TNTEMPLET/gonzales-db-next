import type { MerchProduct } from "@/lib/merch/types";

/**
 * Built-in seed SKUs. Upserted into MerchProduct on first catalog load / explicit seed.
 * PayPal NCP remains source of truth for payment terms; these rows are the shop listing.
 */
export const MERCH_CATALOG_SEED: MerchProduct[] = [
  {
    id: "gonzales-11u-state-champs-shirt-2026",
    orgs: ["gonzales"],
    name: "Gonzales 11U DYB — State Champs Shirt",
    summary: "Celebrate the 11U State Championship with the official team shirt.",
    description:
      "Fixed-price PayPal checkout. Enter the player name and shirt size(s) on the PayPal form. Quantity up to 10 per order.",
    priceCents: 1500,
    paypalUrl: "https://www.paypal.com/ncp/payment/Z5HW3TUQFBYWE",
    imageUrl: "/images/merch-gonzales-11u-shirt.jpg",
    badge: "State Champs",
    checkoutHints: [
      "Required on PayPal: player name",
      "Required on PayPal: size(s) for each shirt",
      "Up to 10 shirts per checkout",
    ],
    maxQuantity: 10,
    fulfillment: "shirt-orders",
    active: true,
    sortOrder: 10,
  },
  {
    id: "ascension-7-8u-state-champs-shirt-2026",
    orgs: ["ascension"],
    name: "7–8U AP LL — State Champs Shirt",
    summary: "Celebrate the 7–8U State Championship with the official Ascension Little League shirt.",
    description:
      "Fixed-price PayPal checkout. Enter the player name and shirt size(s) on the PayPal form. Quantity up to 10 per order.",
    priceCents: 1500,
    paypalUrl: "https://www.paypal.com/ncp/payment/CFDJ5F97YVCF8",
    imageUrl: "/images/merch-ascension-7-8u-shirt.jpg",
    badge: "State Champs",
    checkoutHints: [
      "Required on PayPal: player name",
      "Required on PayPal: size(s) for each shirt",
      "Up to 10 shirts per checkout",
    ],
    maxQuantity: 10,
    fulfillment: "shirt-orders",
    active: true,
    sortOrder: 10,
  },
  {
    id: "ascension-10u-state-champs-shirt-2026",
    orgs: ["ascension"],
    name: "10U AP LL — State Champs Shirt",
    summary: "Celebrate the 10U State Championship with the official Ascension Little League shirt.",
    description:
      "Fixed-price PayPal checkout. Enter the player name and shirt size(s) on the PayPal form. Quantity up to 10 per order.",
    priceCents: 1500,
    paypalUrl: "https://www.paypal.com/ncp/payment/CFQP6QBDF7C7N",
    imageUrl: "/images/merch-ascension-10u-shirt.jpg",
    badge: "State Champs",
    checkoutHints: [
      "Required on PayPal: player name",
      "Required on PayPal: size(s) for each shirt",
      "Up to 10 shirts per checkout",
    ],
    maxQuantity: 10,
    fulfillment: "shirt-orders",
    active: true,
    sortOrder: 20,
  },
  {
    id: "ascension-11u-state-champs-shirt-2026",
    orgs: ["ascension"],
    name: "11U AP LL — State Champs Shirt",
    summary: "Celebrate the 11U State Championship with the official Ascension Little League shirt.",
    description:
      "Fixed-price PayPal checkout. Enter the player name and shirt size(s) on the PayPal form. Quantity up to 10 per order.",
    priceCents: 1500,
    paypalUrl: "https://www.paypal.com/ncp/payment/4XAXPZ9YN4FDA",
    imageUrl: "/images/merch-ascension-11u-shirt.jpg",
    badge: "State Champs",
    checkoutHints: [
      "Required on PayPal: player name",
      "Required on PayPal: size(s) for each shirt",
      "Up to 10 shirts per checkout",
    ],
    maxQuantity: 10,
    fulfillment: "shirt-orders",
    active: true,
    sortOrder: 30,
  },
  {
    id: "ascension-12u-state-champs-shirt-2026",
    orgs: ["ascension"],
    name: "12U AP LL — State Champs Shirt",
    summary: "Celebrate the 12U State Championship with the official Ascension Little League shirt.",
    description:
      "Fixed-price PayPal checkout. Enter the player name and shirt size(s) on the PayPal form. Quantity up to 10 per order.",
    priceCents: 1500,
    paypalUrl: "https://www.paypal.com/ncp/payment/EGP9BSTMFNYCW",
    imageUrl: "/images/merch-ascension-12u-shirt.jpg",
    badge: "State Champs",
    checkoutHints: [
      "Required on PayPal: player name",
      "Required on PayPal: size(s) for each shirt",
      "Up to 10 shirts per checkout",
    ],
    maxQuantity: 10,
    fulfillment: "shirt-orders",
    active: true,
    sortOrder: 40,
  },
  {
    id: "ascension-12u-waco-team-la-shirt-2026",
    orgs: ["ascension"],
    name: "12U AP LL — AP / Team LA Shirt for Waco",
    summary:
      "12U AP / Team LA shirt for the Waco trip. Official Ascension Little League checkout via PayPal.",
    description:
      "Fixed-price PayPal checkout. Enter the player name and shirt size(s) on the PayPal form. Quantity up to 10 per order.",
    priceCents: 1500,
    paypalUrl: "https://www.paypal.com/ncp/payment/8RMYRVPQSJMX2",
    imageUrl: "/images/merch-ascension-12u-waco-shirt.jpg",
    badge: "Waco",
    checkoutHints: [
      "Required on PayPal: player name",
      "Required on PayPal: size(s) for each shirt",
      "Up to 10 shirts per checkout",
    ],
    maxQuantity: 10,
    fulfillment: "shirt-orders",
    active: true,
    sortOrder: 50,
  },
];
