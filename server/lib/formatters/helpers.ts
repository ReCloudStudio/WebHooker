import type { NeutralMessage } from "../types";
import { t as translate } from "../lib/i18n";
import type { Translations } from "../lib/i18n";

export type T = (key: string, params?: Record<string, string | number>) => string;

export function emojiPrefix(emoji: string, show: boolean): string {
  return show ? `${emoji} ` : "";
}

export function makeT(tr?: Translations): T {
  return (key, params) => translate(key, params, undefined, tr);
}

export function buildMessage(
  partial: Omit<Partial<NeutralMessage>, "title"> & { title: string },
  t: T,
  repo?: string,
): NeutralMessage {
  return {
    ...partial,
    footer: partial.footer ?? t("common.footer", { repo: repo ?? t("common.github") }),
    timestamp: partial.timestamp ?? new Date().toISOString(),
  };
}

/**
 * Base URL of the forge repo (e.g. `https://github.com/owner/repo` or a Gitea
 * instance URL). Derived from `repository.html_url` in the payload so it works
 * for any provider; falls back to github.com for legacy payloads.
 */
export function repoBaseUrl(payload: Record<string, unknown>, repo?: string): string | undefined {
  const html = (payload.repository as { html_url?: string } | undefined)?.html_url;
  if (html) return html;
  return repo ? `https://github.com/${repo}` : undefined;
}

function encodeRefPath(ref: string): string {
  return ref
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

/** Inline code + hyperlink for a commit, e.g. [`abc123d`](.../commit/abc123def456). */
export function commitLink(baseUrl: string | undefined, sha: string, short?: string): string {
  const label = short ?? sha.slice(0, 7);
  return baseUrl ? `[\`${label}\`](${baseUrl}/commit/${encodeRefPath(sha)})` : `\`${label}\``;
}

/** Inline code + hyperlink for a branch (or bare ref), e.g. [`main`](.../tree/main). */
export function branchLink(baseUrl: string | undefined, branch: string, label?: string): string {
  const clean = branch.replace("refs/heads/", "").replace("refs/tags/", "");
  const display = label ?? clean;
  return baseUrl ? `[\`${display}\`](${baseUrl}/tree/${encodeRefPath(clean)})` : `\`${display}\``;
}

/** Inline code + hyperlink for a tag, e.g. [`v1.0`](.../releases/tag/v1.0). */
export function tagLink(baseUrl: string | undefined, tag: string, label?: string): string {
  const clean = tag.replace("refs/tags/", "");
  const display = label ?? clean;
  return baseUrl
    ? `[\`${display}\`](${baseUrl}/releases/tag/${encodeRefPath(clean)})`
    : `\`${display}\``;
}
