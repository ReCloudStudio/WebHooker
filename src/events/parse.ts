import type { WebhookEvent } from "../types";

export function parseEvent(headers: Record<string, string>, body: string): WebhookEvent | null {
  const event = headers["x-github-event"];
  const signature = headers["x-hub-signature-256"];
  const deliveryId = headers["x-github-delivery"];

  if (!event) return null;

  try {
    const payload = JSON.parse(body);
    return { event, payload, signature, deliveryId };
  } catch {
    return null;
  }
}
