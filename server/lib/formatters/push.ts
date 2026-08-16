import type { NeutralMessage, NeutralAuthor } from "../types";
import { GITHUB_COLORS } from "./colors";
import {
  branchLink,
  emojiPrefix,
  MAX_COMMIT_SUBJECT,
  tagLink,
  type T,
  buildMessage,
  repoBaseUrl,
} from "./helpers";

export function formatPush(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  showEmoji: boolean,
): NeutralMessage {
  const rawRef = (payload.ref as string) ?? "";
  const isTagPush = rawRef.startsWith("refs/tags/");
  const ref = rawRef.replace("refs/heads/", "").replace("refs/tags/", "tag: ");
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
  const baseUrl = repoBaseUrl(payload, repo);
  const forced = payload.forced as boolean | undefined;
  const created = payload.created as boolean | undefined;
  const deleted = payload.deleted as boolean | undefined;
  const em = (e: string): string => emojiPrefix(e, showEmoji);

  // A branch/tag deletion pushed via `git push --delete` arrives as a push
  // event with `deleted: true` and no commits — render it like the `delete`
  // event instead of a confusing "0 commits pushed".
  if (deleted) {
    const refType = isTagPush ? "tag" : "branch";
    return buildMessage(
      {
        author,
        title: t("events.delete.title", {
          repo: repo ?? t("common.repository"),
          emoji: em(isTagPush ? "🏷️" : "🌿"),
          type: refType,
          ref: isTagPush ? tagLink(baseUrl, rawRef, ref) : branchLink(baseUrl, rawRef, ref),
        }),
        color: GITHUB_COLORS.delete,
      },
      t,
      repo,
    );
  }

  const descLines: string[] = [];

  if (forced) {
    descLines.push(em("⚠️") + t("events.push.force_push"));
  }
  if (created) {
    descLines.push(
      em("🆕") + t(isTagPush ? "events.push.tag_created" : "events.push.branch_created"),
    );
  }

  const commitsToShow = count <= 5 ? commits : commits.slice(0, 3);
  for (const c of commitsToShow) {
    const shortId = c.id?.slice(0, 7) ?? "???????";
    const msg =
      (c.message?.split("\n")[0] ?? "").slice(0, MAX_COMMIT_SUBJECT) || t("common.no_message");
    const url = baseUrl && c.id ? `${baseUrl}/commit/${c.id}` : null;
    const hash = url ? `[\`${shortId}\`](${url})` : `\`${shortId}\``;
    descLines.push(`${hash} ${msg}`);
  }
  if (count > 5) {
    descLines.push(t("common.and_n_more", { count: count - 3 }));
  }

  const added = commits.flatMap((c) => c.added ?? []);
  const removed = commits.flatMap((c) => c.removed ?? []);
  const modified = commits.flatMap((c) => c.modified ?? []);

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  const changeParts: string[] = [];
  if (added.length > 0) changeParts.push(t("events.push.added", { count: added.length }));
  if (removed.length > 0) changeParts.push(t("events.push.removed", { count: removed.length }));
  if (modified.length > 0) changeParts.push(t("events.push.modified", { count: modified.length }));

  let changesValue = "";
  if (compareUrl) {
    changesValue = t("events.push.view_comparison", { url: compareUrl });
    if (changeParts.length > 0) {
      changesValue += " " + changeParts.join(" | ");
    }
  } else if (changeParts.length > 0) {
    changesValue = changeParts.join(" | ");
  }

  if (changesValue) {
    fields.push({
      name: t("fields.changes"),
      value: changesValue,
      inline: false,
    });
  }

  return buildMessage(
    {
      author,
      title: t("events.push.title", {
        count,
        s: count !== 1 ? "s" : "",
        repo: repo ?? t("common.repository"),
        ref,
      }),
      url: compareUrl,
      color: GITHUB_COLORS.push,
      description: descLines.join("\n"),
      fields: fields.length > 0 ? fields : undefined,
    },
    t,
    repo,
  );
}
