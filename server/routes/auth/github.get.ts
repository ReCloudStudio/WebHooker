import { handleOAuthStart } from "../../lib/web/oauth";

export default defineEventHandler((event) => handleOAuthStart(event));
