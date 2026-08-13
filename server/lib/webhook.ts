import type { H3Event } from "h3";
import { getHeader, readRawBody, setResponseStatus } from "h3";
import type { Env } from "./types";
import { detectProvider } from "./providers";
import { dispatchEvent } from "./core/dispatch";
import { loadConfig } from "./config";
import { loadGroups, ensureInstallationGroup } from "./web/groups";
import { getTenantSecret } from "./web/tenants";
import { recordAudit } from "./lib/audit";
import { cfEnv, cfWaitUntil, headersFrom } from "./cf";
import { log } from "./lib/log";

const MAX_BODY_SIZE = 1024 * 1024;

export interface WebhookResult {
  status: 200 | 400 | 401 | 404 | 413;
  body: unknown;
}

/**
 * Core webhook processing. Without `tenantId` this is the legacy global
 * endpoint (`POST /webhook`): events verify against the operator's global
 * secrets and may dispatch into every route. With a `tenantId` (a group id,
 * `POST /webhook/{groupId}`) the group's own secret is used for verification
 * (GITHUB_WEBHOOK_SECRET/GITEA_WEBHOOK_SECRET are overridden per request) and
 * only that group's routes are eligible.
 */
export async function processWebhook(
  env: Env,
  body: string,
  headers: Record<string, string>,
  waitUntil: (promise: Promise<unknown>) => void,
  tenantId?: string,
): Promise<WebhookResult> {
  let effectiveEnv = env;
  const groups = await loadGroups(env.KV);
  if (tenantId) {
    if (!groups.some((g) => g.id === tenantId)) {
      return { status: 404, body: { error: "Group not found" } };
    }
    const secret = await getTenantSecret(env.KV, tenantId);
    if (!secret) {
      return { status: 404, body: { error: "Webhook disabled for this group" } };
    }
    effectiveEnv = { ...env, GITHUB_WEBHOOK_SECRET: secret, GITEA_WEBHOOK_SECRET: secret };
  }

  const provider = detectProvider(headers);
  if (!provider) {
    return { status: 400, body: { error: "Unknown webhook provider" } };
  }

  if (!(await provider.verify(body, headers, effectiveEnv))) {
    // Log the actual cause: a missing provider secret is a deployment problem,
    // while a mismatched signature usually means the sender used the wrong secret.
    const secret =
      provider.id === "gitea"
        ? effectiveEnv.GITEA_WEBHOOK_SECRET
        : effectiveEnv.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      log.warn({ provider: provider.id }, "Webhook rejected: provider secret is not configured");
    } else {
      log.warn({ provider: provider.id }, "Webhook rejected: invalid signature");
    }
    return { status: 401, body: { error: "Invalid signature" } };
  }

  const event = provider.parse(body, headers);
  if (!event) {
    return { status: 400, body: { error: "Invalid event" } };
  }

  // Auto-provision GitHub App installations so tenant isolation is configured
  // without manual id entry: a group is created (or existing matching groups
  // are bound) before the event is dispatched.
  if (
    provider.id === "github" &&
    event.event === "installation" &&
    event.payload.action === "created" &&
    event.installationId != null
  ) {
    const install = event.payload.installation as { account?: { login?: string } } | undefined;
    const account = install?.account?.login ?? "";
    try {
      const group = await ensureInstallationGroup(env.KV, event.installationId, account);
      if (group) {
        await recordAudit(env.DB, {
          ts: Date.now(),
          actorLogin: account || undefined,
          action: "installation.created",
          targetType: "group",
          targetId: group.id,
          groupId: group.id,
        });
      }
    } catch (err) {
      log.warn(
        { err, installationId: event.installationId },
        "Failed to auto-provision installation group",
      );
    }
  }

  if (event.deliveryId) {
    // Tenant-scoped dedup keys: different accounts can reuse the same
    // delivery id, so the global key would wrongly dedupe across tenants.
    const key = tenantId
      ? `delivery:${tenantId}:${event.deliveryId}`
      : `delivery:${event.deliveryId}`;
    const seen = await env.KV.get(key);
    if (seen) {
      return { status: 200, body: { ok: true, duplicate: true } };
    }
    await env.KV.put(key, "1", { expirationTtl: 300 });
  }

  const config = await loadConfig(env);
  if (tenantId) {
    config.routes = config.routes.filter((r) => r.groupId === tenantId);
  }

  const dispatch = dispatchEvent(config, event, env, groups).catch((err) =>
    log.error(err, "Dispatch failed"),
  );
  waitUntil(dispatch);

  return { status: 200, body: { ok: true } };
}

/** h3 wrapper for `POST /webhook` / `POST /webhook/:groupId`. */
export async function handleWebhookRequest(event: H3Event, tenantId?: string): Promise<unknown> {
  const contentLength = Number(getHeader(event, "content-length") ?? 0);
  if (contentLength > MAX_BODY_SIZE) {
    setResponseStatus(event, 413);
    return { error: "Request too large" };
  }
  const body = (await readRawBody(event, "utf8")) ?? "";
  if (body.length > MAX_BODY_SIZE) {
    setResponseStatus(event, 413);
    return { error: "Request too large" };
  }
  const result = await processWebhook(
    cfEnv(event),
    body,
    headersFrom(event),
    cfWaitUntil(event),
    tenantId,
  );
  setResponseStatus(event, result.status);
  return result.body;
}
