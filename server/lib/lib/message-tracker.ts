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
