import type { WebhookEvent, Route, Filter } from "../types";

const regexCache = new Map<string, RegExp>();
const keywordBodyCache = new WeakMap<WebhookEvent, string>();
const MAX_PATTERN_LENGTH = 200;

/** True when a pattern is wrapped in `/.../` and should be parsed as a RegExp. */
function isWrappedRegex(pattern: string): boolean {
  return pattern.length >= 2 && pattern.startsWith("/") && pattern.endsWith("/");
}

function compileRegex(pattern: string): RegExp | null {
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

/**
 * Compile a `*` / `?` glob into a RegExp. `*` matches any sequence of
 * characters, `?` matches exactly one; everything else matches literally
 * (case-insensitive). Anchored globs are full-value matches (`^...$`),
 * unanchored ones behave as a search within the value (keyword semantics).
 */
function compileGlob(pattern: string, anchored: boolean): RegExp | null {
  if (pattern.length > MAX_PATTERN_LENGTH) return null;
  const key = `${anchored ? "a" : "s"}:${pattern}`;
  const cached = regexCache.get(key);
  if (cached) return cached;
  try {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const body = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
    const re = new RegExp(anchored ? `^${body}$` : body, "i");
    regexCache.set(key, re);
    return re;
  } catch {
    return null;
  }
}

function isGlob(pattern: string): boolean {
  return pattern.includes("*") || pattern.includes("?");
}

/**
 * Unified pattern syntax shared by every filter type:
 * - wrapped in `//` → parsed as a regular expression (case-insensitive)
 * - contains `*` or `?` → glob matching (`*` = any run, `?` = one character)
 * - anything else → plain text
 */

/** Match a pattern against a whole field value (event/repo/actor/action/branch). */
function matchField(pattern: string, value: string): boolean {
  if (isWrappedRegex(pattern)) {
    const re = compileRegex(pattern.slice(1, -1));
    return !!re && re.test(value);
  }
  if (isGlob(pattern)) {
    const re = compileGlob(pattern, true);
    return !!re && re.test(value);
  }
  return value.toLowerCase() === pattern.toLowerCase();
}

/** Match a pattern against the lowercased JSON payload body (keyword search). */
function matchKeyword(pattern: string, body: string): boolean {
  if (isWrappedRegex(pattern)) {
    const re = compileRegex(pattern.slice(1, -1));
    return !!re && re.test(body);
  }
  if (isGlob(pattern)) {
    const re = compileGlob(pattern, false);
    return !!re && re.test(body);
  }
  return body.includes(pattern.toLowerCase());
}

function getKeywordBody(event: WebhookEvent): string {
  const cached = keywordBodyCache.get(event);
  if (cached !== undefined) return cached;
  const body = JSON.stringify(event.payload).toLowerCase();
  keywordBodyCache.set(event, body);
  return body;
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
  if (event.event === "check_suite") {
    const suite = event.payload.check_suite as { head_branch?: string } | undefined;
    return suite?.head_branch;
  }
  if (event.event === "workflow_job") {
    const job = event.payload.workflow_job as { head_branch?: string } | undefined;
    return job?.head_branch;
  }
  if (event.event === "deployment") {
    const deployment = event.payload.deployment as { ref?: string } | undefined;
    return deployment?.ref?.replace("refs/heads/", "");
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
      const matches = patterns.some((p) => matchKeyword(p, body));
      return filter.exclude ? !matches : matches;
    }
    default:
      return false;
  }

  if (!value) return false;

  const patterns = Array.isArray(filter.match) ? filter.match : [filter.match];
  const matches = patterns.some((p) => matchField(p, value));

  return filter.exclude ? !matches : matches;
}

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
