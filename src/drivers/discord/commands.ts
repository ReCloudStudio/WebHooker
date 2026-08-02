import { log } from "../../lib/log";
import type { Env } from "../../types";

const DISCORD_API = "https://discord.com/api/v10";

const COMMAND_TYPE = { CHAT_INPUT: 1, MESSAGE: 3 } as const;
const OPTION_TYPE = { SUB_COMMAND: 1, SUB_COMMAND_GROUP: 2, STRING: 3 } as const;

export const MSG_CMD_ADD = "GitHub: 添加评论";
export const MSG_CMD_EDIT = "GitHub: 编辑评论";
export const MSG_CMD_DEL = "GitHub: 删除评论";

export const APP_COMMANDS = [
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

export async function getApplicationId(env: Env): Promise<string | null> {
  if (env.DISCORD_APPLICATION_ID) return env.DISCORD_APPLICATION_ID;
  try {
    const cached = await env.KV.get("config:discord-app-id");
    if (cached) return cached;
  } catch {
    // fall through to the API
  }
  const token = env.DISCORD_TOKEN ?? "";
  if (!token) return null;
  const res = await fetch(`${DISCORD_API}/oauth2/applications/@me`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!res.ok) {
    log.warn({ status: res.status }, "Failed to fetch Discord application id");
    return null;
  }
  const app = (await res.json()) as { id?: string };
  if (app.id) {
    try {
      await env.KV.put("config:discord-app-id", app.id);
    } catch {
      // cache is best-effort
    }
    return app.id;
  }
  return null;
}

export async function registerGlobalCommands(env: Env): Promise<void> {
  const token = env.DISCORD_TOKEN ?? "";
  if (!token) return;
  try {
    if (await env.KV.get("cmd:registered:global")) return;
  } catch {
    // fall through and register
  }
  const appId = await getApplicationId(env);
  if (!appId) return;
  const res = await fetch(`${DISCORD_API}/applications/${appId}/commands`, {
    method: "PUT",
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(APP_COMMANDS),
  });
  if (res.ok) {
    try {
      await env.KV.put("cmd:registered:global", "1", { expirationTtl: 86400 });
    } catch {
      // best-effort
    }
    log.info("Registered global application commands");
  } else {
    const err = await res.text();
    log.warn({ status: res.status, err }, "Global command registration failed");
  }
}

export async function syncGuildCommands(env: Env): Promise<void> {
  const token = env.DISCORD_TOKEN ?? "";
  if (!token) return;
  const appId = await getApplicationId(env);
  if (!appId) return;
  const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!res.ok) {
    const err = await res.text();
    log.warn({ status: res.status, err }, "Failed to list guilds");
    return;
  }
  const guilds = (await res.json()) as Array<{ id: string }>;
  for (const guild of guilds) {
    try {
      if (await env.KV.get(`cmd:guild:${guild.id}`)) continue;
      const r = await fetch(`${DISCORD_API}/applications/${appId}/guilds/${guild.id}/commands`, {
        method: "PUT",
        headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(APP_COMMANDS),
      });
      if (r.ok) {
        await env.KV.put(`cmd:guild:${guild.id}`, "1");
        log.info({ guildId: guild.id }, "Registered guild application commands");
      } else {
        const err = await r.text();
        log.warn({ guildId: guild.id, status: r.status, err }, "Command registration failed");
      }
    } catch (err) {
      log.warn({ guildId: guild.id, err: String(err) }, "Command registration failed");
    }
  }
}

export async function syncCommands(env: Env): Promise<void> {
  if (!env.DISCORD_TOKEN) return;
  await registerGlobalCommands(env);
  await syncGuildCommands(env);
}
