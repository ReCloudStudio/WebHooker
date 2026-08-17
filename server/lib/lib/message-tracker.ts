import { canUseD1 } from "../storage/d1";

export interface MessageTracker {
  get(eventId: string, targetId: string): Promise<string | null>;
  set(eventId: string, targetId: string, messageId: string): Promise<void>;
  delete(eventId: string, targetId: string): Promise<void>;
}

const MESSAGE_KEY_TTL_SECONDS = 86400;

export function kvMessageTracker(kv: KVNamespace): MessageTracker {
  const key = (eventId: string, targetId: string): string => `msg:${eventId}:${targetId}`;
  return {
    async get(eventId: string, targetId: string): Promise<string | null> {
      return kv.get(key(eventId, targetId));
    },
    async set(eventId: string, targetId: string, messageId: string): Promise<void> {
      await kv.put(key(eventId, targetId), messageId, {
        expirationTtl: MESSAGE_KEY_TTL_SECONDS,
      });
    },
    async delete(eventId: string, targetId: string): Promise<void> {
      await kv.delete(key(eventId, targetId));
    },
  };
}

export function d1MessageTracker(db: D1Database): MessageTracker {
  return {
    async get(eventId: string, targetId: string): Promise<string | null> {
      const row = await db
        .prepare("SELECT message_id FROM message_tracking WHERE event_id = ? AND target_id = ?")
        .bind(eventId, targetId)
        .first<{ message_id: string }>();
      return row?.message_id ?? null;
    },
    async set(eventId: string, targetId: string, messageId: string): Promise<void> {
      await db
        .prepare(
          `INSERT INTO message_tracking (event_id, target_id, message_id, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(event_id, target_id) DO UPDATE SET
             message_id = excluded.message_id, updated_at = excluded.updated_at`,
        )
        .bind(eventId, targetId, messageId, Date.now())
        .run();
    },
    async delete(eventId: string, targetId: string): Promise<void> {
      await db
        .prepare("DELETE FROM message_tracking WHERE event_id = ? AND target_id = ?")
        .bind(eventId, targetId)
        .run();
    },
  };
}

export function messageTracker(db: D1Database, kv: KVNamespace): MessageTracker {
  return canUseD1(db) ? d1MessageTracker(db) : kvMessageTracker(kv);
}