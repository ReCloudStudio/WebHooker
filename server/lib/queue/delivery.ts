import type { Env } from "../types";
import { r2PayloadStore } from "../storage/payload";
import { canUseD1 } from "../storage/d1";

export type DeliveryStatus =
  | "pending" | "processing" | "delivered" | "retrying" | "failed" | "dead";

export interface DeliveryMessage {
  deliveryId: string;
  groupId?: string;
  provider: string;
  event: string;
  payload?: Record<string, unknown>;
  /** R2 object key (new) or KV key (legacy `queue:payload:*`). */
  payloadRef?: string;
  /** Distinguishes R2 payload refs from legacy KV keys. */
  payloadRefType?: "r2" | "kv";
  installationId?: number;
  receivedAt: number;
  requestId?: string;
}

export interface DispatchFailure {
  target: string;
  error?: string;
  errorCode?: string;
  status?: number;
}

export interface DispatchSummary {
  attempts: number;
  failures: DispatchFailure[];
}

export const DELIVERY_QUEUE = "webhooker-delivery";
export const DELIVERY_DLQ = "webhooker-delivery-dlq";

const MAX_QUEUE_MESSAGE_BYTES = 100_000;
const PAYLOAD_KV_TTL_SECONDS = 3600;
const STATE_KV_TTL_SECONDS = 3600;

const RETRYABLE_ERROR_CODES = new Set(["DISCORD_5XX", "TELEGRAM_5XX", "NETWORK", "RETRIES"]);

const RETRY_DELAYS_SECONDS = [5, 30, 120, 600];

export function isRetryableError(code?: string): boolean {
  return code == null || RETRYABLE_ERROR_CODES.has(code);
}

export function classifyDelivery(summary: DispatchSummary): {
  failed: boolean;
  retryable: boolean;
} {
  if (summary.failures.length === 0) return { failed: false, retryable: false };
  const retryable = summary.failures.every((f) => isRetryableError(f.errorCode));
  const permanent = summary.failures.some((f) => !isRetryableError(f.errorCode));
  return { failed: true, retryable: retryable && !permanent };
}

export function retryDelay(attempt: number): number {
  if (attempt < 1) return RETRY_DELAYS_SECONDS[0];
  const idx = Math.min(attempt - 1, RETRY_DELAYS_SECONDS.length - 1);
  return RETRY_DELAYS_SECONDS[idx];
}

function scopeKey(provider: string, groupId: string | undefined, deliveryId: string): string {
  return `${provider}:${groupId ?? "global"}:${deliveryId}`;
}

export function deliveryStateKey(
  provider: string,
  groupId: string | undefined,
  deliveryId: string,
): string {
  return `delivery-state:${scopeKey(provider, groupId, deliveryId)}`;
}

function payloadKey(provider: string, groupId: string | undefined, deliveryId: string): string {
  return `queue:payload:${scopeKey(provider, groupId, deliveryId)}`;
}

export async function setDeliveryState(
  env: Env,
  key: string,
  status: DeliveryStatus,
): Promise<void> {
  const db = env.DB;
  if (canUseD1(db)) {
    await db
      .prepare(
        `INSERT INTO delivery_state (key, status, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
      )
      .bind(key, status, Date.now())
      .run();
    return;
  }
  await env.KV.put(key, JSON.stringify({ status, at: Date.now() }), {
    expirationTtl: STATE_KV_TTL_SECONDS,
  });
}

export async function getDeliveryState(env: Env, key: string): Promise<DeliveryStatus | null> {
  const db = env.DB;
  if (canUseD1(db)) {
    const row = await db
      .prepare("SELECT status FROM delivery_state WHERE key = ?")
      .bind(key)
      .first<{ status: DeliveryStatus }>();
    return row?.status ?? null;
  }
  const raw = await env.KV.get(key);
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { status?: DeliveryStatus }).status ?? null;
  } catch {
    return null;
  }
}

export async function enqueueWebhook(env: Env, message: DeliveryMessage): Promise<void> {
  const queue = env.QUEUE;
  if (!queue) throw new Error("QUEUE binding is not configured");
  const { payload, ...rest } = message;
  const direct: DeliveryMessage = { ...rest, payload };
  if (JSON.stringify(direct).length <= MAX_QUEUE_MESSAGE_BYTES) {
    await queue.send(direct);
    return;
  }
  const bucket = env.PAYLOAD;
  if (bucket) {
    const store = r2PayloadStore(env);
    const key = await store.put(JSON.stringify(payload ?? {}), PAYLOAD_KV_TTL_SECONDS);
    await queue.send({ ...rest, payloadRef: key, payloadRefType: "r2" });
    return;
  }
  const payloadRef = payloadKey(message.provider, message.groupId, message.deliveryId);
  await env.KV.put(payloadRef, JSON.stringify(payload ?? {}), {
    expirationTtl: PAYLOAD_KV_TTL_SECONDS,
  });
  await queue.send({ ...rest, payloadRef, payloadRefType: "kv" });
}

export async function resolvePayload(
  env: Env,
  message: DeliveryMessage,
): Promise<Record<string, unknown>> {
  if (message.payload) return message.payload;
  if (message.payloadRef) {
    if (message.payloadRefType === "r2" && env.PAYLOAD) {
      const store = r2PayloadStore(env);
      const raw = await store.get(message.payloadRef);
      if (raw) {
        try {
          return JSON.parse(raw) as Record<string, unknown>;
        } catch {
          return {};
        }
      }
    }
    const raw = await env.KV.get(message.payloadRef);
    if (raw) {
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
  }
  return {};
}

export async function discardPayload(env: Env, message: DeliveryMessage): Promise<void> {
  if (!message.payloadRef) return;
  if (message.payloadRefType === "r2" && env.PAYLOAD) {
    const store = r2PayloadStore(env);
    await store.delete(message.payloadRef);
    return;
  }
  await env.KV.delete(message.payloadRef);
}
