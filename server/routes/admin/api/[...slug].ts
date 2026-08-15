import { defineEventHandler, getMethod, getRouterParam, setResponseStatus } from "h3";
import {
  adminApiMe,
  adminApiGroupsGet,
  adminApiGroupsPut,
  adminApiRoutesGet,
  adminApiRoutesPut,
  adminApiLogs,
  adminApiLogsById,
  adminGroupRoutesGet,
  adminGroupRoutesPut,
  adminGroupInvitesPost,
  adminGroupInvitesGet,
  adminInviteDelete,
  adminGroupRename,
  adminGroupWebhookGet,
  adminGroupWebhookRegenerate,
  adminGroupWebhookDelete,
  adminAudit,
  adminApiMetrics,
  adminApiDelivery,
} from "../../../lib/web/admin";

export default defineEventHandler((event) => {
  const method = getMethod(event);
  const seg = (getRouterParam(event, "slug") ?? "").split("/").filter(Boolean);

  if (seg[0] === "me" && method === "GET") return adminApiMe(event);
  if (seg[0] === "groups" && seg.length === 1) {
    if (method === "GET") return adminApiGroupsGet(event);
    if (method === "PUT") return adminApiGroupsPut(event);
  }
  if (seg[0] === "routes" && seg.length === 1) {
    if (method === "GET") return adminApiRoutesGet(event);
    if (method === "PUT") return adminApiRoutesPut(event);
  }
  if (seg[0] === "logs" && seg.length === 1 && method === "GET") return adminApiLogs(event);
  if (seg[0] === "logs" && seg.length === 2 && method === "GET")
    return adminApiLogsById(event, Number(seg[1]));
  if (seg[0] === "groups" && seg[2] === "routes" && seg.length === 3) {
    if (method === "GET") return adminGroupRoutesGet(event, seg[1]);
    if (method === "PUT") return adminGroupRoutesPut(event, seg[1]);
  }
  if (seg[0] === "groups" && seg[2] === "invites" && seg.length === 3) {
    if (method === "GET") return adminGroupInvitesGet(event, seg[1]);
    if (method === "POST") return adminGroupInvitesPost(event, seg[1]);
  }
  if (seg[0] === "invites" && seg.length === 2 && method === "DELETE")
    return adminInviteDelete(event, seg[1]);
  if (
    seg[0] === "groups" &&
    seg[2] === "rename" &&
    seg.length === 3 &&
    (method === "POST" || method === "PUT")
  )
    return adminGroupRename(event, seg[1]);
  if (
    seg[0] === "groups" &&
    seg[2] === "webhook" &&
    seg[3] === "regenerate" &&
    seg.length === 4 &&
    method === "POST"
  )
    return adminGroupWebhookRegenerate(event, seg[1]);
  if (seg[0] === "groups" && seg[2] === "webhook" && seg.length === 3) {
    if (method === "GET") return adminGroupWebhookGet(event, seg[1]);
    if (method === "DELETE") return adminGroupWebhookDelete(event, seg[1]);
  }
  if (seg[0] === "audit" && seg.length === 1 && method === "GET") return adminAudit(event);
  if (seg[0] === "metrics" && seg.length === 1 && method === "GET") return adminApiMetrics(event);
  if (seg[0] === "delivery" && seg.length === 2 && method === "GET")
    return adminApiDelivery(event, seg[1]);

  setResponseStatus(event, 404);
  return { error: "Not found" };
});
