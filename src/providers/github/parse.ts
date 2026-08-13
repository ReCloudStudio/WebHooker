import type { WebhookEvent } from "../../types";

export function parseEvent(headers: Record<string, string>, body: string): WebhookEvent | null {
  const event = headers["x-github-event"];
  const signature = headers["x-hub-signature-256"];
  const deliveryId = headers["x-github-delivery"];

  if (!event) return null;

  try {
    const payload = JSON.parse(body) as Record<string, unknown>;
    const installationId =
      typeof (payload.installation as { id?: unknown } | undefined)?.id === "number"
        ? (payload.installation as { id: number }).id
        : undefined;
    return { provider: "github", event, payload, signature, deliveryId, installationId };
  } catch {
    return null;
  }
}
