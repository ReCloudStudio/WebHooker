import { handleOAuthCallback } from "../../../lib/web/oauth";

export default defineEventHandler((event) => handleOAuthCallback(event));
