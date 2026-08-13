import { Hono } from "hono";
import type { Env } from "./types";
import { handleWebhook } from "./webhook";
import { handleInteractionRequest } from "./drivers/discord/interactions";
import { handleTelegramWebhookRequest } from "./drivers/telegram/updates";
import { createOAuthRoutes } from "./web/oauth-routes";
import { createActionRoutes } from "./web/action-routes";
import { createAdminRoutes } from "./web/admin-routes";
import { createLegalRoutes } from "./web/legal-routes";
import { createHomeRoutes } from "./web/home-routes";
import { createRichHeaderRoutes } from "./web/richheader-routes";

export function createServer(): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.route("/auth", createOAuthRoutes());
  app.route("/", createActionRoutes());
  app.route("/", createLegalRoutes());
  app.route("/", createHomeRoutes());
  app.route("/admin", createAdminRoutes());
  app.route("/api", createRichHeaderRoutes());

  app.post("/webhook", (c) => handleWebhook(c));
  app.post("/webhook/:groupId", (c) => handleWebhook(c, c.req.param("groupId")));

  app.post("/discord/interactions", (c) => handleInteractionRequest(c.req.raw, c.env));
  app.post("/telegram/webhook", (c) => handleTelegramWebhookRequest(c.req.raw, c.env));

  app.notFound((c) => {
    if (c.env.ASSETS) {
      // The console SPA (and its _nuxt chunks) lives under /admin; the worker
      // already owns /admin/api, /admin/login|logout|invite. Serve the SPA
      // only for admin-scoped paths — every other unknown URL is a plain 404
      // instead of being swallowed into the console.
      const pathname = new URL(c.req.url).pathname;
      if (
        pathname === "/admin" ||
        pathname.startsWith("/admin/") ||
        pathname.startsWith("/_nuxt/")
      ) {
        return c.env.ASSETS.fetch(c.req.raw);
      }
    }
    return c.json({ error: "Not found" }, 404);
  });

  return app;
}
