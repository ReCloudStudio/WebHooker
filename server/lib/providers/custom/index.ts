import type { Env, WebhookEvent } from "../../types";
import type { Provider } from "../types";
import { hmacSha256Hex, timingSafeEqual } from "../hmac";
import { verifySignature } from "../github/verify";

const REPLAY_WINDOW_SECONDS = 300;
const NONCE_TTL_SECONDS = 600;

function parseTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Replay protection for `custom` webhooks: the sender adds `X-WebHooker-Timestamp`
 * (Unix seconds) and `X-WebHooker-Nonce` and signs
 * `timestamp + "." + nonce + "." + body` instead of the bare body. We reject
 * timestamps outside a ±5min window and reject any nonce already seen (nonces
 * live in KV for 10min). Senders without those headers keep the legacy
 * body-only signature so existing integrations continue to work.
 */
async function verifyReplayProtected(
  body: string,
  headers: Record<string, string>,
  secret: string,
  kv: KVNamespace,
): Promise<boolean> {
  const timestamp = parseTimestamp(headers["x-webhooker-timestamp"]);
  const nonce = headers["x-webhooker-nonce"];
  const signature = headers["x-webhooker-signature"];
  if (timestamp == null || !nonce || !secret) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > REPLAY_WINDOW_SECONDS) return false;

  const expected = `sha256=${await hmacSha256Hex(secret, `${timestamp}.${nonce}.${body}`)}`;
  if (!timingSafeEqual(signature ?? "", expected)) return false;

  const nonceKey = `nonce:${nonce}`;
  const seen = await kv.get(nonceKey);
  if (seen !== null && seen !== undefined) return false;
  await kv.put(nonceKey, "1", { expirationTtl: NONCE_TTL_SECONDS });
  return true;
}

/**
 * Custom webhook provider: accepts arbitrary JSON posts (monitoring, CI,
 * scripts, ...) that are not signed by a forge. The sender signs the payload
 * with the tenant's secret using the GitHub-style `sha256=<hex>` HMAC header
 * `X-WebHooker-Signature`, optionally adding replay-protection headers (see
 * `verifyReplayProtected`). Payloads become `custom` events that flow through
 * the normal route matching pipeline (a route with `event: custom`).
 */
export const customProvider: Provider = {
  id: "custom",

  matches(headers) {
    return (
      headers["x-github-event"] === undefined &&
      headers["x-gitea-event"] === undefined &&
      headers["x-webhooker-signature"] !== undefined
    );
  },

  async verify(body, headers, env: Env) {
    // The tenant webhook handler overrides GITHUB_WEBHOOK_SECRET with the
    // group's secret; on the legacy global endpoint this falls back to the
    // operator's global secret.
    const secret = env.GITHUB_WEBHOOK_SECRET;
    if (
      headers["x-webhooker-timestamp"] !== undefined &&
      headers["x-webhooker-nonce"] !== undefined
    ) {
      return verifyReplayProtected(body, headers, secret, env.KV);
    }
    return verifySignature(body, headers["x-webhooker-signature"], secret);
  },

  parse(body, _headers): WebhookEvent | null {
    try {
      const payload = JSON.parse(body) as Record<string, unknown>;
      if (!payload || typeof payload !== "object") return null;
      // Optional id for sender-side dedup (retries from monitoring systems).
      const deliveryId =
        typeof payload.deliveryId === "string" && payload.deliveryId
          ? payload.deliveryId
          : undefined;
      return { event: "custom", provider: "custom", payload, deliveryId };
    } catch {
      return null;
    }
  },
};
