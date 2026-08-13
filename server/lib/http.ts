import type { H3Event } from "h3";
import { setResponseStatus } from "h3";

/**
 * Map a thrown h3 error to the API's legacy JSON contract
 * (`{ error: string }` with the proper status code).
 */
export function toApiError(event: H3Event, err: unknown): { error: string } {
  const e = err as { statusCode?: number; statusMessage?: string; message?: string };
  setResponseStatus(event, e.statusCode ?? 500);
  return { error: e.statusMessage ?? e.message ?? "Internal Server Error" };
}

/**
 * Wrap an API handler so thrown h3 errors (401/403/400/...) become
 * `{ error }` JSON responses instead of the default HTML error page.
 */
export function wrapApi<Args extends unknown[]>(
  fn: (event: H3Event, ...args: Args) => Promise<unknown>,
): (event: H3Event, ...args: Args) => Promise<unknown> {
  return async (event, ...args) => {
    try {
      return await fn(event, ...args);
    } catch (err) {
      return toApiError(event, err);
    }
  };
}
