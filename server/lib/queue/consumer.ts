import type { Env, WebhookEvent, WebhookProvider } from "../types";
import { dispatchEvent } from "../core/dispatch";
import { loadConfig } from "../config";
import { loadGroups } from "../web/groups";
import { log } from "../lib/log";
import {
  DELIVERY_DLQ,
  type DeliveryMessage,
  classifyDelivery,
  deliveryStateKey,
  discardPayload,
  getDeliveryState,
  resolvePayload,
  retryDelay,
  setDeliveryState,
} from "./delivery";

export async function handleQueueBatch(
  batch: MessageBatch<DeliveryMessage>,
  env: Env,
): Promise<void> {
  for (const message of batch.messages) {
    const body = message.body;
    if (batch.queue === DELIVERY_DLQ) {
      await markDead(env, body);
      message.ack();
      continue;
    }
    await processMessage(env, body, message);
  }
}

async function processMessage(
  env: Env,
  body: DeliveryMessage,
  message: Message<DeliveryMessage>,
): Promise<void> {
  const key = deliveryStateKey(body.provider, body.groupId, body.deliveryId);
  const prior = await getDeliveryState(env, key);
  if (prior === "delivered" || prior === "dead") {
    message.ack();
    return;
  }

  await setDeliveryState(env, key, "processing");

  const payload = await resolvePayload(env, body);
  const event: WebhookEvent = {
    event: body.event,
    payload,
    deliveryId: body.deliveryId,
    provider: body.provider as WebhookProvider,
    installationId: body.installationId,
  };

  try {
    const config = await loadConfig(env);
    if (body.groupId) {
      config.routes = config.routes.filter((r) => r.groupId === body.groupId);
    }
    const groups = await loadGroups(env.KV);
    const summary = await dispatchEvent(config, event, env, groups);
    const { failed, retryable } = classifyDelivery(summary);

    if (!failed) {
      await setDeliveryState(env, key, "delivered");
      await discardPayload(env, body);
      message.ack();
      return;
    }
    if (retryable) {
      await setDeliveryState(env, key, "retrying");
      message.retry({ delaySeconds: retryDelay(message.attempts) });
      return;
    }
    await setDeliveryState(env, key, "failed");
    await discardPayload(env, body);
    message.ack();
  } catch (err) {
    log.error({ deliveryId: body.deliveryId, err }, "Queue delivery failed");
    await setDeliveryState(env, key, "retrying");
    message.retry({ delaySeconds: retryDelay(message.attempts) });
  }
}

async function markDead(env: Env, body: DeliveryMessage): Promise<void> {
  const key = deliveryStateKey(body.provider, body.groupId, body.deliveryId);
  await setDeliveryState(env, key, "dead");
  await discardPayload(env, body);
}
