import type { Env, Config, Route } from "./types";
import { log } from "./lib/log";
import { migrateRoutes, validateRoutes } from "./config/schema";

const CONFIG_CACHE_TTL = 300_000;
const ROUTES_KEY = "config:routes";
let configCache: { config: Config; expiresAt: number } | null = null;

export async function loadRoutes(kv: KVNamespace): Promise<Route[]> {
  try {
    const stored = await kv.get<Route[]>(ROUTES_KEY, "json");
    if (stored) return validateRoutes(migrateRoutes(stored));
  } catch (err) {
    log.warn({ err }, "Failed to load routes from KV");
  }
  return [];
}

export async function saveRoutes(kv: KVNamespace, routes: Route[]): Promise<void> {
  await kv.put(ROUTES_KEY, JSON.stringify(routes));
  configCache = null;
}

/** Drop the in-memory route/config cache (used by the admin API and tests). */
export function invalidateConfigCache(): void {
  configCache = null;
}

export async function loadConfig(env: Env): Promise<Config> {
  if (configCache && Date.now() < configCache.expiresAt) {
    return configCache.config;
  }

  const routes = await loadRoutes(env.KV);

  const config: Config = {
    baseUrl: env.BASE_URL ?? "https://webhooker.example.workers.dev",
    github: {
      webhookSecret: env.GITHUB_WEBHOOK_SECRET,
      appId: Number(env.GITHUB_APP_ID ?? 0),
      privateKey: env.GITHUB_PRIVATE_KEY ?? "",
      clientId: env.GITHUB_CLIENT_ID ?? "",
      clientSecret: env.GITHUB_CLIENT_SECRET ?? "",
    },
    discord: {
      token: env.DISCORD_TOKEN ?? "",
    },
    routes,
  };

  configCache = { config, expiresAt: Date.now() + CONFIG_CACHE_TTL };
  return config;
}
