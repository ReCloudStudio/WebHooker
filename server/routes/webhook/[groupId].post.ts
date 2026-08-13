import { getRouterParam } from "h3";
import { handleWebhookRequest } from "../../lib/webhook";

export default defineEventHandler((event) =>
  handleWebhookRequest(event, getRouterParam(event, "groupId") ?? ""),
);
