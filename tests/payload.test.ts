import { describe, it, expect } from "bun:test";
import { r2PayloadStore, type PayloadStore } from "../server/lib/storage/payload";
import type { Env } from "../server/lib/types";

interface FakeBucket {
  put: (key: string, value: string) => Promise<void>;
  get: (key: string) => Promise<{ text: () => Promise<string> } | null>;
  delete: (key: string) => Promise<void>;
  objects: Map<string, string>;
}

function createBucket(): FakeBucket {
  const objects = new Map<string, string>();
  const bucket: FakeBucket = {
    objects,
    put: async (key, value) => {
      objects.set(key, value);
    },
    get: async (key) => {
      const v = objects.get(key);
      return v ? { text: async () => v } : null;
    },
    delete: async (key) => {
      objects.delete(key);
    },
  };
  return bucket;
}

function envWith(bucket?: FakeBucket): Env {
  return {
    GITHUB_WEBHOOK_SECRET: "secret",
    KV: {} as KVNamespace,
    DB: {} as D1Database,
    PAYLOAD: bucket as unknown as R2Bucket,
  };
}

describe("r2PayloadStore", () => {
  it("round-trips a payload through put/get/delete", async () => {
    const bucket = createBucket();
    const store: PayloadStore = r2PayloadStore(envWith(bucket));
    const key = await store.put('{"hello":"world"}');
    expect(key.startsWith("webhooks/")).toBe(true);
    expect(await store.get(key)).toBe('{"hello":"world"}');
    await store.delete(key);
    expect(await store.get(key)).toBeNull();
  });

  it("generates unique keys per put", async () => {
    const store = r2PayloadStore(envWith(createBucket()));
    const a = await store.put("a");
    const b = await store.put("b");
    expect(a).not.toBe(b);
  });

  it("returns null for a missing key", async () => {
    const store = r2PayloadStore(envWith(createBucket()));
    expect(await store.get("webhooks/nope.json")).toBeNull();
  });

  it("throws when the R2 binding is not configured", async () => {
    const store = r2PayloadStore(envWith(undefined));
    await expect(store.put("x")).rejects.toThrow("R2 binding is not configured");
    await expect(store.get("x")).rejects.toThrow("R2 binding is not configured");
    await expect(store.delete("x")).rejects.toThrow("R2 binding is not configured");
  });
});