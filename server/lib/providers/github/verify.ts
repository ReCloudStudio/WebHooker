import { hmacSha256Hex, timingSafeEqual } from "../hmac";

export async function verifySignature(
  payload: string,
  signature: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!signature || !secret) return false;
  const expected = `sha256=${await hmacSha256Hex(secret, payload)}`;
  return timingSafeEqual(signature, expected);
}
