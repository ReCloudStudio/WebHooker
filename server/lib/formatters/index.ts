import type { Route, WebhookEvent, NeutralMessage, NeutralAuthor } from "../types";
import type { Translations } from "../lib/i18n";
import { makeT, senderProfileUrl, type T } from "./helpers";
import { formatGeneric } from "./generic";
import type { FormatContext } from "./types";
import { findFormatter } from "./registry";

export function formatEvent(
  route: Route,
  event: WebhookEvent,
  tr?: Translations,
  showEmoji = true,
): NeutralMessage {
  const { event: eventType, payload } = event;
  const repo = (payload.repository as { full_name?: string })?.full_name;
  const sender = (payload.sender as { login?: string })?.login;
  const senderAvatar = (payload.sender as { avatar_url?: string })?.avatar_url;
  const senderUrl = (payload.sender as { html_url?: string })?.html_url;
  const repoUrl = (payload.repository as { html_url?: string })?.html_url;

  const t: T = makeT(tr);

  const author: NeutralAuthor = {
    name: sender ?? t("common.unknown"),
    iconUrl: senderAvatar,
    url: senderUrl ?? (sender ? senderProfileUrl(repoUrl, sender) : undefined),
  };

  const ctx: FormatContext = { payload, repo, repoUrl, author, t, showEmoji };

  return (
    findFormatter(eventType)?.format(ctx) ??
    formatGeneric(eventType, payload, repo, author, t, showEmoji)
  );
}
