/**
 * Delivery idempotency: a small, reusable abstraction over "has this key been
 * seen / can I claim it once" so webhook dedup, nonce replay protection and
 * future delivery retry all share one semantics. `claim` is best-effort atomic
 * on KV (get-then-put): under a concurrent double-send both callers may see
 * "unclaimed", but that matches the existing dedup behavior and is acceptable
 * because dispatch itself is idempotent per (provider, group, delivery).
 */
export interface IdempotencyStore {
  has(key: string): Promise<boolean>;
  claim(key: string, ttlSeconds: number): Promise<boolean>;
}

export function kvIdempotencyStore(kv: KVNamespace): IdempotencyStore {
  return {
    async has(key): Promise<boolean> {
      const value = await kv.get(key);
      return value !== null && value !== undefined;
    },
    async claim(key, ttlSeconds): Promise<boolean> {
      const value = await kv.get(key);
      if (value !== null && value !== undefined) return false;
      await kv.put(key, "1", { expirationTtl: ttlSeconds });
      return true;
    },
  };
}

/**
 * Canonical dedup key for a webhook delivery: provider + tenant + delivery id.
 * The legacy global endpoint has no tenant, so `groupId` is "global".
 */
export function deliveryKey(
  provider: string,
  groupId: string | undefined,
  deliveryId: string,
): string {
  return `delivery:${provider}:${groupId ?? "global"}:${deliveryId}`;
}
