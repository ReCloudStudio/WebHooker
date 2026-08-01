import { log } from "./log";

export interface SendRecord {
  ts: number;
  routeId: string;
  event: string;
  repo?: string;
  target: string;
  ok: boolean;
  error?: string;
}

const KEY_PREFIX = "logs:send:";
const RETENTION_TTL = 3600;
const MAX_READ = 200;

function randomHex(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function recordSend(kv: KVNamespace, record: SendRecord): Promise<void> {
  try {
    await kv.put(`${KEY_PREFIX}${record.ts}-${randomHex()}`, JSON.stringify(record), {
      expirationTtl: RETENTION_TTL,
    });
  } catch (err) {
    log.warn({ err }, "Failed to record send log");
  }
}

export async function getSendLog(kv: KVNamespace, limit = 50): Promise<SendRecord[]> {
  try {
    const list = await kv.list({ prefix: KEY_PREFIX, limit: MAX_READ });
    const records = await Promise.all(
      list.keys.map((k) => kv.get<SendRecord>(k.name, "json")),
    );
    return records
      .filter((r): r is SendRecord => r != null)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, limit);
  } catch (err) {
    log.warn({ err }, "Failed to load send log");
    return [];
  }
}
