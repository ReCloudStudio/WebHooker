import { handleWebhookRequest } from "../lib/webhook";

export default defineEventHandler((event) => handleWebhookRequest(event));
