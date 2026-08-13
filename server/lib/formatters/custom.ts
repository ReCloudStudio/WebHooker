import type { NeutralAuthor, NeutralField, NeutralMessage } from "../types";
import { type T, buildMessage } from "./helpers";

const COLOR_WORDS: Record<string, number> = {
  red: 0xf85149,
  green: 0x3fb950,
  yellow: 0xd29922,
  blue: 0x58a6ff,
  purple: 0xbc8cff,
  orange: 0xdb6d28,
  cyan: 0x39c5cf,
  gray: 0x6e7681,
};

function parseColor(color: unknown): number | undefined {
  if (typeof color !== "string") return undefined;
  const key = color.trim().toLowerCase();
  if (COLOR_WORDS[key]) return COLOR_WORDS[key];
  const hex = /^#?([0-9a-f]{6})$/i.exec(key);
  return hex ? parseInt(hex[1]!, 16) : undefined;
}

function parseFields(raw: unknown): NeutralField[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const fields: NeutralField[] = [];
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const name = (f as Record<string, unknown>).name;
    const value = (f as Record<string, unknown>).value;
    if (typeof name !== "string" || typeof value !== "string") continue;
    fields.push({
      name: name || "\u200b",
      value,
      inline: (f as Record<string, unknown>).inline === true,
    });
  }
  return fields.length > 0 ? fields : undefined;
}

/**
 * Renders a `custom` webhook payload (the message schema documented in
 * docs/guide/configuration.md) into a NeutralMessage. Unlike forge events the
 * title is not required to start with a repo; an optional `repo` field is
 * used as the `{repo}: ` prefix and footer.
 */
export function formatCustom(
  payload: Record<string, unknown>,
  repo: string | undefined,
  author: NeutralAuthor,
  t: T,
  _showEmoji: boolean,
): NeutralMessage {
  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : t("custom.title_fallback");
  const payloadRepo =
    typeof payload.repo === "string" && payload.repo.trim() ? payload.repo.trim() : undefined;
  const effectiveRepo = payloadRepo ?? repo;
  const fullTitle = effectiveRepo ? `${effectiveRepo}: ${title}` : title;
  const description = typeof payload.description === "string" ? payload.description : undefined;
  const url = typeof payload.url === "string" ? payload.url : undefined;
  const footer = typeof payload.footer === "string" ? payload.footer : undefined;

  const rawAuthor = payload.author as Record<string, unknown> | undefined;
  const customAuthor: NeutralAuthor | undefined =
    rawAuthor && typeof rawAuthor === "object"
      ? {
          name: typeof rawAuthor.name === "string" && rawAuthor.name ? rawAuthor.name : author.name,
          iconUrl: typeof rawAuthor.iconUrl === "string" ? rawAuthor.iconUrl : author.iconUrl,
          url: typeof rawAuthor.url === "string" ? rawAuthor.url : author.url,
        }
      : undefined;

  return buildMessage(
    {
      author: customAuthor,
      title: fullTitle,
      url,
      color: parseColor(payload.color) ?? 0x6e7681,
      description,
      fields: parseFields(payload.fields),
      // A custom message without a repo gets no `{repo}` footer at all.
      footer: footer ?? (effectiveRepo ? undefined : ""),
    },
    t,
    effectiveRepo,
  );
}
