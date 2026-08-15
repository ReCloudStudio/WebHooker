import { describe, it, expect } from "bun:test";
import {
  classifyDelivery,
  deliveryStateKey,
  discardPayload,
  enqueueWebhook,
  getDeliveryState,
  isRetryableError,
  resolvePayload,
  retryDelay,
  setDeliveryState,
  type DeliveryMessage,
  type DispatchSummary,
} from "../server/lib/queue/delivery";
import type { Env } from "../server/lib/types";

function createMockKV(): { kv: KVNamespace; store: Map<string, string> } {
  const store = new Map<string, string>();
  const kv = {
    get: async (key: string) => (store.has(key) ? store.get(key)! : null),
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async () => ({ keys: [], list_complete: true, cacheStatus: null }),
  } as unknown as KVNamespace;
  return { kv, store };
}

function createMockQueue(): { queue: Queue; sent: DeliveryMessage[] } {
  const sent: DeliveryMessage[] = [];
  const queue = {
    send: async (message: DeliveryMessage) => {
      sent.push(message);
    },
    sendBatch: async () => {},
  } as unknown as Queue;
  return { queue, sent };
}

function createEnv(kv: KVNamespace, queue?: Queue): Env {
  return {
    GITHUB_WEBHOOK_SECRET: "secret",
    KV: kv,
    DB: {} as D1Database,
    QUEUE: queue,
  };
}

function message(overrides: Partial<DeliveryMessage> = {}): DeliveryMessage {
  return {
    deliveryId: "d1",
    provider: "github",
    event: "push",
    payload: { ref: "refs/heads/main" },
    receivedAt: Date.now(),
    ...overrides,
  };
}

describe("isRetryableError", () => {
  it("treats undefined as retryable", () => {
    expect(isRetryableError(undefined)).toBe(true);
  });
  it("treats 5xx/network/retries as retryable", () => {
    expect(isRetryableError("DISCORD_5XX")).toBe(true);
    expect(isRetryableError("TELEGRAM_5XX")).toBe(true);
    expect(isRetryableError("NETWORK")).toBe(true);
    expect(isRetryableError("RETRIES")).toBe(true);
  });
  it("treats 4xx and config errors as permanent", () => {
    expect(isRetryableError("DISCORD_ERROR")).toBe(false);
    expect(isRetryableError("TELEGRAM_ERROR")).toBe(false);
    expect(isRetryableError("NO_TOKEN")).toBe(false);
    expect(isRetryableError("NO_TARGET")).toBe(false);
  });
});

describe("retryDelay", () => {
  it("follows the exponential backoff schedule", () => {
    expect(retryDelay(1)).toBe(5);
    expect(retryDelay(2)).toBe(30);
    expect(retryDelay(3)).toBe(120);
    expect(retryDelay(4)).toBe(600);
    expect(retryDelay(10)).toBe(600);
  });
  it("clamps sub-one attempts to the first delay", () => {
    expect(retryDelay(0)).toBe(5);
  });
});

describe("classifyDelivery", () => {
  it("reports success when no failures", () => {
    expect(classifyDelivery({ attempts: 1, failures: [] })).toEqual({
      failed: false,
      retryable: false,
    });
  });
  it("is retryable when every failure is retryable", () => {
    const summary: DispatchSummary = {
      attempts: 2,
      failures: [{ target: "c1", errorCode: "DISCORD_5XX" }],
    };
    expect(classifyDelivery(summary)).toEqual({ failed: true, retryable: true });
  });
  it("is not retryable when any failure is permanent", () => {
    const summary: DispatchSummary = {
      attempts: 2,
      failures: [
        { target: "c1", errorCode: "DISCORD_5XX" },
        { target: "c2", errorCode: "DISCORD_ERROR" },
      ],
    };
    expect(classifyDelivery(summary)).toEqual({ failed: true, retryable: false });
  });
});

describe("delivery state", () => {
  it("round-trips status via KV", async () => {
    const { kv } = createMockKV();
    const env = createEnv(kv);
    const key = deliveryStateKey("github", "g1", "d1");
    await setDeliveryState(env, key, "processing");
    expect(await getDeliveryState(env, key)).toBe("processing");
    await setDeliveryState(env, key, "delivered");
    expect(await getDeliveryState(env, key)).toBe("delivered");
  });

  it("returns null for an unknown key", async () => {
    const { kv } = createMockKV();
    expect(await getDeliveryState(createEnv(kv), "delivery-state:nope")).toBeNull();
  });

  it("scopes state keys by provider, group and delivery id", () => {
    expect(deliveryStateKey("github", "g1", "d1")).toBe("delivery-state:github:g1:d1");
    expect(deliveryStateKey("github", undefined, "d1")).toBe("delivery-state:github:global:d1");
  });
});

describe("enqueueWebhook", () => {
  it("sends the message directly when it fits", async () => {
    const { kv } = createMockKV();
    const { queue, sent } = createMockQueue();
    const env = createEnv(kv, queue);
    await enqueueWebhook(env, message());
    expect(sent).toHaveLength(1);
    expect(sent[0].deliveryId).toBe("d1");
    expect(sent[0].payload).toEqual({ ref: "refs/heads/main" });
    expect(sent[0].payloadRef).toBeUndefined();
  });

  it("stores the payload in KV when the message overflows", async () => {
    const { kv, store } = createMockKV();
    const { queue, sent } = createMockQueue();
    const env = createEnv(kv, queue);
    const large = "x".repeat(150_000);
    await enqueueWebhook(env, message({ payload: { data: large } }));
    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toBeUndefined();
    expect(sent[0].payloadRef).toBe("queue:payload:github:global:d1");
    const stored = store.get("queue:payload:github:global:d1");
    expect(stored).toBeDefined();
    expect(JSON.parse(stored!).data).toBe(large);
  });

  it("throws when the QUEUE binding is missing", async () => {
    const { kv } = createMockKV();
    await expect(enqueueWebhook(createEnv(kv), message())).rejects.toThrow(
      "QUEUE binding is not configured",
    );
  });
});

describe("resolvePayload / discardPayload", () => {
  it("reads the payload from the message", async () => {
    const { kv } = createMockKV();
    const env = createEnv(kv);
    expect(await resolvePayload(env, message())).toEqual({ ref: "refs/heads/main" });
  });

  it("reads the payload from KV when a payloadRef is set", async () => {
    const { kv, store } = createMockKV();
    store.set("queue:payload:github:global:d1", JSON.stringify({ a: 1 }));
    const env = createEnv(kv);
    expect(
      await resolvePayload(
        env,
        message({ payload: undefined, payloadRef: "queue:payload:github:global:d1" }),
      ),
    ).toEqual({ a: 1 });
  });

  it("returns an empty object when the payloadRef is missing", async () => {
    const { kv } = createMockKV();
    expect(
      await resolvePayload(
        createEnv(kv),
        message({ payload: undefined, payloadRef: "queue:payload:missing" }),
      ),
    ).toEqual({});
  });

  it("deletes the payloadRef on discard", async () => {
    const { kv, store } = createMockKV();
    store.set("queue:payload:github:global:d1", "{}");
    await discardPayload(createEnv(kv), message({ payloadRef: "queue:payload:github:global:d1" }));
    expect(store.has("queue:payload:github:global:d1")).toBe(false);
  });
});
