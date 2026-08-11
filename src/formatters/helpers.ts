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
