import { describe, it, expect } from "bun:test";
import { recordSendBatch } from "../server/lib/lib/send-log-batch";
import type { SendRecord } from "../server/lib/lib/send-log";

interface BoundStmt {
  sql: string;
  args: unknown[];
}

function createMockDB(): { db: D1Database; rows: Array<Record<string, unknown>> } {
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
  const db = {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]): BoundStmt => ({ sql, args }),
      run: async (): Promise<{ success: boolean }> => ({ success: true }),
      all: async (): Promise<{ results: Array<Record<string, unknown>> }> => ({
        results: rows,
      }),
    }),
    batch: async (stmts: BoundStmt[]): Promise<unknown[]> => {
      for (const s of stmts) {
        if (s.sql.startsWith("INSERT")) {
          const row: Record<string, unknown> = {};
          insertCols.forEach((col, i) => {
            row[col] = s.args[i];
          });
          rows.push(row);
        }
      }
      return [];
    },
  } as unknown as D1Database;
  return { db, rows };
}

function record(overrides: Partial<SendRecord> = {}): SendRecord {
  return {
    ts: 1234,
    routeId: "r1",
    event: "push",
    target: "111",
    ok: true,
    ...overrides,
  };
}

describe("recordSendBatch", () => {
  it("is a no-op for an empty list", async () => {
    const { db } = createMockDB();
    await expect(recordSendBatch(db, [])).resolves.toBeUndefined();
  });

  it("batches multiple inserts in a single db.batch call", async () => {
    const { db, rows } = createMockDB();
    await recordSendBatch(db, [
      record({ routeId: "a", ok: true }),
      record({ routeId: "b", ok: false, error: "boom", groupId: "g1" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].route_id).toBe("a");
    expect(rows[1].route_id).toBe("b");
    expect(rows[1].group_id).toBe("g1");
    expect(rows[1].ok).toBe(0);
    expect(rows[1].error).toBe("boom");
  });

  it("serializes detail and encodes ok/error", async () => {
    const { db, rows } = createMockDB();
    await recordSendBatch(db, [record({ detail: { a: 1 }, ok: false, error: "x", status: 500 })]);
    expect(rows[0].detail).toBe('{"a":1}');
    expect(rows[0].ok).toBe(0);
    expect(rows[0].status).toBe(500);
  });

  it("swallows database errors", async () => {
    const db = {
      prepare: (): { bind: () => BoundStmt } => ({
        bind: (): BoundStmt => {
          throw new Error("nope");
        },
      }),
      batch: async (): Promise<unknown[]> => {
        throw new Error("batch failed");
      },
    } as unknown as D1Database;
    await expect(recordSendBatch(db, [record()])).resolves.toBeUndefined();
  });
});
