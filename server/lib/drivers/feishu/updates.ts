import type { Env } from "../../types";
import { log } from "../../lib/log";
import {
  getOAuthURL,
  commentAsUser,
  mergePullRequestAsUser,
  closePullRequestAsUser,
} from "../../github/oauth";
import { getFeishuLink, removeFeishuLink } from "../../github/store";
import { getTenantAccessToken, sendText, updateCard } from "./rest";

const FEISHU_API = "https://open.feishu.cn";

const GITHUB_TARGET_RE = /github\.com\/([^/\s]+)\/([^/\s]+)\/(?:issues|pull)\/(\d+)/;
const BTN_PREFIX = "ghpr|";

interface FeishuSender {
  sender_id?: { open_id?: string; union_id?: string };
}
interface FeishuMessage {
  chat_id?: string;
  content?: string;
}
interface FeishuAction {
  action_id?: string;
  value?: { v?: string };
}
interface FeishuEvent {
  sender?: FeishuSender;
  message?: FeishuMessage;
  action?: FeishuAction;
  operator?: { operator_id?: { open_id?: string } };
  token?: string;
  open_message_id?: string;
}

function splitThree(rest: string): [string, string, string] {
  const parts = rest.split("|");
  const number = parts.pop() ?? "";
  const repo = parts.pop() ?? "";
  const owner = parts.pop() ?? "";
  return [owner, repo, number];
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSha256Base64(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  let binary = "";
  const bytes = new Uint8Array(sig);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binary);
}

export async function verifyFeishuSignature(
  appSecret: string,
  timestamp: string,
  nonce: string,
  body: string,
  signature: string,
): Promise<boolean> {
  const raw = `${timestamp}\n${nonce}\n${body}`;
  const computed = await hmacSha256Base64(appSecret, raw);
  return timingSafeEqual(computed, signature);
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes("GITHUB_TOKEN_EXPIRED")) return "GitHub 绑定已过期，请重新用 /gh login 绑定。";
    if (msg.includes("GITHUB_FORBIDDEN"))
      return "没有权限操作该仓库（GitHub 返回 403），请确认你的账号权限。";
    if (msg.includes("GITHUB_NOT_FOUND")) return "未找到对应的 GitHub 资源（404）。";
    return msg || "操作失败";
  }
  return "操作失败";
}

function extractTarget(text: string): { owner: string; repo: string; number: number } | null {
  const m = text.match(GITHUB_TARGET_RE);
  if (!m) return null;
  const number = Number(m[3] ?? "");
  if (!Number.isInteger(number)) return null;
  return { owner: m[1] ?? "", repo: m[2] ?? "", number };
}

async function replyToken(env: Env, chatId: string, text: string): Promise<void> {
  const tokenRes = await getTenantAccessToken(env);
  if (!tokenRes.ok || !tokenRes.token) {
    log.warn({ err: tokenRes.error }, "Feishu token unavailable for reply");
    return;
  }
  await sendText(tokenRes.token, chatId, text);
}

async function handleLogin(env: Env, openId: string, chatId: string): Promise<void> {
  const state = crypto.randomUUID();
  const pending = {
    redirectTo: "/admin",
    expiresAt: Date.now() + 10 * 60 * 1000,
    feishuUserId: openId,
    feishuChatId: chatId,
  };
  await env.KV.put(`state:${state}`, JSON.stringify(pending), { expirationTtl: 600 });
  const url = getOAuthURL(env.GITHUB_CLIENT_ID ?? "", state);
  await replyToken(
    env,
    chatId,
    [
      "点击下方链接绑定 GitHub 账号：",
      url,
      "绑定后可在飞书里用 /gh comment 评论、/gh merge 合并、/gh close 关闭 PR。",
    ].join("\n"),
  );
}

async function handleLogout(env: Env, openId: string, chatId: string): Promise<void> {
  const linked = await getFeishuLink(env.DB, openId);
  if (!linked) {
    await replyToken(env, chatId, "你还没有绑定 GitHub 账号。");
    return;
  }
  await removeFeishuLink(env.DB, openId);
  await replyToken(env, chatId, "已解绑 GitHub 账号。");
}

async function handleComment(
  env: Env,
  openId: string,
  chatId: string,
  text: string,
): Promise<void> {
  const githubUserId = await getFeishuLink(env.DB, openId);
  if (!githubUserId) {
    await replyToken(env, chatId, "请先 /gh login 绑定 GitHub 账号。");
    return;
  }
  const target = extractTarget(text);
  if (!target) {
    await replyToken(
      env,
      chatId,
      "请在消息里带上 PR/Issue 链接，例如：/gh comment https://github.com/o/r/pull/7 看起来不错",
    );
    return;
  }
  const ghIdx = text.indexOf("/gh");
  const rest = text.slice(ghIdx + 3).trim();
  const parts = rest.split(/\s+/);
  const linkIdx = parts.findIndex((p) => p.includes("github.com"));
  const body =
    parts
      .slice(linkIdx + 1)
      .join(" ")
      .trim() || "（来自飞书）";
  try {
    const res = await commentAsUser(
      env.KV,
      githubUserId,
      target.owner,
      target.repo,
      target.number,
      body,
    );
    await replyToken(env, chatId, `✅ 已评论：[查看](${res.htmlUrl})（@${res.login}）`);
  } catch (err) {
    await replyToken(env, chatId, `❌ ${describeError(err)}`);
  }
}

async function handleMergeOrClose(
  env: Env,
  openId: string,
  chatId: string,
  action: "merge" | "close",
  body: string,
): Promise<void> {
  const githubUserId = await getFeishuLink(env.DB, openId);
  if (!githubUserId) {
    await replyToken(env, chatId, "请先 /gh login 绑定 GitHub 账号。");
    return;
  }
  const target = extractTarget(body);
  if (!target) {
    await replyToken(
      env,
      chatId,
      action === "merge"
        ? "请在消息里带上 PR 链接，例如：/gh merge https://github.com/o/r/pull/7"
        : "请在消息里带上 PR 链接，例如：/gh close https://github.com/o/r/pull/7",
    );
    return;
  }
  try {
    if (action === "merge") {
      await mergePullRequestAsUser(env.KV, githubUserId, target.owner, target.repo, target.number);
    } else {
      await closePullRequestAsUser(env.KV, githubUserId, target.owner, target.repo, target.number);
    }
    await replyToken(
      env,
      chatId,
      `✅ 已${action === "merge" ? "合并" : "关闭"} ${target.owner}/${target.repo}#${target.number}`,
    );
  } catch (err) {
    await replyToken(env, chatId, `❌ ${describeError(err)}`);
  }
}

async function handleMessage(env: Env, event: FeishuEvent): Promise<void> {
  const sender = event.sender ?? {};
  const openId = sender.sender_id?.open_id ?? sender.sender_id?.union_id ?? "";
  const message = event.message ?? {};
  const chatId = message.chat_id ?? "";
  let text = "";
  if (message.content) {
    try {
      const content = JSON.parse(message.content) as { text?: string };
      text = content.text ?? "";
    } catch {
      text = "";
    }
  }
  const idx = text.indexOf("/gh");
  if (idx < 0) return;
  const rest = text.slice(idx + 3).trim();
  const sub = rest.split(/\s+/)[0] ?? "";
  switch (sub) {
    case "login":
      await handleLogin(env, openId, chatId);
      break;
    case "logout":
      await handleLogout(env, openId, chatId);
      break;
    case "comment":
      await handleComment(env, openId, chatId, text);
      break;
    case "merge":
      await handleMergeOrClose(env, openId, chatId, "merge", text);
      break;
    case "close":
      await handleMergeOrClose(env, openId, chatId, "close", text);
      break;
    default:
      await replyToken(
        env,
        chatId,
        "未知指令。可用：/gh login | logout | comment <链接> <内容> | merge <链接> | close <链接>",
      );
  }
}

function buildResultCard(ok: boolean, message: string): Record<string, unknown> {
  return {
    config: { wide_screen_mode: true },
    elements: [
      {
        tag: "div",
        text: { tag: "lark_md", content: ok ? `✅ ${message}` : `❌ ${message}` },
      },
    ],
  };
}

async function handleCardAction(env: Env, payload: Record<string, unknown>): Promise<void> {
  const event = (payload.event ?? {}) as FeishuEvent;
  const action = event.action ?? {};
  const actionId = action.action_id ?? action.value?.v ?? "";
  const openId = event.operator?.operator_id?.open_id ?? event.sender?.sender_id?.open_id ?? "";
  const cardToken = event.token ?? "";
  const openMessageId = event.open_message_id ?? "";

  if (!actionId.startsWith(BTN_PREFIX)) return;

  const isMerge = actionId.startsWith(`${BTN_PREFIX}merge|`);
  const isClose = actionId.startsWith(`${BTN_PREFIX}close|`);

  if (isMerge || isClose) {
    const [owner, repo, numberStr] = splitThree(actionId.slice(BTN_PREFIX.length));
    const number = Number(numberStr);
    if (!owner || !repo || !Number.isInteger(number)) {
      await replyCard(env, cardToken, buildResultCard(false, "无效的按钮数据"));
      return;
    }
    const githubUserId = await getFeishuLink(env.DB, openId);
    if (!githubUserId) {
      await replyCard(env, cardToken, buildResultCard(false, "请先 /gh login 绑定 GitHub 账号"));
      return;
    }
    try {
      if (isMerge) {
        await mergePullRequestAsUser(env.KV, githubUserId, owner, repo, number);
      } else {
        await closePullRequestAsUser(env.KV, githubUserId, owner, repo, number);
      }
      await replyCard(
        env,
        cardToken,
        buildResultCard(true, `${isMerge ? "已合并" : "已关闭"} ${owner}/${repo}#${number}`),
      );
    } catch (err) {
      await replyCard(env, cardToken, buildResultCard(false, describeError(err)));
    }
    return;
  }

  if (openMessageId) {
    await replyCard(env, cardToken, buildResultCard(false, "未知按钮"));
  }
}

async function replyCard(
  env: Env,
  cardToken: string,
  card: Record<string, unknown>,
): Promise<void> {
  const tokenRes = await getTenantAccessToken(env);
  if (!tokenRes.ok || !tokenRes.token) return;
  await updateCard(tokenRes.token, cardToken, card);
}

export async function handleFeishuWebhookRequest(request: Request, env: Env): Promise<Response> {
  const rawBody = await request.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const header = payload.header as Record<string, unknown> | undefined;
  const eventPart = payload.event as Record<string, unknown> | undefined;
  const type = (payload.type as string) ?? header?.event_type ?? eventPart?.type ?? "";

  if (type === "url_verification") {
    return Response.json({ challenge: (payload.challenge as string) ?? "" });
  }

  const appSecret = env.FEISHU_APP_SECRET?.trim() ?? "";
  const signature = request.headers.get("x-lark-signature") ?? "";
  const timestamp = request.headers.get("x-lark-timestamp") ?? "";
  const nonce = request.headers.get("x-lark-nonce") ?? "";
  if (appSecret && signature) {
    const ok = await verifyFeishuSignature(appSecret, timestamp, nonce, rawBody, signature);
    if (!ok) {
      log.warn("Feishu signature verification failed");
      return new Response("invalid signature", { status: 401 });
    }
  }

  const eventType = (header?.event_type as string) ?? eventPart?.type ?? type;
  try {
    if (eventType === "im.message.receive_v1" || eventType === "message") {
      await handleMessage(env, (payload.event ?? payload) as FeishuEvent);
    } else if (eventType === "card.action.trigger") {
      await handleCardAction(env, payload);
    }
  } catch (err) {
    log.error({ err }, "Feishu webhook handling failed");
  }

  return new Response("ok", { status: 200 });
}

export { FEISHU_API };
