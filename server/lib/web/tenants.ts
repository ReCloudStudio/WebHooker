import { log } from "../lib/log";

/**
 * Per-group webhook tenant secrets. A group can opt into its own webhook
 * ingress (`POST /webhook/{groupId}`) with an independent secret, so SaaS
 * users can configure their own GitHub/Gitea/custom webhooks without sharing
 * (or even knowing) the operator's global secrets.
 */
const TENANT_KEY = (groupId: string): string => `tenant:${groupId}`;

/** 32 random bytes → 64 hex chars. */
export function generateTenantSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function getTenantSecret(kv: KVNamespace, groupId: string): Promise<string | null> {
  try {
    return await kv.get(TENANT_KEY(groupId), "text");
  } catch (err) {
    log.warn({ err, groupId }, "Failed to read tenant webhook secret");
    return null;
  }
}

/** Generate (or regenerate) the group's webhook secret. */
export async function setTenantSecret(kv: KVNamespace, groupId: string): Promise<string> {
  const secret = generateTenantSecret();
  await kv.put(TENANT_KEY(groupId), secret);
  return secret;
}

export async function deleteTenantSecret(kv: KVNamespace, groupId: string): Promise<void> {
  await kv.delete(TENANT_KEY(groupId));
}
