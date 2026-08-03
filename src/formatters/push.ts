import type { NeutralMessage, NeutralAuthor } from "../types";
import { GITHUB_COLORS } from "./colors";
import { emojiPrefix, type T, buildMessage } from "./helpers";

export function formatPush(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const ref = (payload.ref as string)?.replace("refs/heads/", "").replace("refs/tags/", "tag: ");
  const commits = (payload.commits ?? []) as Array<{
    id?: string;
    message?: string;
    author?: { name?: string; email?: string };
    added?: string[];
    removed?: string[];
    modified?: string[];
  }>;
  const count = commits.length;
  const compareUrl = payload.compare as string | undefined;
  const forced = payload.forced as boolean | undefined;
  const created = payload.created as boolean | undefined;
  const em = (e: string): string => emojiPrefix(e, showEmoji);

  const descriptionParts: string[] = [];

  if (forced) {
    descriptionParts.push(em("⚠️") + t("events.push.force_push"));
  }
  if (created) {
    descriptionParts.push(em("🆕") + t("events.push.branch_created"));
  }

  descriptionParts.push(
    t("events.push.commits_pushed", { count, s: count !== 1 ? "s" : "", ref: ref ?? "" }),
  );

  if (compareUrl) {
    descriptionParts.push(t("events.push.view_comparison", { url: compareUrl }));
  }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  const commitField = (c: (typeof commits)[number]): { name: string; value: string } => {
    const shortId = c.id?.slice(0, 7) ?? "???????";
    const msg = c.message?.split("\n")[0].slice(0, 72) ?? t("common.no_message");
    const name =
      repo && c.id ? `[${shortId}](https://github.com/${repo}/commit/${c.id})` : `\`${shortId}\``;
    return { name, value: msg };
  };

  if (count <= 5) {
    for (const c of commits) {
      fields.push({ ...commitField(c), inline: false });
    }
  } else {
    const first3 = commits.slice(0, 3);
    for (const c of first3) {
      fields.push({ ...commitField(c), inline: false });
    }
    fields.push({
      name: `\u200b`,
      value: t("common.and_n_more", { count: count - 3 }),
      inline: false,
    });
  }

  const added = commits.flatMap((c) => c.added ?? []);
  const removed = commits.flatMap((c) => c.removed ?? []);
  const modified = commits.flatMap((c) => c.modified ?? []);

  if (added.length > 0 || removed.length > 0 || modified.length > 0) {
    const changes: string[] = [];
    if (added.length > 0) changes.push(t("events.push.added", { count: added.length }));
    if (removed.length > 0) changes.push(t("events.push.removed", { count: removed.length }));
    if (modified.length > 0) changes.push(t("events.push.modified", { count: modified.length }));
    fields.push({
      name: t("fields.changes"),
      value: changes.join(" | "),
      inline: true,
    });
  }

  return buildMessage(
    {
      author,
      title: t("events.push.title", {
        count,
        s: count !== 1 ? "s" : "",
        repo: repo ?? t("common.repository"),
      }),
      url: compareUrl,
      color: GITHUB_COLORS.push,
      description: descriptionParts.join("\n"),
      fields: fields.length > 0 ? fields : undefined,
    },
    t,
    repo,
  );
}
