import { describe, it, expect } from "bun:test";
import { d1ConfigStore, type ConfigStore } from "../server/lib/storage/config-store";
import type { Route, Group } from "../server/lib/types";

interface Stmt {
  bind: (...args: unknown[]) => Stmt;
  all: () => Promise<{ results: Array<Record<string, unknown>> }>;
}

interface FakeDB {
  prepare: (sql: string) => Stmt;
  batch: (stmts: Stmt[]) => Promise<unknown[]>;
}

function route(id: string, groupId: string, overrides: Partial<Route> = {}): Route {
  return {
    id,
    name: `route-${id}`,
    enabled: true,
    filters: [],
    targets: [],
    groupId,
    stop: false,
    fallback: false,
    ...overrides,
  };
}

function group(id: string): Group {
  return { id, name: `group-${id}`, adminIds: [] };
}

function createDB(): { db: FakeDB & D1Database; routesTable: Route[]; groupsTable: Group[] } {
  const routesTable: Route[] = [];
  const groupsTable: Group[] = [];
  const db: FakeDB = {
    prepare(sql: string): Stmt {
      let _bound: unknown[] = [];
      const stmt: Stmt = {
        bind(...args: unknown[]): Stmt {
          _bound = args;
          return stmt;
        },
        async all(): Promise<{ results: Array<Record<string, unknown>> }> {
          if (sql.includes("FROM d1_routes")) {
            return {
              results: routesTable.map((r) => ({
                id: r.id,
                group_id: r.groupId ?? "",
                name: r.name,
                enabled: r.enabled ? 1 : 0,
                filters: JSON.stringify(r.filters),
                targets: JSON.stringify(r.targets),
                stop: r.stop ? 1 : 0,
                fallback: r.fallback ? 1 : 0,
                discord_role_ids: r.discordRoleIds ? JSON.stringify(r.discordRoleIds) : null,
                ast: r.ast ? JSON.stringify(r.ast) : null,
              })),
            };
          }
          if (sql.includes("FROM d1_groups")) {
            return {
              results: groupsTable.map((g) => ({
                id: g.id,
                name: g.name,
                data: JSON.stringify(g),
                version: 1,
              })),
            };
          }
          return { results: [] };
        },
      };
      return stmt;
    },
    async batch(stmts: Stmt[]): Promise<unknown[]> {
      void stmts;
      return [];
    },
  };
  return { db: db as FakeDB & D1Database, routesTable, groupsTable };
}

function createKV(): { kv: KVNamespace; store: Map<string, string> } {
  const store = new Map<string, string>();
  const kv = {
    store,
    get: async <T>(key: string, type?: string): Promise<T | null> => {
      const v = store.get(key);
      if (v == null) return null;
      if (type === "json") return JSON.parse(v) as T;
      return v as unknown as T;
    },
    put: async (key: string, value: string): Promise<void> => {
      store.set(key, value);
    },
    delete: async (key: string): Promise<void> => {
      store.delete(key);
    },
    list: async (): Promise<{ keys: unknown[] }> => ({ keys: [] }),
  };
  return { kv: kv as unknown as KVNamespace, store };
}

describe("d1ConfigStore", () => {
  it("loads empty when D1 and KV are empty", async () => {
    const { db } = createDB();
    const { kv } = createKV();
    const store: ConfigStore = d1ConfigStore(db, kv);
    expect(await store.loadRoutes()).toEqual([]);
    expect(await store.loadGroups()).toEqual([]);
  });

  it("seeds routes from KV into memory when D1 is empty and caches in KV", async () => {
    const { db } = createDB();
    const { kv, store } = createKV();
    const existing = [route("r1", "g1")];
    store.set("config:routes", JSON.stringify(existing));
    const cfg: ConfigStore = d1ConfigStore(db, kv);
    const loaded = await cfg.loadRoutes();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("r1");
  });

  it("reads routes directly from D1 when populated", async () => {
    const { db, routesTable } = createDB();
    const { kv } = createKV();
    routesTable.push(route("r1", "g1"));
    const cfg: ConfigStore = d1ConfigStore(db, kv);
    const loaded = await cfg.loadRoutes();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("r1");
    expect(loaded[0].groupId).toBe("g1");
  });

  it("round-trips routes through D1 + KV cache on save", async () => {
    const { db, routesTable } = createDB();
    const { kv, store } = createKV();
    const cfg: ConfigStore = d1ConfigStore(db, kv);
    const routes = [route("r1", "g1"), route("r2", "g2")];
    await cfg.saveRoutes(routes);
    expect(routesTable).toHaveLength(0);
    const cached = store.get("config:routes");
    expect(cached).toBe(JSON.stringify(routes));
    const reloaded = await cfg.loadRoutes();
    expect(reloaded).toHaveLength(2);
  });

  it("round-trips groups through D1 + KV cache on save", async () => {
    const { db } = createDB();
    const { kv, store } = createKV();
    const cfg: ConfigStore = d1ConfigStore(db, kv);
    const groups = [group("g1"), group("g2")];
    await cfg.saveGroups(groups);
    expect(store.get("config:groups")).toBe(JSON.stringify(groups));
    const reloaded = await cfg.loadGroups();
    expect(reloaded).toHaveLength(2);
  });

  it("invalidateCache forces a reload", async () => {
    const { db, routesTable } = createDB();
    const { kv } = createKV();
    const cfg: ConfigStore = d1ConfigStore(db, kv);
    routesTable.push(route("r1", "g1"));
    const first = await cfg.loadRoutes();
    expect(first).toHaveLength(1);
    routesTable.push(route("r2", "g2"));
    const cached = await cfg.loadRoutes();
    expect(cached).toHaveLength(1);
    cfg.invalidateCache();
    const second = await cfg.loadRoutes();
    expect(second).toHaveLength(2);
  });
});