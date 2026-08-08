import { describe, it, expect } from "bun:test";
import { recordSend, getSendLog } from "../lib/send-log";

function createMockDB(): D1Database {
  const rows: Array<Record<string, unknown>> = [];
  const insertCols = [
    "ts",
    "route_id",
    "group_id",
    "event",
    "repo",
    "target",
    "ok",
    "error",
    "status",
    "message_id",
    "delivery_id",
    "platform",
    "actor",
    "action",
    "duration_ms",
    "error_code",
    "attempts",
    "detail",
  ];
  return {
    prepare: (sql: string) => ({
      bind: (..._args: unknown[]) => ({
        run: async (): Promise<{ success: boolean }> => {
          if (sql.startsWith("INSERT")) {
            const row: Record<string, unknown> = {};
            insertCols.forEach((col, i) => {
              row[col] = _args[i];
            });
            rows.push(row);
          }
          return { success: true };
        },
        all: async (): Promise<{ results: Array<Record<string, unknown>> }> => {
          const args = _args as unknown[];
          const limit = (args[0] as number) ?? 50;
          return {
            results: rows
              .slice()
              .sort((a, b) => (b.ts as number) - (a.ts as number))
              .slice(0, limit),
          };
        },
      }),
    }),
  } as unknown as D1Database;
}

describe("send-log", () => {
  it("records and returns logs sorted newest first", async () => {
    const db = createMockDB();
    await recordSend(db, { ts: 1000, routeId: "a", event: "push", target: "111", ok: true });
    await recordSend(db, {
      ts: 2000,
      routeId: "b",
      event: "issues",
      target: "222",
      ok: false,
      error: "Missing Permissions",
    });
    const logs = await getSendLog(db);
    expect(logs).toHaveLength(2);
    expect(logs[0]!.routeId).toBe("b");
    expect(logs[0]!.ok).toBe(false);
    expect(logs[0]!.error).toBe("Missing Permissions");
    expect(logs[1]!.routeId).toBe("a");
  });

  it("returns empty when no logs", async () => {
    const db = createMockDB();
    expect(await getSendLog(db)).toEqual([]);
  });
});
