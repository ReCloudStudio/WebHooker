import type { NeutralMessage } from "../../types";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineUrl(url?: string, text?: string): string {
  const label = esc(text ?? url ?? "");
  if (!url) return label;
  return `<a href="${esc(url)}">${label}</a>`;
}

export function renderNeutralMessage(message: NeutralMessage): string {
  const parts: string[] = [];
  const title = inlineUrl(message.url, message.title);
  parts.push(`<b>${title}</b>`);

  if (message.author) {
    const author = message.author.url
      ? `<a href="${esc(message.author.url)}">${esc(message.author.name)}</a>`
      : esc(message.author.name);
    parts.push(`👤 ${author}`);
  }

  if (message.description) {
    parts.push(esc(message.description));
  }

  for (const field of message.fields ?? []) {
    parts.push(`<b>${esc(field.name)}</b>: ${esc(field.value)}`);
  }

  const meta: string[] = [];
  if (message.footer) meta.push(esc(message.footer));
  if (message.timestamp) meta.push(esc(message.timestamp));
  if (meta.length > 0) {
    parts.push(`<i>${meta.join(" · ")}</i>`);
  }

  return parts.join("\n");
}
