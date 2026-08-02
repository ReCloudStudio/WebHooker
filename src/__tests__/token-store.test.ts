import { describe, it, expect } from "bun:test";
import { saveToken, getToken, removeToken, findUserIdByToken } from "../github/store";

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

describe("token-store", () => {
  it("saves and retrieves token", async () => {
    const kv = createMockKV();
    await saveToken(kv, "user1", "token-abc", 3600);
    expect(await getToken(kv, "user1")).toBe("token-abc");
  });

  it("returns null for nonexistent user", async () => {
    const kv = createMockKV();
    expect(await getToken(kv, "nobody")).toBeNull();
  });

  it("removes token and reverse index", async () => {
    const kv = createMockKV();
    await saveToken(kv, "user1", "token-abc", 3600);
    await removeToken(kv, "user1");
    expect(await getToken(kv, "user1")).toBeNull();
    expect(await findUserIdByToken(kv, "token-abc")).toBeNull();
  });

  it("finds userId by token via reverse index", async () => {
    const kv = createMockKV();
    await saveToken(kv, "user1", "token-abc", 3600);
    expect(await findUserIdByToken(kv, "token-abc")).toBe("user1");
  });

  it("returns null for unknown token", async () => {
    const kv = createMockKV();
    expect(await findUserIdByToken(kv, "unknown")).toBeNull();
  });
});
