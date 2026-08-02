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
