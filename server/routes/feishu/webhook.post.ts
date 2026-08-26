import { readRawBody } from "h3";
import { handleFeishuWebhookRequest } from "../../lib/drivers/feishu/updates";
import { cfEnv, rawRequest } from "../../lib/cf";

export default defineEventHandler(async (event) => {
  const source = rawRequest(event);
  const body = await readRawBody(event, "utf8");
  const request = new Request(source.url, {
    method: source.method,
    headers: source.headers,
    body,
  });
  return handleFeishuWebhookRequest(request, cfEnv(event));
});
