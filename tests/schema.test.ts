import { describe, expect, test } from "bun:test";
import * as v from "valibot";
import type { Group, Route } from "../server/lib/types";
import {
  CONFIG_SCHEMA_VERSION,
  filterSchema,
  routeSchema,
  groupSchema,
  migrateRoutes,
  migrateGroups,
  validateRoutes,
  validateGroups,
  explainRoute,
} from "../server/lib/config/schema";

const validRoute: Route = {
  id: "r1",
  name: "build",
  enabled: true,
  filters: [{ type: "event", match: "push" }],
  targets: [{ platform: "discord", channelId: "c1" }],
};

describe("config schema", () => {
  test("version is defined", () => {
    expect(CONFIG_SCHEMA_VERSION).toBe(1);
  });

  test("filterSchema accepts valid filter", () => {
    expect(v.safeParse(filterSchema, { type: "repo", match: "a/*" }).success).toBe(true);
  });

  test("filterSchema rejects bad type", () => {
    expect(v.safeParse(filterSchema, { type: "wat", match: "a" }).success).toBe(false);
  });

  test("routeSchema accepts valid route", () => {
    expect(v.safeParse(routeSchema, validRoute).success).toBe(true);
  });

  test("routeSchema accepts ast filter node", () => {
    const route = {
      ...validRoute,
      ast: { any: [{ type: "event" as const, match: "push" }] },
    };
    expect(v.safeParse(routeSchema, route).success).toBe(true);
  });

  test("routeSchema rejects missing enabled", () => {
    const { enabled: _e, ...rest } = validRoute;
    expect(v.safeParse(routeSchema, rest).success).toBe(false);
  });

  test("groupSchema accepts valid group", () => {
    const group: Group = { id: "g1", name: "team", adminIds: ["a"] };
    expect(v.safeParse(groupSchema, group).success).toBe(true);
  });

  test("groupSchema rejects bad role", () => {
    const group: Group = {
      id: "g1",
      name: "team",
      adminIds: [],
      members: [{ login: "a", role: "super" as never }],
    };
    expect(v.safeParse(groupSchema, group).success).toBe(false);
  });
});

describe("migrations", () => {
  test("migrateRoutes converts legacy target to targets", () => {
    const legacy = { id: "r1", name: "x", enabled: true, filters: [], target: { channelId: "c1" } };
    const out = migrateRoutes([legacy as unknown as Route]);
    expect(out[0].targets).toEqual([{ channelId: "c1" }]);
  });

  test("migrateRoutes leaves targets array untouched", () => {
    const out = migrateRoutes([validRoute]);
    expect(out[0]).toEqual(validRoute);
  });

  test("migrateGroups is a no-op", () => {
    const groups: Group[] = [{ id: "g1", name: "team", adminIds: ["a"] }];
    expect(migrateGroups(groups)).toEqual(groups);
  });
});

describe("validation is non-destructive", () => {
  test("validateRoutes returns all entries even when invalid", () => {
    const routes = [validRoute, { id: "bad", name: "x", filters: [] } as unknown as Route];
    const out = validateRoutes(routes);
    expect(out).toHaveLength(2);
  });

  test("validateGroups returns all entries even when invalid", () => {
    const groups = [
      { id: "g1", name: "team", adminIds: ["a"] },
      { id: "bad", name: "x" } as unknown as Group,
    ];
    expect(validateGroups(groups)).toHaveLength(2);
  });
});

describe("explainRoute", () => {
  test("explains filters", () => {
    expect(explainRoute(validRoute)).toBe('build: (event is "push")');
  });

  test("explains ast", () => {
    const route = {
      ...validRoute,
      ast: { any: [{ type: "event" as const, match: "push" }] },
    };
    expect(explainRoute(route)).toBe('build: (event is "push")');
  });
});
