import { log } from "../../lib/log";
import {
  getOAuthURL,
  commentAsUser,
  getCommentAsUser,
  editCommentAsUser,
  deleteCommentAsUser,
  mergePullRequestAsUser,
  closePullRequestAsUser,
} from "../../github/oauth";
import { getDiscordLink, removeDiscordLink } from "../../github/store";
import type { Env } from "../../types";
import { MSG_CMD_ADD, MSG_CMD_EDIT, MSG_CMD_DEL } from "./commands";

const DISCORD_API = "https://discord.com/api/v10";

// Discord interaction protocol constants
const INTERACTION_TYPE = { PING: 1, COMMAND: 2, BUTTON: 3, MODAL_SUBMIT: 5 } as const;
const CALLBACK_TYPE = { PONG: 1, MESSAGE: 4, DEFERRED_MESSAGE: 5, MODAL: 9 } as const;
const COMMAND_TYPE = { CHAT_INPUT: 1, MESSAGE: 3 } as const;
const EPHEMERAL = 64;

// Modal custom_id encodings (delimiter '|' never appears in owner/repo).
const MODAL_ADD = "ghc|add|"; // ghc|add|owner|repo|issueNumber
const MODAL_EDIT = "ghc|edit|"; // ghc|edit|owner|repo|commentId

// PR notification button custom_id encodings.
const BTN_MERGE = "ghpr|merge|"; // ghpr|merge|owner|repo|pullNumber
const BTN_CLOSE = "ghpr|close|"; // ghpr|close|owner|repo|pullNumber

// Comment link (has the comment id); check this BEFORE the plain issue regex.
const GITHUB_COMMENT_RE =
  /github\.com\/([^/\s]+)\/([^/\s]+)\/(?:issues|pull)\/\d+#issuecomment-(\d+)/;
const GITHUB_ISSUE_RE = /github\.com\/([^/\s]+)\/([^/\s]+)\/(?:issues|pull)\/(\d+)/;

interface Interaction {
  id: string;
  token: string;
  type: number;
  channel_id?: string;
  member?: { user?: { id?: string } };
  user?: { id?: string };
  data?: Record<string, unknown>;
}

const MAX_BODY_SIZE = 1024 * 1024;
const TIMESTAMP_TOLERANCE_SECONDS = 180;

function hexToBytes(hex: string): ArrayBuffer {
  const buffer = new ArrayBuffer(hex.length / 2);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return buffer;
}

/**
 * Verify an interaction's Ed25519 signature (X-Signature-Ed25519 over
 * timestamp + raw body, signed by the Discord application public key).
 */
export async function verifyDiscordSignature(
  publicKey: string,
  timestamp: string,
  signatureHex: string,
  rawBody: string,
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKey),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      hexToBytes(signatureHex),
      new TextEncoder().encode(timestamp + rawBody),
    );
  } catch (err) {
    log.warn({ err: String(err) }, "Failed to verify Discord signature");
    return false;
  }
}

/** Handle a POST to the Discord Interactions Endpoint. */
export async function handleInteractionRequest(request: Request, env: Env): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_SIZE) {
    return new Response("Request too large", { status: 413 });
  }

  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  if (!signature || !timestamp || !env.DISCORD_PUBLIC_KEY) {
    log.warn(
      { hasSig: !!signature, hasTs: !!timestamp, hasKey: !!env.DISCORD_PUBLIC_KEY },
      "Discord interaction missing signature",
    );
    return new Response("Invalid signature", { status: 401 });
  }
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > TIMESTAMP_TOLERANCE_SECONDS) {
    return new Response("Invalid signature", { status: 401 });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_SIZE) {
    return new Response("Request too large", { status: 413 });
  }

  const valid = await verifyDiscordSignature(env.DISCORD_PUBLIC_KEY, timestamp, signature, rawBody);
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  let interaction: Interaction;
  try {
    interaction = JSON.parse(rawBody) as Interaction;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Discord's connection check.
  if (interaction.type === INTERACTION_TYPE.PING) {
    return new Response(JSON.stringify({ type: CALLBACK_TYPE.PONG }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Handle the interaction via the callback webhook; respond 202 with no body
  // as required for interactions received over the HTTP endpoint.
  await handleInteraction(env, interaction).catch((err) =>
    log.error({ err: String(err) }, "Interaction handler failed"),
  );
  return new Response(null, { status: 202 });
}

async function handleInteraction(env: Env, interaction: Interaction): Promise<void> {
  const userId = interaction.member?.user?.id ?? interaction.user?.id ?? null;
  const id = interaction.id;
  const token = interaction.token;

  if (interaction.type === INTERACTION_TYPE.BUTTON) {
    const data = interaction.data as { custom_id?: string; message?: { id?: string } };
    return handleButton(
      env,
      id,
      token,
      userId,
      interaction.channel_id,
      data.message?.id,
      data.custom_id,
    );
  }

  if (interaction.type === INTERACTION_TYPE.COMMAND) {
    const data = interaction.data as {
      name?: string;
      type?: number;
      target_id?: string;
      options?: Array<{
        name: string;
        options?: Array<{
          name: string;
          value?: string;
          options?: Array<{ name: string; value?: string }>;
        }>;
      }>;
      resolved?: {
        messages?: Record<string, { embeds?: Array<{ url?: string }>; content?: string }>;
      };
    };

    // Right-click (message context-menu) commands.
    if (data.type === COMMAND_TYPE.MESSAGE) {
      const op =
        data.name === MSG_CMD_ADD
          ? "add"
          : data.name === MSG_CMD_EDIT
            ? "edit"
            : data.name === MSG_CMD_DEL
              ? "del"
              : null;
      if (!op) return;
      const target = data.target_id ? data.resolved?.messages?.[data.target_id] : undefined;
      const source = target?.embeds?.[0]?.url ?? target?.content ?? "";
      return commentOp(env, id, token, userId, op, source);
    }

    // Slash command /gh ...
    if (data.name === "gh" && data.type === COMMAND_TYPE.CHAT_INPUT) {
      const top = data.options?.[0];
      if (top?.name === "login") return cmdLogin(env, id, token, userId);
      if (top?.name === "logout") return cmdLogout(env, id, token, userId);
      if (top?.name === "comment") {
        const sub = top.options?.[0];
        const op =
          sub?.name === "add"
            ? "add"
            : sub?.name === "edit"
              ? "edit"
              : sub?.name === "del"
                ? "del"
                : null;
        if (!op) return;
        const link = sub?.options?.find((o) => o.name === "link")?.value ?? "";
        return commentOp(env, id, token, userId, op, link);
      }
      return;
    }
    return;
  }

  if (interaction.type === INTERACTION_TYPE.MODAL_SUBMIT) {
    return modalSubmit(env, id, token, userId, interaction.data);
  }
}

/** Respond to an interaction with an ephemeral text message. */
async function respond(env: Env, id: string, token: string, content: string): Promise<void> {
  await interactionCallback(env, id, token, {
    type: CALLBACK_TYPE.MESSAGE,
    data: { content, flags: EPHEMERAL },
  });
}

async function interactionCallback(
  env: Env,
  id: string,
  token: string,
  body: unknown,
): Promise<void> {
  const res = await fetch(`${DISCORD_API}/interactions/${id}/${token}/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    log.warn({ status: res.status, err }, "Interaction callback failed");
  }
}

/** Replace the deferred (ephemeral) response body with the final result. */
async function updateOriginal(env: Env, id: string, token: string, content: string): Promise<void> {
  const res = await fetch(`${DISCORD_API}/interactions/${id}/${token}/messages/@original`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const err = await res.text();
    log.warn({ status: res.status, err }, "Failed to update interaction response");
  }
}

/**
 * PR notification buttons: merge or close the PR as the clicker's linked
 * GitHub account. The clicker must have run `/gh login` first.
 */
async function handleButton(
  env: Env,
  id: string,
  token: string,
  userId: string | null,
  channelId: string | undefined,
  messageId: string | undefined,
  customId: string | undefined,
): Promise<void> {
  if (!userId) return respond(env, id, token, "无法识别你的 Discord 账号。");
  const githubUserId = await getDiscordLink(env.DB, userId);
  if (!githubUserId) {
    return respond(env, id, token, "你还没有绑定 GitHub 账号，请先使用 `/gh login`。");
  }

  let op: "merge" | "close";
  let rest: string;
  if (customId?.startsWith(BTN_MERGE)) {
    op = "merge";
    rest = customId.slice(BTN_MERGE.length);
  } else if (customId?.startsWith(BTN_CLOSE)) {
    op = "close";
    rest = customId.slice(BTN_CLOSE.length);
  } else {
    return;
  }

  const [owner, repo, number] = rest.split("|");
  if (!owner || !repo || !number) return;

  // Acknowledge first (deferred, ephemeral) so the clicker sees a spinner
  // while the GitHub API call runs.
  await interactionCallback(env, id, token, {
    type: CALLBACK_TYPE.DEFERRED_MESSAGE,
    data: { flags: EPHEMERAL },
  });

  try {
    if (op === "merge") {
      await mergePullRequestAsUser(env.KV, githubUserId, owner, repo, Number(number));
    } else {
      await closePullRequestAsUser(env.KV, githubUserId, owner, repo, Number(number));
    }
    // Remove the buttons from the notification so nobody double-clicks.
    if (channelId && messageId) {
      await fetch(`${DISCORD_API}/channels/${channelId}/messages/${messageId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bot ${env.DISCORD_TOKEN ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ components: [] }),
      }).catch((err) => log.warn({ err: String(err) }, "Failed to strip PR buttons"));
    }
    const label = op === "merge" ? "合并" : "关闭";
    await updateOriginal(env, id, token, `✅ 已${label} PR ${owner}/${repo}#${number}`);
  } catch (err) {
    await updateOriginal(env, id, token, errText(err));
  }
}

async function cmdLogin(env: Env, id: string, token: string, userId: string | null): Promise<void> {
  if (!userId) return respond(env, id, token, "无法识别你的 Discord 账号。");
  const clientId = env.GITHUB_CLIENT_ID;
  if (!clientId) return respond(env, id, token, "服务器未配置 GitHub OAuth（GITHUB_CLIENT_ID）。");

  const state = crypto.randomUUID().replace(/-/g, "");
  await env.KV.put(
    `state:${state}`,
    JSON.stringify({ redirectTo: "/", discordUserId: userId, expiresAt: Date.now() + 600_000 }),
    { expirationTtl: 600 },
  );
  const url = getOAuthURL(clientId, state);
  await respond(
    env,
    id,
    token,
    `点击链接授权 GitHub，即可用**本人身份**评论（仅你可见，10 分钟内有效）：\n${url}`,
  );
}

async function cmdLogout(
  env: Env,
  id: string,
  token: string,
  userId: string | null,
): Promise<void> {
  if (!userId) return respond(env, id, token, "无法识别你的 Discord 账号。");
  await removeDiscordLink(env.DB, userId);
  await respond(env, id, token, "已解绑你的 GitHub 账号。");
}

/** Map a GitHub op error code to a user-facing (Chinese) message. */
function errText(err: unknown): string {
  const t = err instanceof Error ? err.message : String(err);
  if (t === "GITHUB_TOKEN_EXPIRED") return "GitHub 授权已过期或无效，请重新使用 `/gh login` 绑定。";
  if (t === "GITHUB_FORBIDDEN") return "GitHub 拒绝了此操作：你的账号没有权限修改/删除这条评论。";
  if (t === "GITHUB_NOT_FOUND") return "找不到目标（可能评论已被删除或仓库不可访问）。";
  return `操作失败：${t}`;
}

/**
 * Unified entry for add/edit/del, from either a slash command (source = link
 * option) or a right-click message command (source = notification embed url).
 */
async function commentOp(
  env: Env,
  id: string,
  token: string,
  userId: string | null,
  op: "add" | "edit" | "del",
  source: string,
): Promise<void> {
  if (!userId) return respond(env, id, token, "无法识别你的 Discord 账号。");
  const githubUserId = await getDiscordLink(env.DB, userId);
  if (!githubUserId) {
    return respond(env, id, token, "你还没有绑定 GitHub 账号，请先使用 `/gh login`。");
  }

  if (op === "add") {
    const m = source.match(GITHUB_ISSUE_RE);
    if (!m)
      return respond(
        env,
        id,
        token,
        "找不到 issue / PR 链接（右键 issue/PR 通知，或用 link 传入链接）。",
      );
    return openCommentModal(
      env,
      id,
      token,
      `${MODAL_ADD}${m[1]}|${m[2]}|${m[3]}`,
      `评论 ${m[1]}/${m[2]}#${m[3]}`,
    );
  }

  // edit / del both need a specific comment id.
  const m = source.match(GITHUB_COMMENT_RE);
  if (!m) {
    return respond(
      env,
      id,
      token,
      "找不到评论链接（需含 `#issuecomment-...`，请右键某条评论通知，或粘贴评论链接）。",
    );
  }
  const [, owner, repo, commentId] = m;

  if (op === "del") {
    try {
      await deleteCommentAsUser(env.KV, githubUserId, owner!, repo!, Number(commentId));
      return respond(env, id, token, `已删除评论 ${owner}/${repo}#issuecomment-${commentId}。`);
    } catch (err) {
      return respond(env, id, token, errText(err));
    }
  }

  // edit: fetch current body to prefill the modal.
  let prefill = "";
  try {
    const { body } = await getCommentAsUser(env.KV, githubUserId, owner!, repo!, Number(commentId));
    prefill = body;
  } catch (err) {
    return respond(env, id, token, errText(err));
  }
  return openCommentModal(
    env,
    id,
    token,
    `${MODAL_EDIT}${owner}|${repo}|${commentId}`,
    `编辑评论 #${commentId}`,
    prefill,
  );
}

/** Open a modal to collect/edit comment body. */
async function openCommentModal(
  env: Env,
  id: string,
  token: string,
  customId: string,
  title: string,
  prefill = "",
): Promise<void> {
  await interactionCallback(env, id, token, {
    type: CALLBACK_TYPE.MODAL,
    data: {
      custom_id: customId,
      title: title.slice(0, 45),
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: "body",
              label: "评论内容",
              style: 2,
              required: true,
              max_length: 2000,
              value: prefill.slice(0, 2000) || undefined,
            },
          ],
        },
      ],
    },
  });
}

async function modalSubmit(
  env: Env,
  id: string,
  token: string,
  userId: string | null,
  data: unknown,
): Promise<void> {
  const d = data as {
    custom_id?: string;
    components?: Array<{ components?: Array<{ custom_id?: string; value?: string }> }>;
  };
  const customId = d.custom_id;
  if (!userId || !customId) return;

  const body = d.components?.[0]?.components?.find((c) => c.custom_id === "body")?.value?.trim();
  if (!body) return respond(env, id, token, "评论内容不能为空。");

  const githubUserId = await getDiscordLink(env.DB, userId);
  if (!githubUserId) {
    return respond(env, id, token, "你还没有绑定 GitHub 账号，请先使用 `/gh login`。");
  }

  // ghc|add|owner|repo|issueNumber
  if (customId.startsWith(MODAL_ADD)) {
    const [owner, repo, number] = customId.slice(MODAL_ADD.length).split("|");
    if (!owner || !repo || !number)
      return respond(env, id, token, "内部错误：无法解析目标 issue。");
    try {
      const { htmlUrl, login } = await commentAsUser(
        env.KV,
        githubUserId,
        owner,
        repo,
        Number(number),
        body,
      );
      return respond(env, id, token, `已以 **@${login}** 身份评论：${htmlUrl}`);
    } catch (err) {
      return respond(env, id, token, errText(err));
    }
  }

  // ghc|edit|owner|repo|commentId
  if (customId.startsWith(MODAL_EDIT)) {
    const [owner, repo, commentId] = customId.slice(MODAL_EDIT.length).split("|");
    if (!owner || !repo || !commentId)
      return respond(env, id, token, "内部错误：无法解析目标评论。");
    try {
      const { htmlUrl } = await editCommentAsUser(
        env.KV,
        githubUserId,
        owner,
        repo,
        Number(commentId),
        body,
      );
      return respond(env, id, token, `已更新评论：${htmlUrl}`);
    } catch (err) {
      return respond(env, id, token, errText(err));
    }
  }
}
