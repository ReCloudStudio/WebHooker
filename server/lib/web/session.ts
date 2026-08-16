import type { Env } from "../types";

const SESSION_COOKIE = "wh_admin_session";
const SESSION_TTL = 24 * 3600;

export interface AdminSession {
  userId: string;
  login: string;
}

export function isAdminUser(env: Env, userId: string, login: string): boolean {
  const ids = (env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return false;
  return ids.includes(userId) || ids.some((id) => id.toLowerCase() === login.toLowerCase());
}

function generateSessionId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createAdminSession(
  kv: KVNamespace,
  userId: string,
  login: string,
): Promise<string> {
  const sessionId = generateSessionId();
  const session: AdminSession = { userId, login };
  await kv.put(`session:${sessionId}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL,
  });
  return sessionId;
}

export function adminCookie(sessionId: string): string {
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL}`;
}

export function clearAdminCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

export async function getAdminSession(
  kv: KVNamespace,
  cookieHeader: string | undefined,
): Promise<AdminSession | null> {
  const sessionId = parseCookies(cookieHeader)[SESSION_COOKIE];
  if (!sessionId) return null;
  const raw = await kv.get<AdminSession>(`session:${sessionId}`, "json");
  if (!raw) return null;
  return raw;
}

export async function destroyAdminSession(
  kv: KVNamespace,
  cookieHeader: string | undefined,
): Promise<void> {
  const sessionId = parseCookies(cookieHeader)[SESSION_COOKIE];
  if (sessionId) await kv.delete(`session:${sessionId}`);
}
