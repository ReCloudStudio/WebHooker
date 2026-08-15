import type { WebhookEvent, Filter, FilterNode } from "../types";

const regexCache = new Map<string, RegExp>();
const keywordBodyCache = new WeakMap<WebhookEvent, string>();
const MAX_PATTERN_LENGTH = 200;

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

function compileGlob(pattern: string, anchored: boolean): RegExp | null {
  if (pattern.length > MAX_PATTERN_LENGTH) return null;
  const cacheKey = `${anchored ? "a" : "s"}:${pattern}`;
  const cached = regexCache.get(cacheKey);
  if (cached) return cached;
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  try {
    const re = new RegExp(anchored ? `^${body}$` : body, "i");
    regexCache.set(cacheKey, re);
    return re;
  } catch {
    return null;
  }
}

function isGlob(pattern: string): boolean {
  return pattern.includes("*") || pattern.includes("?");
}

function matchField(pattern: string, value: string): boolean {
  if (isWrappedRegex(pattern)) {
    const re = compileRegex(pattern.slice(1, -1));
    return re ? re.test(value) : false;
  }
  if (isGlob(pattern)) {
    const re = compileGlob(pattern, true);
    return re ? re.test(value) : false;
  }
  return value.toLowerCase() === pattern.toLowerCase();
}

function matchKeyword(pattern: string, body: string): boolean {
  if (isWrappedRegex(pattern)) {
    const re = compileRegex(pattern.slice(1, -1));
    return re ? re.test(body) : false;
  }
  if (isGlob(pattern)) {
    const re = compileGlob(pattern, false);
    return re ? re.test(body) : false;
  }
  return body.includes(pattern.toLowerCase());
}

export function getKeywordBody(event: WebhookEvent): string {
  const cached = keywordBodyCache.get(event);
  if (cached !== undefined) return cached;
  const body = JSON.stringify(event.payload).toLowerCase();
  keywordBodyCache.set(event, body);
  return body;
}

function extractBranch(event: WebhookEvent): string | undefined {
  const p = event.payload;
  switch (event.event) {
    case "push":
      return typeof p.ref === "string" ? p.ref.replace("refs/heads/", "") : undefined;
    case "pull_request":
    case "pull_request_review":
    case "pull_request_review_comment":
      return (p.pull_request as { head?: { ref?: string } } | undefined)?.head?.ref;
    case "create":
    case "delete":
      return typeof p.ref === "string" ? p.ref : undefined;
    case "workflow_run":
      return (p.workflow_run as { head_branch?: string } | undefined)?.head_branch;
    case "check_suite":
      return (p.check_suite as { head_branch?: string } | undefined)?.head_branch;
    case "workflow_job":
      return (p.workflow_job as { head_branch?: string } | undefined)?.head_branch;
    case "deployment":
      return typeof p.ref === "string" ? p.ref.replace("refs/heads/", "") : undefined;
    case "commit_comment":
      return undefined;
    case "code_scanning_alert":
      return typeof p.ref === "string" ? p.ref : undefined;
    default:
      return undefined;
  }
}

function matchFilter(filter: Filter, event: WebhookEvent, keywordBody?: string): boolean {
  if (filter.type === "keyword") {
    const body = keywordBody ?? getKeywordBody(event);
    const patterns = Array.isArray(filter.match) ? filter.match : [filter.match];
    const matches = patterns.some((p) => matchKeyword(p, body));
    return filter.exclude ? !matches : matches;
  }

  const value = valueFor(filter, event);
  if (!value) return false;
  const patterns = Array.isArray(filter.match) ? filter.match : [filter.match];
  const matches = patterns.some((p) => matchField(p, value));
  return filter.exclude ? !matches : matches;
}

function valueFor(filter: Filter, event: WebhookEvent): string | undefined {
  const p = event.payload;
  switch (filter.type) {
    case "event":
      return event.event;
    case "repo":
      return (p.repository as { full_name?: string } | undefined)?.full_name;
    case "actor":
      return (p.sender as { login?: string } | undefined)?.login;
    case "action":
      return typeof p.action === "string" ? p.action : undefined;
    case "branch":
      return extractBranch(event);
    default:
      return undefined;
  }
}

export function containsKeyword(node: FilterNode): boolean {
  if ("all" in node) return node.all.some(containsKeyword);
  if ("any" in node) return node.any.some(containsKeyword);
  if ("not" in node) return containsKeyword(node.not);
  return node.type === "keyword";
}

export function evaluateFilterNode(
  node: FilterNode,
  event: WebhookEvent,
  keywordBody?: string,
): boolean {
  if ("all" in node) return node.all.every((n) => evaluateFilterNode(n, event, keywordBody));
  if ("any" in node) return node.any.some((n) => evaluateFilterNode(n, event, keywordBody));
  if ("not" in node) return !evaluateFilterNode(node.not, event, keywordBody);
  return matchFilter(node, event, keywordBody);
}

export function explainFilter(filter: Filter): string {
  const value = Array.isArray(filter.match)
    ? filter.match.map((m) => JSON.stringify(m)).join(" or ")
    : JSON.stringify(filter.match);
  const base = `${filter.type} ${filter.type === "keyword" ? "matches" : "is"} ${value}`;
  return filter.exclude ? `not (${base})` : base;
}

export function explainFilterNode(node: FilterNode): string {
  if ("all" in node) return `(${node.all.map(explainFilterNode).join(" and ")})`;
  if ("any" in node) return `(${node.any.map(explainFilterNode).join(" or ")})`;
  if ("not" in node) return `not (${explainFilterNode(node.not)})`;
  return explainFilter(node);
}
