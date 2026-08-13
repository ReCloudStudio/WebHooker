import { handleInteractionRequest } from "../../lib/drivers/discord/interactions";
import { cfEnv } from "../../lib/cf";

export default defineEventHandler((event) =>
  handleInteractionRequest(event.web!.request!, cfEnv(event)),
);
