# Storage Layout

## KV Storage Layout

KV keeps only cache data and short-lived/ephemeral state. High-frequency writes (webhook dedup, delivery state, message tracking) live in D1 and only fall back to KV when D1 is unavailable or not yet migrated (see [Storage decisions](./storage#storage-decisions)).

| Key Pattern                                | Value                                                                         | TTL                |
| ------------------------------------------ | ----------------------------------------------------------------------------- | ------------------ |
| `config:routes`                            | Route config cache (D1 `d1_routes` is authoritative)                          | 1 hour             |
| `config:groups`                            | Group config cache (D1 `d1_groups` is authoritative)                          | 1 hour             |
| `session:{id}`                             | Admin session `{ userId, login }`                                             | 7 days             |
| `token:{userId}`                           | `{ userId, accessToken, expiresAt, refreshToken? }`                           | 0.9 × token expiry |
| `token-reverse:{sha256}`                   | User id for reverse lookup by token                                           | 0.9 × token expiry |
| `state:{hex}`                              | `{ redirectTo, expiresAt, discordUserId?, telegramUserId?, telegramChatId? }` | 600 seconds        |
| `invite:{token}`                           | `{ groupId, role, expiresAt, createdBy, note? }`                              | 7 days             |
| `invite:group:{id}`                        | Token index per group (keeps invite listing consistent)                       | 7 days             |
| `delivery:{provider}:{groupId}:{id}`       | Webhook delivery dedup fallback (D1 `dedup_keys` is primary)                  | 7 days             |
| `delivery-state:{provider}:{groupId}:{id}` | Queue delivery state fallback (D1 `delivery_state` is primary)                | 1 hour             |
| `queue:payload:{provider}:{groupId}:{id}`  | Oversized webhook payload parked for the queue consumer (R2 is primary)       | 1 hour             |
| `nonce:{nonce}`                            | Custom-webhook replay protection nonce (single use)                           | 600 seconds        |
| `tenant:{groupId}`                         | Per-group webhook secret (64-char hex, generated from the console)            | Permanent          |
| `msg:{routeId}:{key}:{target}`             | Message id tracking fallback (D1 `message_tracking` is primary)               | 1 day              |
| `cmd:guild:{id}`                           | Guild id whose commands were registered (dedup)                               | Permanent          |
| `cmd:registered:global`                    | Global command registration marker (dedup)                                    | 1 day              |
| `config:discord-app-id`                    | Cached Discord application id                                                 | Permanent          |
| `i18n:{lang}`                              | Translation overrides merged on top of English                                | Permanent          |

## D1 Storage Layout

The D1 database (`DB` binding, database `webhooker`) holds the source of truth for configuration, delivery logs and high-frequency ephemeral state:

| Table              | Purpose                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `d1_groups`        | Groups (authoritative config, seeded from legacy KV `config:groups`)                           |
| `d1_routes`        | Routes per group (authoritative config, seeded from legacy KV `config:routes`)                 |
| `send_logs`        | One row per dispatch attempt (route id, event, target, ok/error, duration, error code, detail) |
| `audit_logs`       | One row per admin operation (login/logout, group/route/member/invite changes)                  |
| `dedup_keys`       | Webhook delivery dedup (atomic `INSERT ... ON CONFLICT` UPSERT, key + expiry)                  |
| `delivery_state`   | Queue delivery state (`pending`/`processing`/`delivered`/`retrying`/`failed`/`dead`)           |
| `message_tracking` | Message id tracking for in-place updates (`event_id` + `target_id` → `message_id`)             |
| `discord_links`    | Maps `discord_user_id` → `github_user_id` for `/gh` Discord commands                           |
| `telegram_links`   | Maps `telegram_user_id` → `github_user_id` for `/gh` Telegram commands                         |

`audit_logs` is pruned by the scheduled trigger after `AUDIT_RETENTION_DAYS` (default 90). The `storage-prune` task removes expired `dedup_keys`, `delivery_state` rows older than 7 days and `message_tracking` rows older than 30 days. See [Logs](./logs) for the log row fields.

## R2 Storage Layout

R2 (`PAYLOAD` binding, bucket `webhooker-payloads`) stores oversized webhook payloads that are too large for a queue message or KV:

| Object Pattern                    | Purpose                                         | Retention              |
| --------------------------------- | ----------------------------------------------- | ---------------------- |
| `webhooks/YYYY/MM/DD/<uuid>.json` | Oversized payload parked for the queue consumer | deleted after dispatch |

When the `PAYLOAD` binding is absent, oversized payloads fall back to the KV key `queue:payload:{provider}:{groupId}:{id}` (1 hour TTL).

## Storage Decisions

- **D1 is authoritative** for config and delivery metadata; KV holds only caches and short-lived state.
- The `canUseD1` probe (`server/lib/storage/d1.ts`, checks for `prepare` + `batch`) gates every D1 store: when D1 is unavailable or not yet migrated, all three high-frequency stores (dedup, delivery state, message tracking) transparently fall back to KV so behavior is unchanged during migration.
- This keeps per-event KV writes near zero on the Workers Free plan (1,000 writes/day): dedup, delivery state and message tracking now write D1 rows instead (D1 Free allows 100,000 rows written/day).
- R2's free tier (10 GB-month storage, 1M Class A ops/month) comfortably absorbs payload parking without touching the KV write quota.
