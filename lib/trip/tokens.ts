import { randomBytes } from "crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnopqrstuvwxyz";

/** Unguessable invite token for parent trip form links. */
export function generateTripInviteToken(bytes = 18): string {
  const buf = randomBytes(bytes);
  let out = "TR-";
  for (let i = 0; i < buf.length; i++) {
    out += ALPHABET[buf[i]! % ALPHABET.length];
  }
  return out;
}
