import { log } from "./log";
import type { Env } from "./types";

interface ChannelInfo {
  id: string;
  name: string;
  type: number;
  guild_id?: string;
}

interface GuildInfo {
  id: string;
  name: string;
  channels: ChannelInfo[];
}

interface SendMessageBody {
  channelId: string;
  message: unknown;
  threadId?: string;
}

const DISCORD_API = "https://discord.com/api/v10";
const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";
const HEARTBEAT_INTERVAL_BUFFER = 5000;
const RECONNECT_DELAY = 5000;
const ALARM_INTERVAL = 30;

export class DiscordGateway {
  private state: DurableObjectState;
  private env: Env;
  private socket: WebSocket | null = null;
  private heartbeatInterval: number | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSequence: number | null = null;
  private sessionId: string | null = null;
  private guilds: Map<string, GuildInfo> = new Map();
  private token: string | null = null;
  private connecting = false;

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
        if (this.connecting || this.socket) {
          return new Response(JSON.stringify({ ok: true, status: "already_connected" }));
        }
        this.connect();
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
            guildCount: this.guilds.size,
          }),
        );
      }
      default:
        return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400 });
    }
  }

  private connect(): void {
    if (!this.token) return;
    this.connecting = true;

    try {
      this.socket = new WebSocket(GATEWAY_URL);

      this.socket.addEventListener("message", (event) => {
        this.handleMessage(event.data as string);
      });

      this.socket.addEventListener("close", () => {
        this.connecting = false;
        this.socket = null;
        this.clearHeartbeat();
        log.warn("Gateway disconnected, reconnecting...");
        setTimeout(() => this.connect(), RECONNECT_DELAY);
      });

      this.socket.addEventListener("error", (err) => {
        log.error({ err }, "Gateway WebSocket error");
      });
    } catch (err) {
      this.connecting = false;
      log.error({ err }, "Failed to connect to Gateway");
      setTimeout(() => this.connect(), RECONNECT_DELAY);
    }
  }

  private handleMessage(data: string): void {
    const msg = JSON.parse(data) as {
      op: number;
      d: unknown;
      s: number | null;
      t: string | null;
    };

    if (msg.s !== null) this.lastSequence = msg.s;

    switch (msg.op) {
      case 0:
        this.handleDispatch(msg.t!, msg.d);
        break;
      case 10:
        this.handleHello(msg.d as { heartbeat_interval: number });
        break;
      case 11:
        break;
      case 7:
        this.reconnect();
        break;
    }
  }

  private handleHello(d: { heartbeat_interval: number }): void {
    this.heartbeatInterval = d.heartbeat_interval;
    this.heartbeat();
    this.identify();
  }

  private heartbeat(): void {
    this.clearHeartbeat();
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    this.socket.send(JSON.stringify({ op: 1, d: this.lastSequence }));

    if (this.heartbeatInterval) {
      this.heartbeatTimer = setTimeout(
        () => this.heartbeat(),
        this.heartbeatInterval + HEARTBEAT_INTERVAL_BUFFER,
      );
    }
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private identify(): void {
    if (!this.socket || !this.token) return;
    this.socket.send(
      JSON.stringify({
        op: 2,
        d: {
          token: this.token,
          intents: 1 << 0,
        },
      }),
    );
  }

  private handleDispatch(event: string, data: unknown): void {
    const d = data as Record<string, unknown>;
    switch (event) {
      case "READY":
        this.sessionId = d.session_id as string;
        log.info({ user: (d.user as { username?: string })?.username }, "Gateway READY");
        break;
      case "GUILD_CREATE": {
        const guild = d as unknown as GuildInfo;
        this.guilds.set(guild.id, guild);
        break;
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
    setTimeout(() => this.connect(), RECONNECT_DELAY);
  }

  private findChannel(channelId: string): { channel: ChannelInfo | null; guild: GuildInfo | null } {
    for (const guild of this.guilds.values()) {
      const ch = guild.channels.find((c) => c.id === channelId);
      if (ch) return { channel: ch, guild };
    }
    return { channel: null, guild: null };
  }

  private async postMessage(
    channelId: string,
    message: unknown,
    threadId?: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const url = threadId
      ? `${DISCORD_API}/channels/${threadId}/messages`
      : `${DISCORD_API}/channels/${channelId}/messages`;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bot ${this.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        });

        if (res.status === 429) {
          const rateLimit = (await res.json()) as { retry_after?: number };
          const retryAfter = (rateLimit.retry_after ?? 1) * 1000;
          log.warn({ retryAfter, attempt }, "Rate limited");
          await new Promise((r) => setTimeout(r, retryAfter));
          continue;
        }

        if (!res.ok) {
          const err = await res.text();
          log.error({ status: res.status, err, channelId }, "Discord API error");
          return { ok: false, error: err };
        }

        return { ok: true };
      } catch (err) {
        log.error({ err, attempt, channelId }, "Failed to send message");
        if (attempt === 2) return { ok: false, error: String(err) };
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }

    return { ok: false, error: "Max retries exceeded" };
  }

  async alarm(): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      log.info("Alarm: restarting Gateway connection");
      this.connect();
    }
    await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL * 1000);
  }
}
