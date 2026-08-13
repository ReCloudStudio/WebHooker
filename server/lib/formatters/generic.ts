import type { NeutralMessage, NeutralAuthor } from "../types";
import { GITHUB_COLORS } from "./colors";
import { type T, buildMessage } from "./helpers";

export function formatGeneric(
  eventType: string,
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  _showEmoji: boolean,
): NeutralMessage {
  return buildMessage(
    {
      author,
      title: t("events.generic.title", {
        repo: repo ?? t("common.repository"),
        event: eventType,
        action: payload.action ? `: ${payload.action}` : "",
      }),
      color: GITHUB_COLORS.default,
    },
    t,
    repo,
  );
}
