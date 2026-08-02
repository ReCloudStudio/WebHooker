const keyCache = new Map<string, CryptoKey>();

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const cached = keyCache.get(secret);
  if (cached) return cached;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  keyCache.set(secret, key);
  return key;
}

export async function verifySignature(
  payload: string,
  signature: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await getHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expected = `sha256=${Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;

  try {
    const a = encoder.encode(signature);
    const b = encoder.encode(expected);
    if (a.byteLength !== b.byteLength) return false;
    let diff = 0;
    for (let i = 0; i < a.byteLength; i++) {
      diff |= a[i]! ^ b[i]!;
    }
    return diff === 0;
  } catch {
    return false;
  }
}
