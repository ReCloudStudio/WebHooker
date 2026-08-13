import type { Env, WebhookEvent } from "../../types";
import type { Provider } from "../types";
import { verifySignature } from "../github/verify";

/**
 * Custom webhook provider: accepts arbitrary JSON posts (monitoring, CI,
 * scripts, ...) that are not signed by a forge. The sender signs the raw body
 * with the tenant's secret using the GitHub-style `sha256=<hex>` HMAC header
 * `X-WebHooker-Signature`. Payloads become `custom` events that flow through
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
    return verifySignature(body, headers["x-webhooker-signature"], env.GITHUB_WEBHOOK_SECRET);
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
