interface StoredToken {
  userId: string;
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
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
  await kv.delete(`token:${userId}`);
}

export async function findUserIdByToken(
  kv: KVNamespace,
  accessToken: string,
): Promise<string | null> {
  const list = await kv.list({ prefix: "token:" });
  for (const key of list.keys) {
    const raw = await kv.get(key.name, "json");
    if (!raw) continue;
    const t = raw as StoredToken;
    if (Date.now() >= t.expiresAt) {
      await kv.delete(key.name);
      continue;
    }
    if (t.accessToken === accessToken) return t.userId;
  }
  return null;
}
