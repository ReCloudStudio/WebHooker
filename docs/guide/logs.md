# Logs

## Send Logs (`send_logs`)

Every dispatch attempt is recorded in the D1 `send_logs` table and browsable in the console (**Logs** tab). Fields:

| Field        | Meaning                                                          |
| ------------ | ---------------------------------------------------------------- |
| `routeId`    | Route that matched                                               |
| `groupId`    | Route's group                                                    |
| `event`      | Event type (e.g. `push`, `pull_request`, `custom`)               |
| `repo`       | Repository full name (when present)                              |
| `target`     | Target id the message was sent to                                |
| `platform`   | `discord` or `telegram`                                          |
| `ok`         | Whether the send succeeded                                       |
| `status`     | HTTP status from the platform API (when applicable)              |
| `error`      | Error message (when failed)                                      |
| `errorCode`  | Stable error code (e.g. `NO_TARGET`, `NO_TOKEN`, `RATE_LIMITED`) |
| `attempts`   | Send attempts including retries                                  |
| `durationMs` | Time spent sending                                               |
| `deliveryId` | Webhook delivery id (when provided)                              |
| `messageId`  | Platform message id (used for in-place edits)                    |
| `actor`      | Sender login                                                     |
| `action`     | Event action (when present)                                      |
| `detail`     | Extra JSON details (when present)                                |

The console's **Logs** tab lists recent entries (filterable by group) and shows full details for a single entry. Entries are written best-effort — a failed insert never breaks dispatch.

## Audit Log (`audit_logs`)

Every admin operation is recorded in D1 `audit_logs` and browsable in the console (**Audit** tab): logins/logouts, group/route/member/invite changes, token revocations, installation bindings. Fields: timestamp, actor (GitHub id + login), action, target type/id, group id, ip, and detail JSON.

Entries are pruned automatically by the scheduled trigger after `AUDIT_RETENTION_DAYS` (default 90). Like send logs, writes are best-effort.

## Webhook Log Channel

Groups can additionally receive a per-webhook summary message in a Discord channel/thread or Telegram chat/topic — see [Groups → Webhook Log Channel](./groups#webhook-log-channel). These summaries are best-effort and are **not** recorded in `send_logs`.
