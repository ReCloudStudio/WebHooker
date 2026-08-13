import type { NeutralMessage, NeutralAuthor } from "../types";
import { GITHUB_COLORS } from "./colors";
import { emojiPrefix, type T, buildMessage } from "./helpers";

export function formatMember(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const action = (payload.action as string) ?? "added";
  const member = payload.member as { login?: string } | undefined;

  const al = t("actions." + action) ?? action;
  const emoji = action === "added" ? "➕" : action === "removed" ? "➖" : "👤";
  const em = (e: string): string => emojiPrefix(e, showEmoji);
  const memberName = member?.login ?? t("common.unknown");

  return buildMessage(
    {
      author,
      title: t("events.member.title", {
        repo: repo ?? t("common.repository"),
        emoji: em(emoji),
        action: al,
        name: memberName,
      }),
      color: action === "added" ? GITHUB_COLORS.member_added : GITHUB_COLORS.member_removed,
    },
    t,
    repo,
  );
}
