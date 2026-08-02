import { log } from "./log";
import { sendMessage } from "./discord-rest";
import {
  getOAuthURL,
  commentAsUser,
  getCommentAsUser,
  editCommentAsUser,
  deleteCommentAsUser,
  mergePullRequestAsUser,
  closePullRequestAsUser,
} from "./github-oauth";
import { getDiscordLink, removeDiscordLink } from "./token-store";
import type { Env } from "./types";

interface SendMessageBody {
  channelId: string;
  message: unknown;
  threadId?: string;
}

const DISCORD_API = "https://discord.com/api/v10";
const GATEWAY_URL = "https://gateway.discord.gg/?v=10&encoding=json";
const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 60_000;
const ALARM_INTERVAL = 30;

// Discord interaction protocol constants
const INTERACTION_TYPE = { COMMAND: 2, BUTTON: 3, MODAL_SUBMIT: 5 } as const;
const CALLBACK_TYPE = { MESSAGE: 4, DEFERRED_MESSAGE: 5, MODAL: 9 } as const;
const COMMAND_TYPE = { CHAT_INPUT: 1, MESSAGE: 3 } as const;
const OPTION_TYPE = { SUB_COMMAND: 1, SUB_COMMAND_GROUP: 2, STRING: 3 } as const;
const EPHEMERAL = 64;

// Right-click (message context-menu) command names → operation.
const MSG_CMD_ADD = "GitHub: 添加评论";
const MSG_CMD_EDIT = "GitHub: 编辑评论";
const MSG_CMD_DEL = "GitHub: 删除评论";

// Modal custom_id encodings (delimiter '|' never appears in owner/repo).
const MODAL_ADD = "ghc|add|"; // ghc|add|owner|repo|issueNumber
const MODAL_EDIT = "ghc|edit|"; // ghc|edit|owner|repo|commentId

// PR notification button custom_id encodings.
const BTN_MERGE = "ghpr|merge|"; // ghpr|merge|owner|repo|pullNumber
const BTN_CLOSE = "ghpr|close|"; // ghpr|close|owner|repo|pullNumber

const APP_COMMANDS = [
  {
    name: "gh",
    type: COMMAND_TYPE.CHAT_INPUT,
    description: "GitHub 集成",
    options: [
      {
        type: OPTION_TYPE.SUB_COMMAND,
        name: "login",
        description: "绑定你的 GitHub 账号以用本人身份评论",
      },
      { type: OPTION_TYPE.SUB_COMMAND, name: "logout", description: "解绑你的 GitHub 账号" },
      {
        type: OPTION_TYPE.SUB_COMMAND_GROUP,
        name: "comment",
        description: "对 issue/PR 评论进行增删改",
        options: [
          {
            type: OPTION_TYPE.SUB_COMMAND,
            name: "add",
            description: "在 issue/PR 下新增评论",
            options: [
              {
                type: OPTION_TYPE.STRING,
                name: "link",
                description: "issue/PR 链接",
                required: true,
              },
            ],
          },
          {
            type: OPTION_TYPE.SUB_COMMAND,
            name: "edit",
            description: "编辑一条评论",
            options: [
              {
                type: OPTION_TYPE.STRING,
                name: "link",
                description: "评论链接（含 #issuecomment-）",
                required: true,
              },
            ],
          },
          {
            type: OPTION_TYPE.SUB_COMMAND,
            name: "del",
            description: "删除一条评论",
            options: [
              {
                type: OPTION_TYPE.STRING,
                name: "link",
                description: "评论链接（含 #issuecomment-）",
                required: true,
              },
            ],
          },
        ],
      },
    ],
  },
  { name: MSG_CMD_ADD, type: COMMAND_TYPE.MESSAGE },
  { name: MSG_CMD_EDIT, type: COMMAND_TYPE.MESSAGE },
  { name: MSG_CMD_DEL, type: COMMAND_TYPE.MESSAGE },
];

// Comment link (has the comment id); check this BEFORE the plain issue regex.
const GITHUB_COMMENT_RE =
  /github\.com\/([^/\s]+)\/([^/\s]+)\/(?:issues|pull)\/\d+#issuecomment-(\d+)/;
const GITHUB_ISSUE_RE = /github\.com\/([^/\s]+)\/([^/\s]+)\/(?:issues|pull)\/(\d+)/;

export class DiscordGateway {
  private state: DurableObjectState;
  private env: Env;
  private socket: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: number | null = null;
  private lastSequence: number | null = null;
  private sessionId: string | null = null;
  private token: string | null = null;
  private connecting = false;
  private reconnectAttempt = 0;
  private applicationId: string | null = null;
  private registeredGuilds = new Set<string>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      action: string;
      token?: string;
    } & Record<string, unknown>;

    switch (body.action) {
      case "start": {
        this.token = body.token as string;
        await this.state.storage.put("token", this.token);
        if (this.connecting || this.socket) {
          return new Response(JSON.stringify({ ok: true, status: "already_connected" }));
        }
        await this.connect();
        await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL * 1000);
        return new Response(JSON.stringify({ ok: true }));
      }
      case "send": {
        const { channelId, message, threadId } = body as unknown as SendMessageBody;
        const result = await this.postMessage(channelId, message, threadId);
        return new Response(JSON.stringify(result));
      }
      case "status": {
        return new Response(
          JSON.stringify({
            connected: this.socket?.readyState === WebSocket.OPEN,
            sessionId: this.sessionId,
          }),
        );
      }
      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400 });
    }
  }

  private async connect(): Promise<void> {
    if (!this.token) return;
    if (this.connecting || this.socket) return;
    this.connecting = true;
    log.info("Connecting to Discord Gateway");

    try {
      const resp = await fetch(GATEWAY_URL, {
        headers: { Upgrade: "websocket" },
      });
      const ws = resp.webSocket;
      if (!ws) {
        this.connecting = false;
        log.error({ status: resp.status }, "Gateway did not return a WebSocket");
        this.scheduleReconnect();
        return;
      }

      ws.accept();
      this.socket = ws;
      this.connecting = false;

      ws.addEventListener("message", (event) => {
        this.handleMessage(event.data as string);
      });

      ws.addEventListener("close", (event) => {
        this.socket = null;
        this.clearHeartbeat();
        log.warn(
          { code: (event as CloseEvent).code, reason: (event as CloseEvent).reason },
          "Gateway disconnected, scheduling reconnect via alarm",
        );
        this.scheduleReconnect();
      });

      ws.addEventListener("error", (event) => {
        log.error(
          { err: String((event as ErrorEvent).message ?? event) },
          "Gateway WebSocket error",
        );
      });
    } catch (err) {
      this.connecting = false;
      log.error({ err: String(err) }, "Failed to connect to Gateway");
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(BASE_RECONNECT_DELAY * 2 ** this.reconnectAttempt, MAX_RECONNECT_DELAY);
    this.reconnectAttempt++;
    this.state.storage.setAlarm(Date.now() + delay);
  }

  private handleMessage(data: string): void {
    let msg: { op: number; d: unknown; s: number | null; t: string | null };
    try {
      msg = JSON.parse(data) as {
        op: number;
        d: unknown;
        s: number | null;
        t: string | null;
      };
    } catch {
      log.warn("Gateway received malformed frame");
      return;
    }

    if (msg.s !== null) this.lastSequence = msg.s;

    switch (msg.op) {
      case 0:
        this.reconnectAttempt = 0;
        this.handleDispatch(msg.t!, msg.d);
        break;
      case 1:
        // Heartbeat request from Discord — respond immediately
        this.sendHeartbeat();
        break;
      case 10:
        this.handleHello(msg.d as { heartbeat_interval: number });
        break;
      case 11:
        break;
      case 7:
        log.warn("Gateway requested reconnect (op 7)");
        this.reconnect();
        break;
      case 9:
        log.warn({ resumable: msg.d }, "Gateway Invalid Session (op 9)");
        this.lastSequence = null;
        this.sessionId = null;
        // Discord asks to wait 1-5s before a fresh identify
        setTimeout(() => this.identify(), 2000 + Math.floor(Math.random() * 3000));
        break;
    }
  }

  private handleHello(d: { heartbeat_interval: number }): void {
    log.info({ heartbeatInterval: d.heartbeat_interval }, "Gateway HELLO received");
    this.heartbeatInterval = d.heartbeat_interval;
    this.heartbeat();
    this.identify();
  }

  private heartbeat(): void {
    this.clearHeartbeat();
    this.sendHeartbeat();
    if (this.heartbeatInterval) {
      this.heartbeatTimer = setTimeout(() => this.heartbeat(), this.heartbeatInterval);
    }
  }

  private sendHeartbeat(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ op: 1, d: this.lastSequence }));
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private identify(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || !this.token) {
      log.warn(
        { hasSocket: !!this.socket, readyState: this.socket?.readyState ?? null },
        "Cannot identify",
      );
      return;
    }
    log.info("Sending IDENTIFY");
    this.socket.send(
      JSON.stringify({
        op: 2,
        d: {
          token: this.token,
          // GUILDS only — interactions are delivered regardless of intents,
          // and GUILDS lets us receive GUILD_CREATE to register slash commands.
          intents: 1 << 0,
          properties: {
            os: "linux",
            browser: "webhooker",
            device: "webhooker",
          },
        },
      }),
    );
  }

  private handleDispatch(event: string, data: unknown): void {
    const d = data as Record<string, unknown>;
    switch (event) {
      case "READY":
        this.sessionId = d.session_id as string;
        this.applicationId = (d.application as { id?: string })?.id ?? this.applicationId;
        log.info(
          { user: (d.user as { username?: string })?.username, appId: this.applicationId },
          "Gateway READY",
        );
        break;
      case "GUILD_CREATE": {
        const guildId = d.id as string | undefined;
        if (guildId) {
          this.registerGuildCommands(guildId).catch((err) =>
            log.error({ err: String(err), guildId }, "Failed to register guild commands"),
          );
        }
        break;
      }
      case "INTERACTION_CREATE":
        this.handleInteraction(d).catch((err) =>
          log.error({ err: String(err) }, "Interaction handler failed"),
        );
        break;
    }
  }

  private botToken(): string {
    return this.token ?? this.env.DISCORD_TOKEN ?? "";
  }

  /** Register the slash + message commands for a guild (instant availability). */
  private async registerGuildCommands(guildId: string): Promise<void> {
    if (!this.applicationId || this.registeredGuilds.has(guildId)) return;
    const res = await fetch(
      `${DISCORD_API}/applications/${this.applicationId}/guilds/${guildId}/commands`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bot ${this.botToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(APP_COMMANDS),
      },
    );
    if (res.ok) {
      this.registeredGuilds.add(guildId);
      log.info({ guildId }, "Registered guild application commands");
    } else {
      const err = await res.text();
      log.warn({ guildId, status: res.status, err }, "Command registration failed");
    }
  }

  private async handleInteraction(d: Record<string, unknown>): Promise<void> {
    const interaction = d as {
      id: string;
      token: string;
      type: number;
      guild_id?: string;
      channel_id?: string;
      member?: { user?: { id?: string } };
      user?: { id?: string };
      data?: Record<string, unknown>;
    };
    const userId = interaction.member?.user?.id ?? interaction.user?.id ?? null;
    const id = interaction.id;
    const token = interaction.token;

    if (interaction.type === INTERACTION_TYPE.BUTTON) {
      const data = interaction.data as {
        custom_id?: string;
        message?: { id?: string };
      };
      return this.handleButton(
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
        return this.commentOp(id, token, userId, op, source);
      }

      // Slash command /gh ...
      if (data.name === "gh" && data.type === COMMAND_TYPE.CHAT_INPUT) {
        const top = data.options?.[0];
        if (top?.name === "login") return this.cmdLogin(id, token, userId);
        if (top?.name === "logout") return this.cmdLogout(id, token, userId);
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
          return this.commentOp(id, token, userId, op, link);
        }
        return;
      }
      return;
    }

    if (interaction.type === INTERACTION_TYPE.MODAL_SUBMIT) {
      return this.modalSubmit(id, token, userId, interaction.data);
    }
  }

  /** Respond to an interaction with an ephemeral text message. */
  private async respond(id: string, token: string, content: string): Promise<void> {
    await this.interactionCallback(id, token, {
      type: CALLBACK_TYPE.MESSAGE,
      data: { content, flags: EPHEMERAL },
    });
  }

  private async interactionCallback(id: string, token: string, body: unknown): Promise<void> {
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
  private async updateOriginal(id: string, token: string, content: string): Promise<void> {
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
  private async handleButton(
    id: string,
    token: string,
    userId: string | null,
    channelId: string | undefined,
    messageId: string | undefined,
    customId: string | undefined,
  ): Promise<void> {
    if (!userId) return this.respond(id, token, "无法识别你的 Discord 账号。");
    const githubUserId = await getDiscordLink(this.env.KV, userId);
    if (!githubUserId) {
      return this.respond(id, token, "你还没有绑定 GitHub 账号，请先使用 `/gh login`。");
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
    await this.interactionCallback(id, token, {
      type: CALLBACK_TYPE.DEFERRED_MESSAGE,
      data: { flags: EPHEMERAL },
    });

    try {
      if (op === "merge") {
        await mergePullRequestAsUser(this.env.KV, githubUserId, owner, repo, Number(number));
      } else {
        await closePullRequestAsUser(this.env.KV, githubUserId, owner, repo, Number(number));
      }
      // Remove the buttons from the notification so nobody double-clicks.
      if (channelId && messageId) {
        await fetch(`${DISCORD_API}/channels/${channelId}/messages/${messageId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bot ${this.botToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ components: [] }),
        }).catch((err) => log.warn({ err: String(err) }, "Failed to strip PR buttons"));
      }
      const label = op === "merge" ? "合并" : "关闭";
      await this.updateOriginal(id, token, `✅ 已${label} PR ${owner}/${repo}#${number}`);
    } catch (err) {
      await this.updateOriginal(id, token, this.errText(err));
    }
  }

  private async cmdLogin(id: string, token: string, userId: string | null): Promise<void> {
    if (!userId) return this.respond(id, token, "无法识别你的 Discord 账号。");
    const clientId = this.env.GITHUB_CLIENT_ID;
    if (!clientId)
      return this.respond(id, token, "服务器未配置 GitHub OAuth（GITHUB_CLIENT_ID）。");

    const state = crypto.randomUUID().replace(/-/g, "");
    await this.env.KV.put(
      `state:${state}`,
      JSON.stringify({ redirectTo: "/", discordUserId: userId, expiresAt: Date.now() + 600_000 }),
      { expirationTtl: 600 },
    );
    const url = getOAuthURL(clientId, state);
    await this.respond(
      id,
      token,
      `点击链接授权 GitHub，即可用**本人身份**评论（仅你可见，10 分钟内有效）：\n${url}`,
    );
  }

  private async cmdLogout(id: string, token: string, userId: string | null): Promise<void> {
    if (!userId) return this.respond(id, token, "无法识别你的 Discord 账号。");
    await removeDiscordLink(this.env.KV, userId);
    await this.respond(id, token, "已解绑你的 GitHub 账号。");
  }

  /** Map a GitHub op error code to a user-facing (Chinese) message. */
  private errText(err: unknown): string {
    const t = err instanceof Error ? err.message : String(err);
    if (t === "GITHUB_TOKEN_EXPIRED")
      return "GitHub 授权已过期或无效，请重新使用 `/gh login` 绑定。";
    if (t === "GITHUB_FORBIDDEN") return "GitHub 拒绝了此操作：你的账号没有权限修改/删除这条评论。";
    if (t === "GITHUB_NOT_FOUND") return "找不到目标（可能评论已被删除或仓库不可访问）。";
    return `操作失败：${t}`;
  }

  /**
   * Unified entry for add/edit/del, from either a slash command (source = link
   * option) or a right-click message command (source = notification embed url).
   */
  private async commentOp(
    id: string,
    token: string,
    userId: string | null,
    op: "add" | "edit" | "del",
    source: string,
  ): Promise<void> {
    if (!userId) return this.respond(id, token, "无法识别你的 Discord 账号。");
    const githubUserId = await getDiscordLink(this.env.KV, userId);
    if (!githubUserId) {
      return this.respond(id, token, "你还没有绑定 GitHub 账号，请先使用 `/gh login`。");
    }

    if (op === "add") {
      const m = source.match(GITHUB_ISSUE_RE);
      if (!m)
        return this.respond(
          id,
          token,
          "找不到 issue / PR 链接（右键 issue/PR 通知，或用 link 传入链接）。",
        );
      return this.openCommentModal(
        id,
        token,
        `${MODAL_ADD}${m[1]}|${m[2]}|${m[3]}`,
        `评论 ${m[1]}/${m[2]}#${m[3]}`,
      );
    }

    // edit / del both need a specific comment id.
    const m = source.match(GITHUB_COMMENT_RE);
    if (!m) {
      return this.respond(
        id,
        token,
        "找不到评论链接（需含 `#issuecomment-...`，请右键某条评论通知，或粘贴评论链接）。",
      );
    }
    const [, owner, repo, commentId] = m;

    if (op === "del") {
      try {
        await deleteCommentAsUser(this.env.KV, githubUserId, owner!, repo!, Number(commentId));
        return this.respond(id, token, `已删除评论 ${owner}/${repo}#issuecomment-${commentId}。`);
      } catch (err) {
        return this.respond(id, token, this.errText(err));
      }
    }

    // edit: fetch current body to prefill the modal.
    let prefill = "";
    try {
      const { body } = await getCommentAsUser(
        this.env.KV,
        githubUserId,
        owner!,
        repo!,
        Number(commentId),
      );
      prefill = body;
    } catch (err) {
      return this.respond(id, token, this.errText(err));
    }
    return this.openCommentModal(
      id,
      token,
      `${MODAL_EDIT}${owner}|${repo}|${commentId}`,
      `编辑评论 #${commentId}`,
      prefill,
    );
  }

  /** Open a modal to collect/edit comment body. */
  private async openCommentModal(
    id: string,
    token: string,
    customId: string,
    title: string,
    prefill = "",
  ): Promise<void> {
    await this.interactionCallback(id, token, {
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

  private async modalSubmit(
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
    if (!body) return this.respond(id, token, "评论内容不能为空。");

    const githubUserId = await getDiscordLink(this.env.KV, userId);
    if (!githubUserId) {
      return this.respond(id, token, "你还没有绑定 GitHub 账号，请先使用 `/gh login`。");
    }

    // ghc|add|owner|repo|issueNumber
    if (customId.startsWith(MODAL_ADD)) {
      const [owner, repo, number] = customId.slice(MODAL_ADD.length).split("|");
      if (!owner || !repo || !number)
        return this.respond(id, token, "内部错误：无法解析目标 issue。");
      try {
        const { htmlUrl, login } = await commentAsUser(
          this.env.KV,
          githubUserId,
          owner,
          repo,
          Number(number),
          body,
        );
        return this.respond(id, token, `已以 **@${login}** 身份评论：${htmlUrl}`);
      } catch (err) {
        return this.respond(id, token, this.errText(err));
      }
    }

    // ghc|edit|owner|repo|commentId
    if (customId.startsWith(MODAL_EDIT)) {
      const [owner, repo, commentId] = customId.slice(MODAL_EDIT.length).split("|");
      if (!owner || !repo || !commentId)
        return this.respond(id, token, "内部错误：无法解析目标评论。");
      try {
        const { htmlUrl } = await editCommentAsUser(
          this.env.KV,
          githubUserId,
          owner,
          repo,
          Number(commentId),
          body,
        );
        return this.respond(id, token, `已更新评论：${htmlUrl}`);
      } catch (err) {
        return this.respond(id, token, this.errText(err));
      }
    }
  }

  private reconnect(): void {
    this.clearHeartbeat();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connecting = false;
    this.scheduleReconnect();
  }

  private async postMessage(
    channelId: string,
    message: unknown,
    threadId?: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const token = this.token ?? this.env.DISCORD_TOKEN;
    if (!token) return { ok: false, error: "Discord token is not configured" };
    return sendMessage(token, channelId, message, threadId);
  }

  async alarm(): Promise<void> {
    if (!this.token) {
      this.token = (await this.state.storage.get<string>("token")) ?? this.env.DISCORD_TOKEN ?? "";
    }
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      log.info("Alarm: restarting Gateway connection");
      await this.connect();
    }
    await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL * 1000);
  }
}
