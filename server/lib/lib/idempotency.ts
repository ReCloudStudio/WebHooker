import { canUseD1 } from "../storage/d1";

/**
 * Delivery idempotency: a small, reusable abstraction over "has this key been
 * seen / can I claim it once" so webhook dedup, nonce replay protection and
 * future delivery retry all share one semantics. Backed by D1 when the binding
 * is present (atomic `INSERT OR IGNORE`), falling back to a best-effort
 * get-then-put KV claim otherwise.
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

export function d1IdempotencyStore(db: D1Database): IdempotencyStore {
  return {
    async has(key): Promise<boolean> {
      const row = await db
        .prepare("SELECT 1 AS hit FROM dedup_keys WHERE key = ? AND expires_at > ?")
        .bind(key, Date.now())
        .first<{ hit: number }>();
      return row != null;
    },
    async claim(key, ttlSeconds): Promise<boolean> {
      const now = Date.now();
      const result = await db
        .prepare(
          `INSERT INTO dedup_keys (key, claimed_at, expires_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET
             claimed_at = excluded.claimed_at, expires_at = excluded.expires_at
           WHERE dedup_keys.expires_at < excluded.expires_at`,
        )
        .bind(key, now, now + ttlSeconds * 1000)
        .run();
      return (result.meta?.changes ?? 0) > 0;
    },
  };
}

export function idempotencyStore(db: D1Database, kv: KVNamespace): IdempotencyStore {
  return canUseD1(db) ? d1IdempotencyStore(db) : kvIdempotencyStore(kv);
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