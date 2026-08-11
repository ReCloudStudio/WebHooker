# Configuration

## Secrets

WebHooker requires several secrets to function. For local development, store them in `.dev.vars`. For production, use Cloudflare Worker Secrets.

### Required Secrets

| Variable                | Description                                                              |
| ----------------------- | ------------------------------------------------------------------------ |
| `GITHUB_WEBHOOK_SECRET` | Webhook secret from your GitHub App settings                             |
| `GITEA_WEBHOOK_SECRET`  | Webhook secret from your Gitea instance (only to receive Gitea webhooks) |
| `GITHUB_CLIENT_ID`      | OAuth client ID from App settings                                        |
| `GITHUB_CLIENT_SECRET`  | OAuth client secret from App settings                                    |
| `DISCORD_TOKEN`         | Discord bot token                                                        |
| `TELEGRAM_TOKEN`        | Telegram bot token (from BotFather) — required for Telegram routes       |

> [!NOTE]
> `GITHUB_APP_ID` and `GITHUB_PRIVATE_KEY` are not currently used by the code — the
> OAuth flow only needs `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`. They are kept
> in the schema for compatibility in case GitHub App authentication is added later.

### Optional Secrets

| Variable                    | Description                                                                                                                 | Default                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `DISCORD_PUBLIC_KEY`        | Discord application public key (Developer Portal) — required for interactions                                               | Unset → interactions return `401` |
| `DISCORD_APPLICATION_ID`    | Discord application id; auto-resolved when omitted                                                                          | Auto-resolved                     |
| `TELEGRAM_WEBHOOK_SECRET`   | Secret token for `POST /telegram/webhook` verification (X-Telegram-Bot-Api-Secret-Token)                                    | Disabled (no verification)        |
| `TELEGRAM_RICH_HEADER_HOST` | Base URL of an external rich-header service; when unset, the built-in `GET /api/richheader` serves the Telegram avatar card | Built-in `/api/richheader`        |
| `BASE_URL`                  | Public URL for OAuth callbacks                                                                                              | `http://localhost:8787`           |
| `ADMIN_USER_IDS`            | Comma-separated GitHub user IDs (or logins) allowed to access the Web UI                                                    | Disabled                          |

## Webhook Providers

WebHooker ingests webhooks from multiple forges through the same `POST /webhook` endpoint; the provider is auto-detected from the request headers, so point every forge's webhook at `{BASE_URL}/webhook`.

| Provider | Event header     | Signature header      | Signature format           | Secret                  |
| -------- | ---------------- | --------------------- | -------------------------- | ----------------------- |
| GitHub   | `X-GitHub-Event` | `X-Hub-Signature-256` | `sha256=<hex>` HMAC-SHA256 | `GITHUB_WEBHOOK_SECRET` |
| Gitea    | `X-Gitea-Event`  | `X-Gitea-Signature`   | plain hex HMAC-SHA256      | `GITEA_WEBHOOK_SECRET`  |

Gitea payloads are normalized to the same internal shape as GitHub events, so routes, filters, and the 28 formatters work unchanged. Unknown or unmapped Gitea events fall back to the generic formatter. Repository/commit/user links are derived from the payload's `repository.html_url`, so they point at your Gitea instance.

## Web UI

WebHooker ships with a built-in config console at `/admin` for managing routes in the browser. It is protected by GitHub OAuth plus an admin whitelist.

### Setup

1. Configure `ADMIN_USER_IDS` with the GitHub user IDs allowed to manage routes. Logins are also accepted, e.g. `ADMIN_USER_IDS=12345,RhenCloud`. If unset, the console is disabled.
2. Open `/admin` and sign in with GitHub.
3. Only users in the whitelist receive a session cookie; everyone else gets `403`.

### Endpoints

| Endpoint                           | Description                             |
| ---------------------------------- | --------------------------------------- |
| `GET /admin`                       | Config console UI                       |
| `GET /admin/login`                 | Start GitHub OAuth sign-in              |
| `GET /admin/logout`                | Destroy session                         |
| `GET /admin/api/me`                | Current session, scope, and groups      |
| `GET /admin/api/routes`            | List routes (admin only)                |
| `PUT /admin/api/routes`            | Replace routes (admin only)             |
| `GET /admin/api/groups`            | List groups (scoped to access)          |
| `PUT /admin/api/groups`            | Replace groups (super admin only)       |
| `GET /admin/api/groups/:id/routes` | List a group's routes                   |
| `PUT /admin/api/groups/:id/routes` | Replace a group's routes                |
| `GET /admin/api/logs`              | Send logs (scoped to accessible routes) |
| `GET /admin/api/logs/:id`          | Single send-log entry (scoped)          |

The console lets you add, edit, delete, and toggle routes. Saved routes are written to KV `config:routes` immediately and the config cache is invalidated so the webhook pipeline picks them up on the next run.

## Routes

Routes define which events get forwarded to which channel (Discord or Telegram). They are stored in Cloudflare KV under the key `config:routes` as a JSON array.

There are **no default routes** — each route must define its own target. If no routes are configured, no events are forwarded.

### Route Schema

```json
{
  "id": "unique-route-id",
  "name": "Human-readable name",
  "enabled": true,
  "groupId": "my-group",
  "fallback": false,
  "stop": false,
  "discordRoleIds": ["111111111111111111"],
  "filters": [
    { "type": "event", "match": "push" },
    { "type": "repo", "match": "org/repo", "exclude": false }
  ],
  "targets": [
    {
      "platform": "discord",
      "channelId": "REQUIRED_CHANNEL_ID",
      "threadId": "OPTIONAL_THREAD_ID"
    }
  ]
}
```

Each entry of `targets` is a push destination, so one route can forward to several channels at once (e.g. a Discord channel **and** a Telegram group). `target.platform` selects the platform: `discord` (default) or `telegram`. For **Discord**, `target.channelId` is required (a thread in `target.threadId` is optional). For **Telegram**, `target.chatId` (the group/supergroup chat id, e.g. `-1001234567890`) is required and `target.topicId` (the `message_thread_id` of a topic, equivalent of a Discord thread) is optional. There is no fallback to a default channel.

### Discord Role Mentions

Set `discordRoleIds` on a route to ping one or more Discord roles (身份组) whenever that route fires. The mention (`<@&roleId>`) is prepended to the message content of every **Discord** target of the route; Telegram targets ignore this field. Mentions only trigger notifications when the bot has the `Mention Everyone` permission (or the role is marked mentionable), and the bot must be able to see the role.

```json
{
  "id": "release-notify",
  "name": "Notify on Release",
  "enabled": true,
  "groupId": "default",
  "discordRoleIds": ["111111111111111111", "222222222222222222"],
  "filters": [{ "type": "event", "match": "release" }],
  "targets": [{ "platform": "discord", "channelId": "REQUIRED_CHANNEL_ID" }]
}
```

You can add role ids in the admin console under _Discord role mentions_.

Other route fields:

| Field            | Type     | Required | Description                                                                                     |
| ---------------- | -------- | -------- | ----------------------------------------------------------------------------------------------- |
| `groupId`        | string   | Yes      | Id of the [group](#groups) this route belongs to                                                |
| `fallback`       | boolean  | No       | When `true`, fires only if no non-fallback route matched the event; its own filters are ignored |
| `stop`           | boolean  | No       | When `true` and this route matches, no further routes are evaluated for this event              |
| `lang`           | string   | No       | Message language override for this route (e.g. `en`, `zh`); defaults to the global setting      |
| `discordRoleIds` | string[] | No       | Discord role ids to ping when this route fires; applied to Discord targets only                 |

### Custom Route Example

```json
[
  {
    "id": "backend-prs",
    "name": "Backend PRs",
    "enabled": true,
    "groupId": "backend-team",
    "filters": [
      { "type": "repo", "match": "myorg/backend" },
      { "type": "event", "match": "pull_request" },
      { "type": "actor", "match": "[bot]", "exclude": true }
    ],
    "targets": [
      {
        "platform": "telegram",
        "chatId": "-1001234567890",
        "topicId": "9876543210"
      }
    ]
  }
]
```

## Groups

Routes belong to groups. Groups scope admin access and can restrict which events flow into them. They are stored in Cloudflare KV under the key `config:groups` as a JSON array.

### Group Schema

```json
{
  "id": "backend-team",
  "name": "Backend Team",
  "adminIds": ["rhencloud"],
  "owners": ["myorg"],
  "providers": ["github", "gitea"]
}
```

| Field       | Type     | Required | Description                                                               |
| ----------- | -------- | -------- | ------------------------------------------------------------------------- |
| `id`        | string   | Yes      | Lowercase id (`a-z0-9`, `-`); referenced by each route's `groupId`        |
| `name`      | string   | Yes      | Human-readable group name                                                 |
| `adminIds`  | string[] | Yes      | GitHub user IDs or logins who may manage this group's routes              |
| `owners`    | string[] | No       | Org/user logins whose events are accepted into this group; empty = all    |
| `providers` | string[] | No       | Source platforms allowed into this group (`github`, `gitea`); empty = all |
| `emoji`     | boolean  | No       | Whether to include emoji in this group's messages (default `true`)        |

### Access Model

- **Super admins** (`ADMIN_USER_IDS`) see and edit every group and all routes.
- **Group admins** (`adminIds`) only see and edit the groups they manage; submitting a route outside their groups returns `403`.
- Group admin endpoints operate on a single group at a time via `/admin/api/groups/:id/routes`; `groupId` is forced from the path parameter.
- The `owners` list restricts which event actors (sender logins) the group's routes will dispatch at all.
- The `providers` list restricts which forge's events (`github`, `gitea`) the group's routes will dispatch. This lets you keep GitHub and Gitea groups separate even when org/user names collide.

## Filter Types

See the [Filter Tutorial](./filters) for a hands-on guide with worked examples.

| Type      | Matches              | Example                          |
| --------- | -------------------- | -------------------------------- |
| `event`   | GitHub event name    | `push`, `pull_request`, `issues` |
| `repo`    | Repository full name | `org/repo`                       |
| `actor`   | Sender login         | `username`, `[bot]`              |
| `action`  | Event action         | `opened`, `closed`, `published`  |
| `branch`  | Branch name          | `main`, `develop`                |
| `keyword` | Text in payload body | `deploy`, `/fix\s+\d+/` (regex)  |

### Filter Behavior

- All filters in a route must match for the route to trigger (AND logic)
- Set `"exclude": true` on any filter to invert it (NOT logic)
- Non-keyword filters are **exact, case-insensitive matches** — no wildcards (`repo: "org/*"` does not match anything)
- `keyword` filter supports regex patterns — falls back to substring match if regex is invalid or longer than 200 characters
- `branch` filter works for push, pull_request, pull_request_review, pull_request_review_comment, create/delete, workflow_run, workflow_job, check_suite, deployment, and code_scanning_alert events

### Match Values

Filters accept either a single string or an array of strings:

```json
{ "type": "event", "match": "push" }
{ "type": "event", "match": ["push", "pull_request"] }
```

## KV Storage Layout

| Key Pattern                    | Value                                                                         | TTL                |
| ------------------------------ | ----------------------------------------------------------------------------- | ------------------ |
| `config:routes`                | JSON array of routes                                                          | Permanent          |
| `config:groups`                | JSON array of groups                                                          | Permanent          |
| `session:{id}`                 | Admin session `{ userId, login }`                                             | 7 days             |
| `token:{userId}`               | `{ userId, accessToken, expiresAt, refreshToken? }`                           | 0.9 × token expiry |
| `token-reverse:{sha256}`       | User id for reverse lookup by token                                           | 0.9 × token expiry |
| `state:{hex}`                  | `{ redirectTo, expiresAt, discordUserId?, telegramUserId?, telegramChatId? }` | 600 seconds        |
| `delivery:{id}`                | Webhook delivery id (dedup marker)                                            | 300 seconds        |
| `msg:{routeId}:{key}:{target}` | Message id tracking for in-place updates (e.g. `workflow_run`)                | 7 days             |
| `cmd:guild:{id}`               | Guild id whose commands were registered (dedup)                               | Permanent          |
| `cmd:registered:global`        | Global command registration marker (dedup)                                    | 1 day              |
| `config:discord-app-id`        | Cached Discord application id                                                 | Permanent          |
| `i18n:{lang}`                  | Translation overrides merged on top of English                                | Permanent          |

## D1 Storage Layout

The D1 database (`DB` binding, database `webhooker`) holds three tables:

| Table            | Purpose                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `send_logs`      | One row per dispatch attempt (route id, event, target, ok/error, duration, error code, detail) |
| `discord_links`  | Maps `discord_user_id` → `github_user_id` for `/gh` Discord commands                           |
| `telegram_links` | Maps `telegram_user_id` → `github_user_id` for `/gh` Telegram commands                         |
