import type { WebhookEvent, Route, Filter } from "./types";

const keyCache = new Map<string, CryptoKey>();
const regexCache = new Map<string, RegExp>();
const keywordBodyCache = new WeakMap<WebhookEvent, string>();
const MAX_PATTERN_LENGTH = 200;

function compileKeywordRegex(pattern: string): RegExp | null {
  if (pattern.length > MAX_PATTERN_LENGTH) return null;
  const cached = regexCache.get(pattern);
  if (cached) return cached;
  try {
    const re = new RegExp(pattern, "i");
    regexCache.set(pattern, re);
    return re;
  } catch {
    return null;
  }
}

function getKeywordBody(event: WebhookEvent): string {
  const cached = keywordBodyCache.get(event);
  if (cached !== undefined) return cached;
  const body = JSON.stringify(event.payload).toLowerCase();
  keywordBodyCache.set(event, body);
  return body;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const cached = keyCache.get(secret);
  if (cached) return cached;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  keyCache.set(secret, key);
  return key;
}

export async function verifySignature(
  payload: string,
  signature: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await getHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expected = `sha256=${Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;

  try {
    const a = encoder.encode(signature);
    const b = encoder.encode(expected);
    if (a.byteLength !== b.byteLength) return false;
    let diff = 0;
    for (let i = 0; i < a.byteLength; i++) {
      diff |= a[i]! ^ b[i]!;
    }
    return diff === 0;
  } catch {
    return false;
  }
}

export function parseEvent(headers: Record<string, string>, body: string): WebhookEvent | null {
  const event = headers["x-github-event"];
  const signature = headers["x-hub-signature-256"];

  if (!event) return null;

  try {
    const payload = JSON.parse(body);
    return { event, payload, signature };
  } catch {
    return null;
  }
}

function extractBranch(event: WebhookEvent): string | undefined {
  if (event.event === "push") {
    return (event.payload.ref as string)?.replace("refs/heads/", "");
  }
  if (
    event.event === "pull_request" ||
    event.event === "pull_request_review" ||
    event.event === "pull_request_review_comment"
  ) {
    const pr = event.payload.pull_request as { head?: { ref?: string } } | undefined;
    return pr?.head?.ref;
  }
  if (event.event === "create" || event.event === "delete") {
    return event.payload.ref as string | undefined;
  }
  if (event.event === "workflow_run") {
    const wf = event.payload.workflow_run as { head_branch?: string } | undefined;
    return wf?.head_branch;
  }
  if (event.event === "commit_comment") {
    const comment = event.payload.comment as { position?: number | null } | undefined;
    if (comment?.position != null) {
      return undefined;
    }
  }
  if (event.event === "code_scanning_alert") {
    return event.payload.ref as string | undefined;
  }
  return undefined;
}

function matchFilter(filter: Filter, event: WebhookEvent, keywordBody?: string): boolean {
  let value: string | undefined;

  switch (filter.type) {
    case "event":
      value = event.event;
      break;
    case "repo":
      value = (event.payload.repository as { full_name?: string })?.full_name;
      break;
    case "actor":
      value = (event.payload.sender as { login?: string })?.login;
      break;
    case "action":
      value = event.payload.action as string;
      break;
    case "branch":
      value = extractBranch(event);
      break;
    case "keyword": {
      const body = keywordBody ?? getKeywordBody(event);
      const patterns = Array.isArray(filter.match) ? filter.match : [filter.match];
      const matches = patterns.some((p) => {
        const re = compileKeywordRegex(p);
        if (!re) return body.includes(p.toLowerCase());
        return re.test(body);
      });
      return filter.exclude ? !matches : matches;
    }
    default:
      return false;
  }

  if (!value) return false;

  const patterns = Array.isArray(filter.match) ? filter.match : [filter.match];
  const matches = patterns.some((p) => value!.toLowerCase() === p.toLowerCase());

  return filter.exclude ? !matches : matches;
}

/** Org/user logins that own the event (repository owner + organization). */
export function eventOwners(event: WebhookEvent): string[] {
  const owners = new Set<string>();
  const repoOwner = (event.payload.repository as { owner?: { login?: string } } | undefined)?.owner
    ?.login;
  if (repoOwner) owners.add(repoOwner);
  const org = (event.payload.organization as { login?: string } | undefined)?.login;
  if (org) owners.add(org);
  return [...owners];
}

export function matchRoute(route: Route, event: WebhookEvent): boolean {
  if (!route.enabled) return false;
  const hasKeyword = route.filters.some((f) => f.type === "keyword");
  const keywordBody = hasKeyword ? getKeywordBody(event) : undefined;
  return route.filters.every((f) => matchFilter(f, event, keywordBody));
}
