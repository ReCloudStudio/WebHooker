import { describe, it, expect } from "bun:test";
import {
  normalizeGroupMembers,
  memberRole,
  resolveScope,
  roleAt,
  roleAtLeast,
  canEditRoutes,
  canEditGroup,
} from "../web/groups";
import type { Env, Group } from "../types";

function env(overrides: Partial<Env> = {}): Env {
  return { GITHUB_WEBHOOK_SECRET: "s", KV: {} as KVNamespace, ...overrides };
}

const legacy: Group = { id: "g1", name: "Legacy", adminIds: ["octocat", "12345"] };
const mixed: Group = {
  id: "g2",
  name: "Mixed",
  adminIds: ["octocat"],
  members: [
    { login: "octocat", role: "owner" },
    { login: "admin-bot", role: "admin" },
    { login: "Reader", role: "viewer" },
  ],
};

describe("normalizeGroupMembers", () => {
  it("derives owners from legacy adminIds", () => {
    expect(normalizeGroupMembers(legacy)).toEqual([
      { login: "octocat", role: "owner" },
      { login: "12345", role: "owner" },
    ]);
  });

  it("keeps members when present and validates roles", () => {
    expect(normalizeGroupMembers(mixed)).toEqual([
      { login: "octocat", role: "owner" },
      { login: "admin-bot", role: "admin" },
      { login: "Reader", role: "viewer" },
    ]);
  });

  it("deduplicates case-insensitively", () => {
    const g: Group = {
      id: "g",
      name: "G",
      adminIds: [],
      members: [
        { login: "Dup", role: "admin" },
        { login: "dup", role: "owner" },
      ],
    };
    expect(normalizeGroupMembers(g)).toEqual([{ login: "Dup", role: "admin" }]);
  });

  it("falls back to owner for unknown roles", () => {
    const g: Group = {
      id: "g",
      name: "G",
      adminIds: [],
      members: [{ login: "x", role: "sneaky" as never }],
    };
    expect(normalizeGroupMembers(g)[0]!.role).toBe("owner");
  });
});

describe("memberRole / resolveScope roles", () => {
  it("resolves owner for legacy admins", () => {
    expect(memberRole(legacy, "999", "octocat")).toBe("owner");
    expect(memberRole(legacy, "12345", "other")).toBe("owner");
  });

  it("resolves admin/viewer for members", () => {
    expect(memberRole(mixed, "1", "admin-bot")).toBe("admin");
    expect(memberRole(mixed, "1", "reader")).toBe("viewer");
  });

  it("returns undefined for non-members", () => {
    expect(memberRole(mixed, "1", "nobody")).toBeUndefined();
  });

  it("super admins get owner everywhere", () => {
    const scope = resolveScope(env({ ADMIN_USER_IDS: "1" }), [legacy, mixed], "1", "boss");
    expect(scope.isSuper).toBe(true);
    expect(roleAt(scope, "g1")).toBe("owner");
    expect(roleAt(scope, "nope")).toBe("owner");
  });

  it("regular users only see groups they belong to, with their role", () => {
    const scope = resolveScope(env(), [legacy, mixed], "5", "admin-bot");
    expect(scope.groupIds.has("g1")).toBe(false);
    expect(scope.groupIds.has("g2")).toBe(true);
    expect(roleAt(scope, "g2")).toBe("admin");
  });
});

describe("role helpers", () => {
  it("ranks viewer < admin < owner", () => {
    expect(roleAtLeast("viewer", "viewer")).toBe(true);
    expect(roleAtLeast("admin", "viewer")).toBe(true);
    expect(roleAtLeast("admin", "owner")).toBe(false);
    expect(roleAtLeast(undefined, "viewer")).toBe(false);
  });

  it("canEditRoutes allows owner and admin", () => {
    const scope = resolveScope(env(), [mixed], "1", "reader");
    expect(canEditRoutes(scope, "g2")).toBe(false);
    expect(canEditGroup(scope, "g2")).toBe(false);
    const scope2 = resolveScope(env(), [mixed], "1", "admin-bot");
    expect(canEditRoutes(scope2, "g2")).toBe(true);
    expect(canEditGroup(scope2, "g2")).toBe(false);
    const scope3 = resolveScope(env(), [mixed], "1", "octocat");
    expect(canEditRoutes(scope3, "g2")).toBe(true);
    expect(canEditGroup(scope3, "g2")).toBe(true);
  });
});
