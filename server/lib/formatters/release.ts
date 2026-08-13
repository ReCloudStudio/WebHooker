import type { NeutralMessage, NeutralAuthor } from "../types";
import { GITHUB_COLORS } from "./colors";
import { emojiPrefix, type T, buildMessage } from "./helpers";

export function formatRelease(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const action = (payload.action as string) ?? "published";
  const release = payload.release as {
    tag_name?: string;
    name?: string;
    html_url?: string;
    body?: string;
    prerelease?: boolean;
    draft?: boolean;
    author?: { login?: string };
  };

  const isPrerelease = release.prerelease;
  const colorKey =
    action === "deleted"
      ? "release_deleted"
      : isPrerelease
        ? "release_prerelease"
        : "release_published";
  const al = t("actions." + action) ?? action;
  const emoji = action === "deleted" ? "🗑️" : isPrerelease ? "⚠️" : "🚀";
  const em = (e: string): string => emojiPrefix(e, showEmoji);

  const descriptionParts: string[] = [];
  descriptionParts.push(
    t("events.release.action_release", {
      emoji: em(emoji),
      action: al,
      tag: release.tag_name ?? t("common.unknown"),
    }),
  );

  if (release.body) {
    const truncated = release.body.slice(0, 300);
    descriptionParts.push(`\n${truncated}${release.body.length > 300 ? "..." : ""}`);
  }

  return buildMessage(
    {
      author,
      title: t("events.release.title", {
        repo: repo ?? t("common.repository"),
        name: release.name ?? release.tag_name ?? "Release",
      }),
      url: release.html_url,
      color: GITHUB_COLORS[colorKey],
      description: descriptionParts.join("\n"),
    },
    t,
    repo,
  );
}
