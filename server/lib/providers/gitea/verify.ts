import { hmacSha256Hex, timingSafeEqual } from "../hmac";

/**
 * Gitea signs webhooks with the HMAC-SHA256 hex digest of the raw body in the
 * `X-Gitea-Signature` header (no `sha256=` prefix, unlike GitHub).
 */
export async function verifyGiteaSignature(
  payload: string,
  signature: string | undefined,
  secret: string | undefined,
): Promise<boolean> {
  if (!signature || !secret) return false;
  const expected = await hmacSha256Hex(secret, payload);
  return timingSafeEqual(signature, expected);
}
