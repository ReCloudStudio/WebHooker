import type { FilterNode } from "./types";
import { log } from "./lib/log";

export interface NamedFragment {
  id: string;
  groupId?: string;
  name: string;
  node: FilterNode;
}

interface D1FragmentRow {
  id: string;
  group_id: string;
  name: string;
  node: string;
}

export async function loadFragments(db: D1Database): Promise<NamedFragment[]> {
  try {
    const stmt = db.prepare("SELECT id, group_id, name, node FROM d1_fragments ORDER BY id");
    if (typeof stmt.all !== "function") return [];
    const { results } = await stmt.all<D1FragmentRow>();
    if (!results || results.length === 0) return [];
    return results.map((r) => ({
      id: r.id,
      groupId: r.group_id || undefined,
      name: r.name,
      node: JSON.parse(r.node) as FilterNode,
    }));
  } catch (err) {
    log.warn({ err }, "Failed to load fragments from D1");
    return [];
  }
}

export async function saveFragments(db: D1Database, fragments: NamedFragment[]): Promise<void> {
  const now = Date.now();
  
  // Load existing fragments to determine what to delete
  const existing = await loadFragments(db);
  const existingKeys = new Set(existing.map((f) => `${f.id}:${f.groupId ?? ""}`));
  const newKeys = new Set(fragments.map((f) => `${f.id}:${f.groupId ?? ""}`));
  
  const statements: D1PreparedStatement[] = [];
  
  // Delete fragments that are no longer present
  for (const key of existingKeys) {
    if (!newKeys.has(key)) {
      const [id, groupId] = key.split(":");
      statements.push(
        db.prepare("DELETE FROM d1_fragments WHERE id = ? AND group_id = ?").bind(id, groupId)
      );
    }
  }
  
  // Upsert all fragments
  for (const f of fragments) {
    statements.push(
      db
        .prepare(
          `INSERT INTO d1_fragments (id, group_id, name, node, version, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)
           ON CONFLICT(id, group_id) DO UPDATE SET
             name = excluded.name,
             node = excluded.node,
             updated_at = excluded.updated_at`,
        )
        .bind(f.id, f.groupId ?? "", f.name, JSON.stringify(f.node), now, now),
    );
  }
  
  await db.batch(statements);
}
