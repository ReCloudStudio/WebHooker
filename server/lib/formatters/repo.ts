import type { NeutralMessage, NeutralAuthor } from "../types";
import { GITHUB_COLORS } from "./colors";
import { emojiPrefix, type T, buildMessage } from "./helpers";

export function formatStar(
  payload: Record<string, unknown>,
  repo: string | undefined,
  repoUrl: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const action = (payload.action as string) ?? "created";
  const actionLabel = action === "created" ? t("events.star.starred") : t("events.star.unstarred");
  const em = (e: string): string => emojiPrefix(e, showEmoji);

  return buildMessage(
    {
      author,
      title: t("events.star.title", {
        repo: repo ?? t("common.repository"),
        emoji: em(action === "created" ? "⭐️" : "💫"),
        label: actionLabel,
      }),
      url: repoUrl,
      color: GITHUB_COLORS.star,
    },
    t,
    repo,
  );
}

export function formatFork(
  payload: Record<string, unknown>,
  repo: string | undefined,
  repoUrl: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const forkee = payload.forkee as { full_name?: string; html_url?: string } | undefined;
  const em = (e: string): string => emojiPrefix(e, showEmoji);

  return buildMessage(
    {
      author,
      title: t("events.fork.title", {
        repo: repo ?? t("common.repository"),
        emoji: em("🍴"),
        forkee: forkee?.full_name ?? t("common.unknown"),
      }),
      url: forkee?.html_url ?? repoUrl,
      color: GITHUB_COLORS.fork,
    },
    t,
    repo,
  );
}
