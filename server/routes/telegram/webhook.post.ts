import { handleTelegramWebhookRequest } from "../../lib/drivers/telegram/updates";
import { cfEnv } from "../../lib/cf";

export default defineEventHandler((event) =>
  handleTelegramWebhookRequest(event.web!.request!, cfEnv(event)),
);
