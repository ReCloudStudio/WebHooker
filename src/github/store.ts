interface StoredToken {
  userId: string;
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
}

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function saveToken(
  kv: KVNamespace,
  userId: string,
  accessToken: string,
  expiresInSeconds: number,
  refreshToken?: string,
): Promise<void> {
  const token: StoredToken = {
    userId,
    accessToken,
    expiresAt: Date.now() + expiresInSeconds * 1000,
    refreshToken,
  };
  const ttl = Math.max(Math.floor(expiresInSeconds * 0.9), 60);
  await kv.put(`token:${userId}`, JSON.stringify(token), { expirationTtl: ttl });

  const tokenHash = await hashToken(accessToken);
  await kv.put(`token-reverse:${tokenHash}`, userId, { expirationTtl: ttl });
}

export async function getToken(kv: KVNamespace, userId: string): Promise<string | null> {
  const raw = await kv.get(`token:${userId}`, "json");
  if (!raw) return null;
  const t = raw as StoredToken;
  if (Date.now() >= t.expiresAt) {
    await kv.delete(`token:${userId}`);
    return null;
  }
  return t.accessToken;
}

export async function getRefreshToken(kv: KVNamespace, userId: string): Promise<string | null> {
  const raw = await kv.get(`token:${userId}`, "json");
  if (!raw) return null;
  return (raw as StoredToken).refreshToken ?? null;
}

export async function removeToken(kv: KVNamespace, userId: string): Promise<void> {
  const raw = await kv.get(`token:${userId}`, "json");
  if (raw) {
    const t = raw as StoredToken;
    const tokenHash = await hashToken(t.accessToken);
    await kv.delete(`token-reverse:${tokenHash}`);
  }
  await kv.delete(`token:${userId}`);
}

export async function findUserIdByToken(
  kv: KVNamespace,
  accessToken: string,
): Promise<string | null> {
  const tokenHash = await hashToken(accessToken);
  return await kv.get(`token-reverse:${tokenHash}`, "text");
}

/**
 * Link a Discord user id to a GitHub user id so that bot commands can act
 * as that GitHub account. The actual OAuth token lives under `token:{githubUserId}`.
 */
export async function saveDiscordLink(
  db: D1Database,
  discordUserId: string,
  githubUserId: string,
): Promise<void> {
  await db
    .prepare("INSERT OR REPLACE INTO discord_links (discord_user_id, github_user_id) VALUES (?, ?)")
    .bind(discordUserId, githubUserId)
    .run();
}

export async function getDiscordLink(
  db: D1Database,
  discordUserId: string,
): Promise<string | null> {
  const { results } = await db
    .prepare("SELECT github_user_id FROM discord_links WHERE discord_user_id = ?")
    .bind(discordUserId)
    .all<{ github_user_id: string }>();
  return results[0]?.github_user_id ?? null;
}

export async function removeDiscordLink(db: D1Database, discordUserId: string): Promise<void> {
  await db.prepare("DELETE FROM discord_links WHERE discord_user_id = ?").bind(discordUserId).run();
}

export async function saveTelegramLink(
  db: D1Database,
  telegramUserId: string,
  githubUserId: string,
): Promise<void> {
  await db
    .prepare(
      "INSERT OR REPLACE INTO telegram_links (telegram_user_id, github_user_id) VALUES (?, ?)",
    )
    .bind(telegramUserId, githubUserId)
    .run();
}

export async function getTelegramLink(
  db: D1Database,
  telegramUserId: string,
): Promise<string | null> {
  const { results } = await db
    .prepare("SELECT github_user_id FROM telegram_links WHERE telegram_user_id = ?")
    .bind(telegramUserId)
    .all<{ github_user_id: string }>();
  return results[0]?.github_user_id ?? null;
}

export async function removeTelegramLink(db: D1Database, telegramUserId: string): Promise<void> {
  await db
    .prepare("DELETE FROM telegram_links WHERE telegram_user_id = ?")
    .bind(telegramUserId)
    .run();
}
