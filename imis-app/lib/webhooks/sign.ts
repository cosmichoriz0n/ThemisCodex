import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Signs a payload object with HMAC-SHA256 using the given secret.
 * Uses JSON.stringify deterministically — the caller must ensure the same
 * object shape is used when verifying (no extra keys, same key order).
 * Returns the hex digest for use as the X-IMIS-Signature header value.
 */
export function signPayload(payload: object, secret: string): string {
  return createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
}

/**
 * Verifies an X-IMIS-Signature header value against a payload.
 * Uses timingSafeEqual to prevent timing attacks.
 * Returns false if signature is missing, malformed, or invalid.
 */
export function verifySignature(
  payload: object,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    // Buffers of different length throw — treat as invalid
    return false;
  }
}
