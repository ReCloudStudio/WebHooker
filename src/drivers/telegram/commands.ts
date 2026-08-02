import { log } from "../../lib/log";
import {
  getOAuthURL,
  commentAsUser,
  mergePullRequestAsUser,
  closePullRequestAsUser,
} from "../../github/oauth";
import { getTelegramLink, removeTelegramLink } from "../../github/store";
import type { Env } from "../../types";
import { sendMessage } from "./rest";

const GITHUB_ISSUE_RE = /github\.com\/([^/\s]+)\/([^/\s]+)\/(?:issues|pull)\/(\d+)/;
const GITHUB_PR_RE = /github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/;

interface TelegramMessage {
  message_id?: number;
  text?: string;
  from?: { id?: number; first_name?: string; username?: string };
  chat?: { id?: number; type?: string; title?: string };
  date?: number;
  message_thread_id?: number;
  entities?: Array<{ type?: string; url?: string; offset?: number; length?: number }>;
  reply_to_message?: TelegramMessage;
}

interface Target {
  owner: string;
  repo: string;
  number: number;
}

function chatIdOf(msg: TelegramMessage): string | null {
  return msg.chat?.id != null ? String(msg.chat.id) : null;
}

function userIdOf(msg: TelegramMessage): string | null {
  return msg.from?.id != null ? String(msg.from.id) : null;
}

/** Extract a GitHub issue/PR link from a message (entities text_link or raw text). */
function extractTarget(msg: TelegramMessage, prOnly = false): Target | null {
  const urls: string[] = [];
  for (const ent of msg.entities ?? []) {
    if (ent.type === "text_link" && ent.url) urls.push(ent.url);
  }
  if (msg.text) {
    for (const u of msg.text.match(/https?:\/\/github\.com\/[^\s]+/g) ?? []) urls.push(u);
  }
  for (const url of urls) {
    const re = prOnly ? GITHUB_PR_RE : GITHUB_ISSUE_RE;
    const m = url.match(re);
    if (m) return { owner: m[1], repo: m[2], number: Number(m[3]) };
  }
  return null;
}

async function reply(
  env: Env,
  chatId: string,
  topicId: string | undefined,
  text: string,
): Promise<void> {
  await sendMessage(env.TELEGRAM_TOKEN ?? "", chatId, text, topicId);
}

function errText(err: unknown): string {
  const t = err instanceof Error ? err.message : String(err);
  if (t === "GITHUB_TOKEN_EXPIRED") return "GitHub 授权已过期或无效，请重新使用 /gh login 绑定。";
  if (t === "GITHUB_FORBIDDEN") return "GitHub 拒绝了此操作：你的账号没有权限。";
  if (t === "GITHUB_NOT_FOUND") return "找不到目标（可能已删除或仓库不可访问）。";
  return `操作失败：${t}`;
}

async function cmdLogin(env: Env, msg: TelegramMessage): Promise<void> {
  const chatId = chatIdOf(msg);
  const telegramUserId = userIdOf(msg);
  if (!chatId || !telegramUserId) return;
  const topicId = msg.message_thread_id != null ? String(msg.message_thread_id) : undefined;

  const clientId = env.GITHUB_CLIENT_ID;
  if (!clientId)
    return reply(env, chatId, topicId, "服务器未配置 GitHub OAuth（GITHUB_CLIENT_ID）。");

  const state = crypto.randomUUID().replace(/-/g, "");
  await env.KV.put(
    `state:${state}`,
    JSON.stringify({
      redirectTo: "/",
      telegramUserId,
      telegramChatId: chatId,
      expiresAt: Date.now() + 600_000,
    }),
    { expirationTtl: 600 },
  );
  const url = getOAuthURL(clientId, state);
  await reply(
    env,
    chatId,
    topicId,
    `点击链接授权 GitHub，即可用**本人身份**评论（10 分钟内有效）：\n${url}`,
  );
}

async function cmdLogout(env: Env, msg: TelegramMessage): Promise<void> {
  const chatId = chatIdOf(msg);
  const telegramUserId = userIdOf(msg);
  if (!chatId || !telegramUserId) return;
  const topicId = msg.message_thread_id != null ? String(msg.message_thread_id) : undefined;
  await removeTelegramLink(env.DB, telegramUserId);
  await reply(env, chatId, topicId, "已解绑你的 GitHub 账号。");
}

async function cmdComment(env: Env, msg: TelegramMessage, body: string): Promise<void> {
  const chatId = chatIdOf(msg);
  const telegramUserId = userIdOf(msg);
  if (!chatId || !telegramUserId) return;
  const topicId = msg.message_thread_id != null ? String(msg.message_thread_id) : undefined;

  const githubUserId = await getTelegramLink(env.DB, telegramUserId);
  if (!githubUserId) {
    return reply(env, chatId, topicId, "你还没有绑定 GitHub 账号，请先使用 /gh login。");
  }

  const source = msg.reply_to_message;
  const target = source ? extractTarget(source) : null;
  if (!target) {
    return reply(
      env,
      chatId,
      topicId,
      "找不到 issue / PR 链接，请在对应的 GitHub 通知消息上回复 /gh comment。",
    );
  }

  try {
    const { htmlUrl, login } = await commentAsUser(
      env.KV,
      githubUserId,
      target.owner,
      target.repo,
      target.number,
      body,
    );
    await reply(env, chatId, topicId, `已以 **@${login}** 身份评论：${htmlUrl}`);
  } catch (err) {
    await reply(env, chatId, topicId, errText(err));
  }
}

async function cmdMergeClose(env: Env, msg: TelegramMessage, op: "merge" | "close"): Promise<void> {
  const chatId = chatIdOf(msg);
  const telegramUserId = userIdOf(msg);
  if (!chatId || !telegramUserId) return;
  const topicId = msg.message_thread_id != null ? String(msg.message_thread_id) : undefined;

  const githubUserId = await getTelegramLink(env.DB, telegramUserId);
  if (!githubUserId) {
    return reply(env, chatId, topicId, "你还没有绑定 GitHub 账号，请先使用 /gh login。");
  }

  const source = msg.reply_to_message;
  const target = source ? extractTarget(source, true) : null;
  if (!target) {
    return reply(
      env,
      chatId,
      topicId,
      "找不到 PR 链接，请在对应的 GitHub PR 通知消息上回复 /gh merge 或 /gh close。",
    );
  }

  try {
    if (op === "merge") {
      await mergePullRequestAsUser(env.KV, githubUserId, target.owner, target.repo, target.number);
    } else {
      await closePullRequestAsUser(env.KV, githubUserId, target.owner, target.repo, target.number);
    }
    const label = op === "merge" ? "合并" : "关闭";
    await reply(
      env,
      chatId,
      topicId,
      `✅ 已${label} PR ${target.owner}/${target.repo}#${target.number}`,
    );
  } catch (err) {
    await reply(env, chatId, topicId, errText(err));
  }
}

/** Register the Telegram webhook to point at this worker (called from cron). */
export async function syncTelegramWebhook(env: Env): Promise<void> {
  const token = env.TELEGRAM_TOKEN;
  if (!token) return;
  const baseUrl = env.BASE_URL;
  if (!baseUrl) return;
  const secret = env.TELEGRAM_WEBHOOK_SECRET;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${baseUrl.replace(/\/$/, "")}/telegram/webhook`,
      secret_token: secret || undefined,
      allowed_updates: ["message"],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    log.error({ status: res.status, err }, "Failed to set Telegram webhook");
  }
}

/** Handle a single Telegram update (message). Called from the webhook route. */
export async function handleTelegramUpdate(env: Env, update: unknown): Promise<void> {
  const message = (update as { message?: TelegramMessage })?.message;
  if (!message?.text) return;

  const text = message.text.trim();
  const m = text.match(/^\/gh(?:\s+|$)(.*)$/s);
  if (!m) return;

  const rest = m[1].trim();
  const [sub, ...args] = rest.split(/\s+/);
  const body = args.join(" ").trim();

  switch (sub) {
    case "login":
      return cmdLogin(env, message);
    case "logout":
      return cmdLogout(env, message);
    case "comment":
      if (!body) {
        const chatId = chatIdOf(message);
        const topicId =
          message.message_thread_id != null ? String(message.message_thread_id) : undefined;
        if (chatId) await reply(env, chatId, topicId, "请附上评论内容：/gh comment 你的评论");
        return;
      }
      return cmdComment(env, message, body);
    case "merge":
      return cmdMergeClose(env, message, "merge");
    case "close":
      return cmdMergeClose(env, message, "close");
    default:
      log.info({ text }, "Unhandled /gh command from Telegram");
  }
}
