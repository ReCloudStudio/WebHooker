# Scheduled Tasks

WebHooker runs four maintenance tasks on the scheduled trigger (`*/5 * * * *`, every 5 minutes). They only run on the deployed worker (Cloudflare cron); local `wrangler dev` runs them when triggered via `wrangler dev --test-scheduled`.

| Task            | Purpose                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| `discord-sync`  | Registers the Discord slash/context-menu commands: per-guild (instant) and globally (24h dedup, ~1h propagation) |
| `telegram-sync` | Calls `setWebhook` to `{BASE_URL}/telegram/webhook` (with `TELEGRAM_WEBHOOK_SECRET` as `secret_token` when set)  |
| `audit-prune`   | Deletes `audit_logs` entries older than `AUDIT_RETENTION_DAYS` (default 90)                                      |
| `storage-prune` | Deletes expired `dedup_keys` rows, `delivery_state` rows older than 7 days and `message_tracking` rows older than 30 days |

There is nothing to configure beyond the secrets the tasks use (`DISCORD_TOKEN`, `DISCORD_APPLICATION_ID`, `TELEGRAM_TOKEN`, `BASE_URL`, `AUDIT_RETENTION_DAYS`).
