import type { H3Event } from "h3";
import type { Env } from "./types";

/**
 * Cloudflare bindings (KV, D1, secrets) from the request context. Works on
 * Cloudflare Workers (fetch and scheduled) and in tests that stub
 * `event.context.cloudflare`. Throws with a clear message in other runtimes.
 */
export function cfEnv(event: H3Event): Env {
  const env = (event.context.cloudflare as { env?: Env } | undefined)?.env;
  if (!env) {
    throw new Error("Cloudflare bindings unavailable — run via wrangler dev/deploy");
  }
  return env;
}

/** `waitUntil` from the CF execution context (no-op outside workers). */
export function cfWaitUntil(event: H3Event): (promise: Promise<unknown>) => void {
  const cloudflare = event.context.cloudflare as
    | {
        ctx?: { waitUntil?: (p: Promise<unknown>) => void };
        context?: { waitUntil?: (p: Promise<unknown>) => void };
      }
    | undefined;
  const waitUntil =
    (event.context.waitUntil as ((p: Promise<unknown>) => void) | undefined) ??
    cloudflare?.context?.waitUntil ??
    cloudflare?.ctx?.waitUntil;
  return waitUntil ? waitUntil.bind(event.context) : () => undefined;
}

/** Lowercased request headers (the provider detection reads lowercase keys). */
export function headersFrom(event: H3Event): Record<string, string> {
  const out: Record<string, string> = {};
  event.headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}
