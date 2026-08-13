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
| `ALLOW_SELF_SIGNUP`         | When enabled (`1`/`true`), GitHub users without any group access get a personal group on first login instead of `403`       | Disabled                          |
| `AUDIT_RETENTION_DAYS`      | Audit-log retention in days for the scheduled cleanup                                                                       | `90`                              |

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

1. Configure `ADMIN_USER_IDS` with the GitHub user IDs allowed to manage everything. Logins are also accepted, e.g. `ADMIN_USER_IDS=12345,RhenCloud`. If unset, the console is disabled (unless `ALLOW_SELF_SIGNUP` is enabled).
2. Open `/admin` and sign in with GitHub.
3. Users without any access get `403`, except when `ALLOW_SELF_SIGNUP=1` (they receive a personal group) or when they follow a group [invite link](#invites).

### Endpoints

The console is served as an SPA at `/admin`; its tabs are deep-linkable via the URL path (`/admin/groups`, `/admin/logs`, `/admin/audit`). URLs outside `/admin` that do not match an endpoint below return a plain `404` instead of the console.

| Endpoint                                        | Description                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| `GET /admin`                                    | Config console UI                                                 |
| `GET /admin/login`                              | Start GitHub OAuth sign-in                                        |
| `GET /admin/logout`                             | Destroy session                                                   |
| `GET /admin/invite?token=…`                     | Accept a group invite (browser page)                              |
| `GET /admin/api/me`                             | Current session, scope, groups, and roles                         |
| `GET /admin/api/routes`                         | List routes (scoped to access)                                    |
| `PUT /admin/api/routes`                         | Replace routes (owner/admin per group)                            |
| `GET /admin/api/groups`                         | List groups + the signed-in user's role each                      |
| `PUT /admin/api/groups`                         | Replace groups (super: all; owner: own only)                      |
| `GET /admin/api/groups/:id/routes`              | List a group's routes                                             |
| `PUT /admin/api/groups/:id/routes`              | Replace a group's routes (owner/admin)                            |
| `PUT /admin/api/groups/:id/rename`              | Rename a group (owner); routes, webhook secret and invites follow |
| `GET /admin/api/logs`                           | Send logs (scoped to accessible routes)                           |
| `GET /admin/api/logs/:id`                       | Single send-log entry (scoped)                                    |
| `POST /admin/api/groups/:id/invites`            | Create an invite link (owner)                                     |
| `GET /admin/api/groups/:id/invites`             | List pending invites (owner)                                      |
| `DELETE /admin/api/invites/:token`              | Revoke an invite (owner)                                          |
| `GET /admin/api/audit`                          | Audit log (scoped to accessible groups)                           |
| `GET /admin/api/groups/:id/webhook`             | Group webhook endpoint info (owner)                               |
| `POST /admin/api/groups/:id/webhook/regenerate` | Generate/regenerate the group webhook secret (owner)              |
| `DELETE /admin/api/groups/:id/webhook`          | Disable the group webhook ingress (owner)                         |

The console lets you add, edit, delete, and toggle routes. Saved routes are written to KV `config:routes` immediately and the config cache is invalidated so the webhook pipeline picks them up on the next run.

## Webhook Endpoints

### Global endpoint (`POST /webhook`)

The legacy global endpoint verifies payloads against the operator's global secrets (`GITHUB_WEBHOOK_SECRET`, `GITEA_WEBHOOK_SECRET`) and dispatches into **all** routes. GitHub App installations deliver here; use `installationId` on groups to keep tenants isolated.

### Per-group endpoint (`POST /webhook/{groupId}`)

Every group can opt into its own webhook ingress with an independent secret (generated from the group page — Webhook endpoint panel, owner role). Payloads are verified against the **group's** secret instead of the global ones, and only that group's routes are eligible. This is how SaaS users configure Gitea, classic GitHub, or custom webhooks without sharing (or knowing) the operator's secrets.

- Supported for any provider: GitHub (`X-Hub-Signature-256`), Gitea (`X-Gitea-Signature`), custom (`X-WebHooker-Signature`)
- The secret is a 64-char hex string; regenerate from the console invalidates the old one immediately
- Delivery-id dedup keys are tenant-scoped (`delivery:{groupId}:{id}`)
- When the group has no secret (or no longer exists) the endpoint returns `404`

### Custom webhooks

Post arbitrary JSON to `POST /webhook/{groupId}` (or the global endpoint) with the body signed as `X-WebHooker-Signature: sha256=<hmac-sha256 hex of the raw body>` using the group's secret. The payload becomes a `custom` event that flows through the normal route pipeline — create a route with `event: custom` (there is a console template) and it dispatches to that route's targets, records `send_logs`, and appears in the group's webhook log channel.

Payload schema:

```json
{
  "title": "Deploy failed",
  "description": "Prod rollout failed at 12:03 UTC",
  "color": "red",
  "url": "https://ci.example.com/runs/42",
  "repo": "acme/widget",
  "author": {
    "name": "alice",
    "iconUrl": "https://…/alice.png",
    "url": "https://github.com/alice"
  },
  "fields": [{ "name": "Env", "value": "prod", "inline": true }],
  "footer": "my-monitor",
  "deliveryId": "alert-123"
}
```

| Field         | Type     | Description                                                                                                      |
| ------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `title`       | string   | Message title (falls back to "Custom message")                                                                   |
| `description` | string   | Optional message body                                                                                            |
| `color`       | string   | Optional embed color: a word (`red`, `green`, `yellow`, `blue`, `purple`, `orange`, `cyan`, `gray`) or `#rrggbb` |
| `url`         | string   | Optional link for the title                                                                                      |
| `repo`        | string   | Optional `owner/repo`; prefixes the title and is used as the footer                                              |
| `author`      | object   | Optional `{ name, iconUrl, url }`                                                                                |
| `fields`      | object[] | Optional embed fields `{ name, value, inline }`                                                                  |
| `footer`      | string   | Optional footer override                                                                                         |
| `deliveryId`  | string   | Optional id for sender-side dedup (retries)                                                                      |

### GitHub App tenant isolation

When the GitHub App is installed, its events arrive at the global endpoint for **every** installation. To keep tenants apart, bind each group to the installation id that should feed it: `"installationId": 12345678`. The id is visible in the App's installation webhook payload (`installation.id`) or on the GitHub App installation page URL. Events from any other installation are rejected for that group even if its `owners` list is empty. Groups without `installationId` keep the legacy behavior (`owners` filtering).

Binding is **auto-configured** — the GitHub App's _Setup URL_ should point to `{BASE_URL}/auth/github/install`. Right after a user installs the App, the browser lands there and they choose where the installation binds: a **new group** (`inst-{installationId}`, default) or any **existing group they own** (owner role checked again on submit; `POST /auth/github/install/bind` performs the provisioning). No manual id entry is needed. As a fallback (e.g. when the Setup URL is not configured), the `installation.created` webhook event creates/binds the group automatically — existing groups whose `owners` match the installing account are bound, otherwise a dedicated `inst-{installationId}` group is created. Then just add routes/members in the console.

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
  "members": [
    { "login": "rhencloud", "role": "owner" },
    { "login": "octobot", "role": "admin" },
    { "login": "reader", "role": "viewer" }
  ],
  "owners": ["myorg"],
  "providers": ["github", "gitea"],
  "installationId": 12345678,
  "logTarget": { "platform": "discord", "channelId": "123456789", "threadId": "987654321" }
}
```

| Field            | Type     | Required | Description                                                                                                                                                                                  |
| ---------------- | -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | string   | Yes      | Lowercase id (`a-z0-9`, `-`); referenced by each route's `groupId`. Editable: renaming a group re-points its routes, per-group webhook secret and pending invites                            |
| `name`           | string   | Yes      | Human-readable group name                                                                                                                                                                    |
| `members`        | object[] | No       | `{ login, role }` entries; role is `owner`, `admin`, or `viewer`                                                                                                                             |
| `adminIds`       | string[] | No       | Deprecated legacy field; treated as `members` with role `owner` when present                                                                                                                 |
| `owners`         | string[] | No       | Org/user logins whose events are accepted into this group; empty = all                                                                                                                       |
| `providers`      | string[] | No       | Source platforms allowed into this group (`github`, `gitea`); empty = all                                                                                                                    |
| `installationId` | number   | No       | GitHub App installation id bound to this group; only that installation's events are accepted (empty = all)                                                                                   |
| `emoji`          | boolean  | No       | Whether to include emoji in this group's messages (default `true`)                                                                                                                           |
| `lang`           | string   | No       | Message language for every route in this group (e.g. `en`, `zh`; custom via KV `i18n:<lang>`) — defaults to `en`                                                                             |
| `logTarget`      | object   | No       | Webhook log channel: a Discord `{ platform, channelId, threadId? }` or Telegram `{ platform, chatId, topicId? }` target that receives a summary of every webhook the group's routes dispatch |

### Roles

Every group member has one of three roles. Super admins (`ADMIN_USER_IDS`) always bypass them.

| Role     | View routes/logs | Edit routes | Manage members & invites | Edit group settings |
| -------- | ---------------- | ----------- | ------------------------ | ------------------- |
| `owner`  | ✓                | ✓           | ✓                        | ✓ (except `owners`) |
| `admin`  | ✓                | ✓           | ✗                        | ✗                   |
| `viewer` | ✓ (read-only)    | ✗           | ✗                        | ✗                   |

### Access Model

- **Super admins** (`ADMIN_USER_IDS`) see and edit every group and all routes; only they can edit a group's `owners` list.
- **Owners** manage their group's routes, members, invites, name, id, `emoji`, and `providers`. They cannot remove the last owner or demote themselves when no other owner remains.
- **Admins** edit routes inside their groups and view logs; **viewers** get a read-only console.
- Group admin endpoints operate on a single group at a time via `/admin/api/groups/:id/routes`; `groupId` is forced from the path parameter.
- The `owners` list restricts which event actors (sender logins) the group's routes will dispatch at all.
- The `providers` list restricts which forge's events (`github`, `gitea`) the group's routes will dispatch. This lets you keep GitHub and Gitea groups separate even when org/user names collide.

### Webhook Log Channel

A group may set `logTarget` to a Discord channel/thread or Telegram chat/topic. Whenever the group's routes dispatch a webhook, a single summary message is sent there: the event type/action, the repo, the delivery id, and one line per route×target with an ✅/❌ outcome (including the error for failed sends). The message is green when every dispatch succeeded and red when any failed. The summary uses the group's message language. Log messages are sent best-effort and are not themselves recorded in the D1 send log.

### Invites

Owners (and super admins) can create single-use invite links valid for 7 days from the group's _Members_ panel. Accepting an invite adds the user with the invited role (`admin` or `viewer` — never `owner`); an existing `viewer` is upgraded to `admin`. Invites are stored in KV as `invite:{token}`.

### Self Sign-up

With `ALLOW_SELF_SIGNUP=1`, a GitHub user who has no group access gets a personal group (`u-{userId}`, owned by them) on first login instead of a `403`. This is the entry point for a fully self-service SaaS install; disable it to keep the console invite-only.

## Filter Types

See the [Filter Tutorial](./filters) for a hands-on guide with worked examples.

| Type      | Matches              | Example                            |
| --------- | -------------------- | ---------------------------------- |
| `event`   | GitHub event name    | `push`, `pull_*`, `pull_request`   |
| `repo`    | Repository full name | `org/repo`, `org/*`                |
| `actor`   | Sender login         | `username`, `[bot]`, `*[bot]`      |
| `action`  | Event action         | `opened`, `closed`, `published`    |
| `branch`  | Branch name          | `main`, `feature-?`, `/^release-/` |
| `keyword` | Text in payload body | `deploy`, `/fix\s+\d+/`            |

### Filter Behavior

- All filters in a route must match for the route to trigger (AND logic)
- Set `"exclude": true` on any filter to invert it (NOT logic)
- Every filter type supports the same pattern forms: plain text, `*`/`?` **globs** (`*` = any run, `?` = one character), and `/regular expression/` — all case-insensitive
- Field filters (`event`/`repo`/`actor`/`action`/`branch`) glob-match the whole value; `keyword` globs and regexes search anywhere in the payload; plain `keyword` text is a substring search
- Patterns longer than 200 characters are not compiled as glob/regex; an invalid `//`-wrapped regex matches nothing
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
| `invite:{token}`               | `{ groupId, role, expiresAt, createdBy, note? }`                              | 7 days             |
| `invite:group:{id}`            | Token index per group (keeps invite listing consistent)                       | Permanent          |
| `delivery:{id}`                | Webhook delivery id (dedup marker)                                            | 300 seconds        |
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

`audit_logs` is pruned automatically by the scheduled trigger after `AUDIT_RETENTION_DAYS` (default 90).
