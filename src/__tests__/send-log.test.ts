import { describe, it, expect } from "bun:test";
import { recordSend, getSendLog } from "../send-log";

function createMockKV(): KVNamespace {
  const store = new Map<string, { value: string; expiration?: number }>();
  return {
    get: async (key: string, type?: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiration && Date.now() / 1000 > entry.expiration) {
        store.delete(key);
        return null;
      }
      if (type === "json") return JSON.parse(entry.value);
      return entry.value;
    },
    put: async (key: string, value: string, opts?: { expirationTtl?: number }) => {
      const expiration = opts?.expirationTtl ? Date.now() / 1000 + opts.expirationTtl : undefined;
      store.set(key, { value, expiration });
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async () => ({
      keys: [...store.keys()].map((k) => ({ name: k })),
      list_complete: true,
      cacheStatus: null,
    }),
  } as unknown as KVNamespace;
}

describe("send-log", () => {
  it("records and returns logs sorted newest first", async () => {
    const kv = createMockKV();
    await recordSend(kv, { ts: 1000, routeId: "a", event: "push", target: "111", ok: true });
    await recordSend(kv, {
      ts: 2000,
      routeId: "b",
      event: "issues",
      target: "222",
      ok: false,
      error: "Missing Permissions",
    });
    const logs = await getSendLog(kv);
    expect(logs).toHaveLength(2);
    expect(logs[0]!.routeId).toBe("b");
    expect(logs[0]!.ok).toBe(false);
    expect(logs[0]!.error).toBe("Missing Permissions");
    expect(logs[1]!.routeId).toBe("a");
  });

  it("returns empty when no logs", async () => {
    const kv = createMockKV();
    expect(await getSendLog(kv)).toEqual([]);
  });
});
