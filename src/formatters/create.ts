import type { NeutralMessage, NeutralAuthor } from "../types";
import { GITHUB_COLORS } from "./colors";
import { emojiPrefix, type T, buildMessage } from "./helpers";

export function formatCreate(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const refType = (payload.ref_type as string) ?? "branch";
  const ref = (payload.ref as string) ?? t("common.unknown");

  const emoji = refType === "tag" ? "🏷️" : "🌿";
  const em = (e: string): string => emojiPrefix(e, showEmoji);

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  fields.push({
    name: t("fields.type"),
    value: refType,
    inline: true,
  });

  fields.push({
    name: t("fields.name"),
    value: `\`${ref}\``,
    inline: true,
  });

  if (payload.description) {
    fields.push({
      name: t("fields.description"),
      value: payload.description as string,
      inline: false,
    });
  }

  return buildMessage(
    {
      author,
      title: t("events.create.title", {
        repo: repo ?? t("common.repository"),
        emoji: em(emoji),
        type: refType,
        ref,
      }),
      color: GITHUB_COLORS.create,
      fields,
    },
    t,
    repo,
  );
}

export function formatDelete(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const refType = (payload.ref_type as string) ?? "branch";
  const ref = (payload.ref as string) ?? t("common.unknown");

  const emoji = refType === "tag" ? "🏷️" : "🌿";
  const em = (e: string): string => emojiPrefix(e, showEmoji);

  return buildMessage(
    {
      author,
      title: t("events.delete.title", {
        repo: repo ?? t("common.repository"),
        emoji: em(emoji),
        type: refType,
        ref,
      }),
      color: GITHUB_COLORS.delete,
    },
    t,
    repo,
  );
}
