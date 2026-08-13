import defaultNitroErrorHandler, { defineNitroErrorHandler } from "nitropack/runtime/error";
import { setResponseStatus } from "h3";

/**
 * Keep the legacy API error contract (`{ error: string }` JSON) for the
 * machine-facing endpoints; everything else (pages) uses the default handler.
 */
export default defineNitroErrorHandler((error, event) => {
  const path = event.path ?? "";
  if (
    path.startsWith("/admin/api/") ||
    path.startsWith("/api/") ||
    path.startsWith("/auth/") ||
    path.startsWith("/webhook")
  ) {
    setResponseStatus(event, error.statusCode || 500);
    return { error: error.statusMessage || error.message || "Internal Server Error" };
  }
  return defaultNitroErrorHandler(error, event);
});
