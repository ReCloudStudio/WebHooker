import type { NeutralMessage, NeutralAuthor } from "../types";
import { GITHUB_COLORS } from "./colors";
import { emojiPrefix, type T, buildMessage } from "./helpers";

export function formatLabel(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const action = (payload.action as string) ?? "created";
  const label = payload.label as {
    name?: string;
    color?: string;
    description?: string;
  };

  const al = t("actions." + action) ?? action;
  const emoji = action === "deleted" ? "🗑️" : action === "edited" ? "✏️" : "🏷️";
  const em = (e: string): string => emojiPrefix(e, showEmoji);

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (label.name) {
    fields.push({
      name: t("fields.label"),
      value: label.name,
      inline: true,
    });
  }

  if (label.color) {
    fields.push({
      name: t("fields.color"),
      value: `#${label.color}`,
      inline: true,
    });
  }

  if (label.description) {
    fields.push({
      name: t("fields.description"),
      value: label.description,
      inline: false,
    });
  }

  return buildMessage(
    {
      author,
      title: t("events.label.title", {
        repo: repo ?? t("common.repository"),
        emoji: em(emoji),
        action: al,
        name: label.name ?? t("common.unknown"),
      }),
      color: GITHUB_COLORS.label,
      fields: fields.length > 0 ? fields : undefined,
    },
    t,
    repo,
  );
}
