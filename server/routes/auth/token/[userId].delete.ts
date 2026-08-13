import { getRouterParam } from "h3";
import { handleTokenDelete } from "../../../lib/web/oauth";

export default defineEventHandler((event) =>
  handleTokenDelete(event, getRouterParam(event, "userId") ?? ""),
);
