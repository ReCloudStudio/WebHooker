import type { Group, Route } from "../types";
import { log } from "../lib/log";

export interface ConfigStore {
  loadRoutes(): Promise<Route[]>;
  saveRoutes(routes: Route[]): Promise<void>;
  loadGroups(): Promise<Group[]>;
  saveGroups(groups: Group[]): Promise<void>;
  invalidateCache(): void;
}

interface D1GroupRow {
  id: string;
  name: string;
  data: string;
  version: number;
}

interface D1RouteRow {
  id: string;
  group_id: string;
  name: string;
  enabled: number;
  filters: string;
  targets: string;
  stop: number;
  fallback: number;
  discord_role_ids: string | null;
  ast: string | null;
}

const CACHE_TTL = 300_000;
const KV_ROUTES_KEY = "config:routes";
const KV_GROUPS_KEY = "config:groups";

const KV_CACHE_TTL = 3600;

export function d1ConfigStore(db: D1Database, kv: KVNamespace): ConfigStore {
  let routesCache: { routes: Route[]; expiresAt: number } | null = null;
  let groupsCache: { groups: Group[]; expiresAt: number } | null = null;

  async function loadRoutesFromD1(): Promise<Route[]> {
    const stmt = db.prepare(
      "SELECT id, group_id, name, enabled, filters, targets, stop, fallback, discord_role_ids, ast FROM d1_routes ORDER BY id",
    );
    if (typeof stmt.all !== "function") return [];
    const { results } = await stmt.all<D1RouteRow>();
    if (!results || results.length === 0) return [];
    return results.map((r) => ({
      id: r.id,
      groupId: r.group_id,
      name: r.name,
      enabled: r.enabled === 1,
      filters: JSON.parse(r.filters),
      targets: JSON.parse(r.targets),
      stop: r.stop === 1,
      fallback: r.fallback === 1,
      discordRoleIds: r.discord_role_ids ? JSON.parse(r.discord_role_ids) : undefined,
      ast: r.ast ? JSON.parse(r.ast) : undefined,
    }));
  }

  async function loadGroupsFromD1(): Promise<Group[]> {
    const stmt = db.prepare("SELECT id, name, data, version FROM d1_groups ORDER BY id");
    if (typeof stmt.all !== "function") return [];
    const { results } = await stmt.all<D1GroupRow>();
    if (!results || results.length === 0) return [];
    return results.map((r) => JSON.parse(r.data) as Group);
  }

  async function loadRoutesFromKV(): Promise<Route[]> {
    try {
      const raw = await kv.get<Route[]>(KV_ROUTES_KEY, "json");
      if (raw) return raw;
    } catch (err) {
      log.warn({ err }, "Failed to load routes from KV");
    }
    return [];
  }

  async function loadGroupsFromKV(): Promise<Group[]> {
    try {
      const raw = await kv.get<Group[]>(KV_GROUPS_KEY, "json");
      if (raw) return raw;
    } catch (err) {
      log.warn({ err }, "Failed to load groups from KV");
    }
    return [];
  }

  function routeStatements(routes: Route[]): D1PreparedStatement[] {
    const now = Date.now();
    return [
      db.prepare("DELETE FROM d1_routes"),
      ...routes.map((r) =>
        db
          .prepare(
            `INSERT INTO d1_routes (id, group_id, name, enabled, filters, targets, stop, fallback, discord_role_ids, ast, version, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          )
          .bind(
            r.id,
            r.groupId ?? "",
            r.name,
            r.enabled ? 1 : 0,
            JSON.stringify(r.filters),
            JSON.stringify(r.targets),
            r.stop ? 1 : 0,
            r.fallback ? 1 : 0,
            r.discordRoleIds ? JSON.stringify(r.discordRoleIds) : null,
            r.ast ? JSON.stringify(r.ast) : null,
            now,
            now,
          ),
      ),
    ];
  }

  function groupStatements(groups: Group[]): D1PreparedStatement[] {
    const now = Date.now();
    return [
      db.prepare("DELETE FROM d1_groups"),
      ...groups.map((g) =>
        db
          .prepare(
            `INSERT INTO d1_groups (id, name, data, version, created_at, updated_at)
             VALUES (?, ?, ?, 1, ?, ?)`,
          )
          .bind(g.id, g.name, JSON.stringify(g), now, now),
      ),
    ];
  }

  async function seedRoutesToD1(routes: Route[]): Promise<void> {
    if (routes.length === 0) return;
    await db.batch(routeStatements(routes));
  }

  async function seedGroupsToD1(groups: Group[]): Promise<void> {
    if (groups.length === 0) return;
    await db.batch(groupStatements(groups));
  }

  async function syncRoutesToKV(routes: Route[], ttl: number): Promise<void> {
    try {
      await kv.put(KV_ROUTES_KEY, JSON.stringify(routes), { expirationTtl: ttl });
    } catch (err) {
      log.warn({ err }, "Failed to sync routes to KV cache");
    }
  }

  async function syncGroupsToKV(groups: Group[], ttl: number): Promise<void> {
    try {
      await kv.put(KV_GROUPS_KEY, JSON.stringify(groups), { expirationTtl: ttl });
    } catch (err) {
      log.warn({ err }, "Failed to sync groups to KV cache");
    }
  }

  return {
    async loadRoutes(): Promise<Route[]> {
      if (routesCache && Date.now() < routesCache.expiresAt) {
        return routesCache.routes;
      }

      let routes: Route[] = [];
      try {
        routes = await loadRoutesFromD1();
        if (routes.length > 0) {
          syncRoutesToKV(routes, KV_CACHE_TTL).catch(() => undefined);
        } else {
          routes = await loadRoutesFromKV();
          if (routes.length > 0) {
            seedRoutesToD1(routes).catch((err) =>
              log.warn({ err }, "Failed to seed routes from KV to D1"),
            );
          }
        }
      } catch (err) {
        log.warn({ err }, "D1 routes unavailable, falling back to KV");
        routes = await loadRoutesFromKV();
      }

      routesCache = { routes, expiresAt: Date.now() + CACHE_TTL };
      return routes;
    },

    async saveRoutes(routes: Route[]): Promise<void> {
      try {
        await db.batch(routeStatements(routes));
        await syncRoutesToKV(routes, KV_CACHE_TTL);
      } catch (err) {
        log.warn({ err }, "D1 routes unavailable, falling back to KV");
        await syncRoutesToKV(routes, 0);
      }
      routesCache = null;
    },

    async loadGroups(): Promise<Group[]> {
      if (groupsCache && Date.now() < groupsCache.expiresAt) {
        return groupsCache.groups;
      }

      let groups: Group[] = [];
      try {
        groups = await loadGroupsFromD1();
        if (groups.length > 0) {
          syncGroupsToKV(groups, KV_CACHE_TTL).catch(() => undefined);
        } else {
          groups = await loadGroupsFromKV();
          if (groups.length > 0) {
            seedGroupsToD1(groups).catch((err) =>
              log.warn({ err }, "Failed to seed groups from KV to D1"),
            );
          }
        }
      } catch (err) {
        log.warn({ err }, "D1 groups unavailable, falling back to KV");
        groups = await loadGroupsFromKV();
      }

      groupsCache = { groups, expiresAt: Date.now() + CACHE_TTL };
      return groups;
    },

    async saveGroups(groups: Group[]): Promise<void> {
      try {
        await db.batch(groupStatements(groups));
        await syncGroupsToKV(groups, KV_CACHE_TTL);
      } catch (err) {
        log.warn({ err }, "D1 groups unavailable, falling back to KV");
        await syncGroupsToKV(groups, 0);
      }
      groupsCache = null;
    },

    invalidateCache(): void {
      routesCache = null;
      groupsCache = null;
    },
  };
}
