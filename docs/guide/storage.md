# Storage Layout

## KV Storage Layout

| Key Pattern                    | Value                                                                         | TTL                |
| ------------------------------ | ----------------------------------------------------------------------------- | ------------------ |
| `config:routes`                | JSON array of routes                                                          | Permanent          |
| `config:groups`                | JSON array of groups                                                          | Permanent          |
| `session:{id}`                 | Admin session `{ userId, login }`                                             | 7 days             |
| `token:{userId}`               | `{ userId, accessToken, expiresAt, refreshToken? }`                           | 0.9 × token expiry |
| `token-reverse:{sha256}`       | User id for reverse lookup by token                                           | 0.9 × token expiry |
| `state:{hex}`                  | `{ redirectTo, expiresAt, discordUserId?, telegramUserId?, telegramChatId? }` | 600 seconds        |
| `invite:{token}`               | `{ groupId, role, expiresAt, createdBy, note? }`                              | 7 days             |
| `invite:group:{id}`            | Token index per group (keeps invite listing consistent)                       | Permanent          |
| `delivery:{id}`                | Webhook delivery id (dedup marker)                                            | 300 seconds        |
| `delivery:{groupId}:{id}`      | Tenant-scoped delivery dedup for the per-group webhook ingress                | 300 seconds        |
| `tenant:{groupId}`             | Per-group webhook secret (64-char hex, generated from the console)            | Permanent          |
| `msg:{routeId}:{key}:{target}` | Message id tracking for in-place updates (e.g. `workflow_run` / `check_run`)  | 7 days             |
| `cmd:guild:{id}`               | Guild id whose commands were registered (dedup)                               | Permanent          |
| `cmd:registered:global`        | Global command registration marker (dedup)                                    | 1 day              |
| `config:discord-app-id`        | Cached Discord application id                                                 | Permanent          |
| `i18n:{lang}`                  | Translation overrides merged on top of English                                | Permanent          |

## D1 Storage Layout

The D1 database (`DB` binding, database `webhooker`) holds four tables:

| Table            | Purpose                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `send_logs`      | One row per dispatch attempt (route id, event, target, ok/error, duration, error code, detail) |
| `audit_logs`     | One row per admin operation (login/logout, group/route/member/invite changes)                  |
| `discord_links`  | Maps `discord_user_id` → `github_user_id` for `/gh` Discord commands                           |
| `telegram_links` | Maps `telegram_user_id` → `github_user_id` for `/gh` Telegram commands                         |

`audit_logs` is pruned automatically by the scheduled trigger after `AUDIT_RETENTION_DAYS` (default 90). See [Logs](./logs) for the row fields.
