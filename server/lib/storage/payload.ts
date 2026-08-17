import type { Env } from "../types";

const PAYLOAD_PREFIX = "webhooks/";
const DEFAULT_TTL_SECONDS = 3600;

export interface PayloadStore {
  put(payload: string, ttl?: number): Promise<string>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

function generateKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${PAYLOAD_PREFIX}${y}/${m}/${d}/${hex}.json`;
}

export function r2PayloadStore(env: Env): PayloadStore {
  const bucket = env.PAYLOAD;
  if (!bucket) {
    return {
      async put(_payload: string): Promise<string> {
        throw new Error("R2 binding is not configured");
      },
      async get(): Promise<null> {
        throw new Error("R2 binding is not configured");
      },
      async delete(): Promise<void> {
        throw new Error("R2 binding is not configured");
      },
    };
  }

  return {
    async put(payload: string, ttl?: number): Promise<string> {
      const key = generateKey();
      const expires = new Date(Date.now() + (ttl ?? DEFAULT_TTL_SECONDS) * 1000);
      await bucket.put(key, payload, {
        httpMetadata: { contentType: "application/json" },
        customMetadata: { expires: expires.toISOString() },
      });
      return key;
    },

    async get(key: string): Promise<string | null> {
      const obj = await bucket.get(key);
      if (!obj) return null;
      return obj.text();
    },

    async delete(key: string): Promise<void> {
      await bucket.delete(key);
    },
  };
}
