import type { NeutralMessage } from "../../types";
import { repoUrlFromMessage, splitMessageTitle } from "../../formatters/helpers";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mdToHtml(s: string): string {
  let out = esc(s);
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, label, url) => `<a href="${esc(url)}">${label}</a>`,
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<i>$2</i>");
  out = out.replace(/~~([^~]+)~~/g, "<s>$1</s>");
  return out;
}

function formatTimestamp(ts?: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export function renderNeutralMessage(message: NeutralMessage): string {
  const parts: string[] = [];

  // HTML allows partial links, so keep the `{repo}{#number}: {subject}` line
  // intact with only the repo head linked (the subject stays plain text).
  const { head, subject } = splitMessageTitle(message.title);
  const repoUrl = repoUrlFromMessage(message.url);
  const title = subject
    ? `<b>${repoUrl ? `<a href="${esc(repoUrl)}">${mdToHtml(head)}</a>` : mdToHtml(head)}: ${mdToHtml(subject)}</b>`
    : message.url
      ? `<b><a href="${esc(message.url)}">${mdToHtml(message.title)}</a></b>`
      : `<b>${mdToHtml(message.title)}</b>`;
  parts.push(title);

  if (message.author) {
    const name = mdToHtml(message.author.name);
    const author = message.author.url ? `<a href="${esc(message.author.url)}">${name}</a>` : name;
    parts.push(`👤 ${author}`);
  }

  if (message.description) {
    parts.push(mdToHtml(message.description));
  }

  for (const field of message.fields ?? []) {
    parts.push(`<b>${mdToHtml(field.name)}</b>: ${mdToHtml(field.value)}`);
  }

  const meta: string[] = [];
  if (message.footer) meta.push(esc(message.footer));
  const ts = formatTimestamp(message.timestamp);
  if (ts) meta.push(ts);
  if (meta.length > 0) {
    parts.push(`<i>${meta.join(" · ")}</i>`);
  }

  return parts.join("\n");
}
