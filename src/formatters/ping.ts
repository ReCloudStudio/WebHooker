import type { NeutralMessage, NeutralAuthor } from "../types";
import { GITHUB_COLORS } from "./colors";
import { type T, buildMessage } from "./helpers";

export function formatPing(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  _showEmoji: boolean,
): NeutralMessage {
  const zen = payload.zen as string | undefined;
  const hookId = payload.hook_id as number | undefined;

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  if (hookId != null) {
    fields.push({
      name: t("fields.details"),
      value: String(hookId),
      inline: true,
    });
  }

  return buildMessage(
    {
      author,
      title: t("events.ping.title", { repo: repo ?? t("common.repository") }),
      color: GITHUB_COLORS.default,
      description: zen,
      fields,
    },
    t,
    repo,
  );
}
