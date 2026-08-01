import { log } from "./log";

const DISCORD_API = "https://discord.com/api/v10";

export async function sendMessage(
  token: string,
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
          Authorization: `Bot ${token}`,
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
