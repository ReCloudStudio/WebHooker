import { describe, it, expect, beforeEach } from "bun:test";
import { recordAudit, getAuditLog, pruneAuditLogs } from "../server/lib/lib/audit";

function createMockD1(): D1Database {
  let rows: Array<Record<string, unknown>> = [];
  let id = 1;

  function queryAll(sql: string, args: unknown[]): Array<Record<string, unknown>> {
    if (sql.startsWith("INSERT")) return [];
    let filtered = rows;
    if (sql.includes("group_id = ?")) {
      const gid = args[0] as string;
      filtered = rows.filter((r) => r.group_id === gid);
    }
    const limit = args[args.length - 1] as number;
    return [...filtered]
      .sort((a, b) => (b.ts as number) - (a.ts as number))
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        ts: r.ts ?? 0,
        actor_id: r.actor_id ?? null,
        actor_login: r.actor_login ?? null,
        action: r.action ?? "",
        target_type: r.target_type ?? null,
        target_id: r.target_id ?? null,
        group_id: r.group_id ?? null,
        detail: r.detail ?? null,
        ip: r.ip ?? null,
      }));
  }

  const db = {
    prepare: (sql: string): { bind: (args: unknown[]) => unknown } => ({
      bind: (...args: unknown[]) => ({
        run: async (): Promise<{ meta: { changes: number }; results?: unknown[] }> => {
          if (sql.startsWith("INSERT")) {
            const row: Record<string, unknown> = { id: id++ };
            for (const [key, value] of [
              ["ts", args[0]],
              ["actor_id", args[1]],
              ["actor_login", args[2]],
              ["action", args[3]],
              ["target_type", args[4]],
              ["target_id", args[5]],
              ["group_id", args[6]],
              ["detail", args[7]],
              ["ip", args[8]],
            ] as const) {
              if (value != null) row[key] = value;
            }
            rows.push(row);
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith("DELETE")) {
            const cutoff = args[0] as number;
            const before = rows.length;
            rows = rows.filter((r) => (r.ts as number) >= cutoff);
            return { meta: { changes: before - rows.length } };
          }
          return { meta: { changes: 0 }, results: queryAll(sql, args) };
        },
        all: async (): Promise<{ results: Array<Record<string, unknown>> }> => ({
          results: queryAll(sql, args),
        }),
      }),
    }),
  } as unknown as D1Database;
  return db;
}

describe("audit log", () => {
  let db: D1Database;

  beforeEach(() => {
    db = createMockD1();
  });

  it("records and loads entries newest-first", async () => {
    await recordAudit(db, {
      ts: 1000,
      actorId: "1",
      actorLogin: "a",
      action: "group.create",
      targetType: "group",
      targetId: "g1",
      groupId: "g1",
    });
    await recordAudit(db, {
      ts: 2000,
      actorId: "2",
      actorLogin: "b",
      action: "invite.create",
      groupId: "g2",
      detail: { role: "viewer" },
    });
    const entries = await getAuditLog(db, { limit: 10 });
    expect(entries).toHaveLength(2);
    expect(entries[0]!.action).toBe("invite.create");
    expect(entries[0]!.detail).toEqual({ role: "viewer" });
    expect(entries[1]!.actorLogin).toBe("a");
  });

  it("filters by group", async () => {
    await recordAudit(db, { ts: 1, actorLogin: "a", action: "x", groupId: "g1" });
    await recordAudit(db, { ts: 2, actorLogin: "b", action: "y", groupId: "g2" });
    const entries = await getAuditLog(db, { groupId: "g2" });
    expect(entries).toHaveLength(1);
    expect(entries[0]!.action).toBe("y");
  });

  it("prunes entries older than the retention window", async () => {
    const now = Date.now();
    await recordAudit(db, { ts: now - 100 * 86400_000, actorLogin: "a", action: "old" });
    await recordAudit(db, { ts: now, actorLogin: "b", action: "new" });
    const removed = await pruneAuditLogs(db, 90);
    expect(removed).toBe(1);
    expect(await getAuditLog(db)).toHaveLength(1);
  });

  it("never throws on write failures", async () => {
    const broken = {
      prepare: (): { bind: () => { run: () => Promise<unknown> } } => ({
        bind: () => ({
          run: async (): Promise<never> => {
            throw new Error("boom");
          },
        }),
      }),
    } as unknown as D1Database;
    await expect(recordAudit(broken, { ts: 1, action: "x" })).resolves.toBeUndefined();
  });
});
