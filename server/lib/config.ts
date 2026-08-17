import type { Env, Config, Route } from "./types";
import { log } from "./lib/log";
import { migrateRoutes, validateRoutes } from "./config/schema";
import { d1ConfigStore, type ConfigStore } from "./storage/config-store";

const CONFIG_CACHE_TTL = 300_000;
const ROUTES_KEY = "config:routes";
let configCache: { config: Config; expiresAt: number } | null = null;
const configStores = new WeakMap<KVNamespace, ConfigStore>();

export function getConfigStore(kv: KVNamespace): ConfigStore | null {
  return configStores.get(kv) ?? null;
}

export function initConfigStore(env: Env): ConfigStore {
  return ensureStore(env);
}

export function resetConfigStore(kv?: KVNamespace): void {
  if (kv) {
    configStores.get(kv)?.invalidateCache();
    configStores.delete(kv);
  }
}

function ensureStore(env: Env): ConfigStore {
  let store = configStores.get(env.KV);
  if (!store) {
    store = d1ConfigStore(env.DB, env.KV);
    configStores.set(env.KV, store);
  }
  return store;
}

export async function loadRoutes(kv: KVNamespace): Promise<Route[]> {
  const store = configStores.get(kv);
  if (store) return store.loadRoutes();

  try {
    const stored = await kv.get<Route[]>(ROUTES_KEY, "json");
    if (stored) return validateRoutes(migrateRoutes(stored));
  } catch (err) {
    log.warn({ err }, "Failed to load routes from KV");
  }
  return [];
}

export async function saveRoutes(kv: KVNamespace, routes: Route[]): Promise<void> {
  const store = configStores.get(kv);
  if (store) {
    await store.saveRoutes(routes);
    configCache = null;
    return;
  }
  await kv.put(ROUTES_KEY, JSON.stringify(routes));
  configCache = null;
}

export function invalidateConfigCache(): void {
  configCache = null;
}

export async function loadConfig(env: Env): Promise<Config> {
  if (configCache && Date.now() < configCache.expiresAt) {
    return configCache.config;
  }

  ensureStore(env);
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