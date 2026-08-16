# WebHooker

GitHub / Gitea webhook → Discord / Telegram dispatcher. Receives webhook events via Cloudflare Workers, applies filters, and routes formatted messages to Discord channels/threads and Telegram chats/topics. Forge-specific adapters live under `server/lib/providers/` (GitHub + Gitea today; GitLab etc. can be added later).

## Features

- **28 event formatters** — push, pull_request, issues, issue_comment, workflow_run, workflow_job, status, deployment, deployment_status, check_run, check_suite, ping, release, create, delete, star, fork, pull_request_review, pull_request_review_comment, commit_comment, member, label, milestone, discussion, discussion_comment, repository, code_scanning_alert, dependabot_alert (+ generic fallback, + `custom` webhooks)
- **Multi-provider webhooks** — GitHub (`X-Hub-Signature-256`) and Gitea (`X-Gitea-Signature`) share one `/webhook` endpoint; the provider is auto-detected from headers
- **Per-group webhook ingress** — every group can get its own `POST /webhook/{groupId}` URL + secret (Gitea, classic GitHub webhooks, and arbitrary custom JSON posts signed with `X-WebHooker-Signature`, with optional timestamp+nonce replay protection)
- **GitHub App tenant isolation** — bind a group to a GitHub App installation id so only that org/user's events enter it
- HMAC-SHA256 signature verification (Web Crypto API)
- Filter by event type, repo, actor, action, branch, keyword (supports `*`/`?` globs and `/regex/`)
- Rich messages with color coding, author avatars, fields, and timestamps — rendered as Discord embeds and Telegram HTML
- Route to Discord channels/threads and Telegram chats/topics (multi-target routes)
- `workflow_run` / `check_run` progress is edited **in place** (single message updated as the run advances) on both platforms
- **Per-group webhook log channel** — point a group at a Discord channel/thread or Telegram chat/topic and every webhook the group's routes dispatch is summarized there (✅/❌ per route × target)
- GitHub OAuth for user actions (comment, edit comment, delete comment, merge, close, react)
- **Web UI config console** (`/admin`) — manage routes and groups with GitHub OAuth + admin whitelist, view send logs
- **Discord Interactions Endpoint** (Ed25519-verified) for `/gh` slash commands, message context-menu commands, PR merge/close buttons, and comment modals
- **Telegram `/gh` commands** (login/logout/comment/merge/close) via the Telegram webhook, with avatar link-preview cards
- Cloudflare KV for token/state/config/session storage + D1 for send logs and platform account links
- **Async delivery via Cloudflare Queues** — when the `QUEUE` binding is present, verified webhooks are enqueued to `webhooker-delivery` and dispatched by a consumer with exponential retry backoff (5s/30s/2m/10m) and a dead-letter queue (`webhooker-delivery-dlq`); oversized payloads are parked in KV. Without the binding, dispatch stays inline
- Graceful degradation (webhook-only mode if Discord unavailable)

## Architecture

```text
GitHub Webhook → Cloudflare Worker (Nuxt 4 / Nitro)
                 ├── POST /webhook → verify → dedup → enqueue (Queue) → dispatch → Discord (REST) / Telegram (Bot API)
                 ├── POST /discord/interactions → verify (Ed25519) → handle command/button/modal
                 ├── POST /telegram/webhook → verify (secret token) → handle /gh commands
                 ├── GET  /auth/github → OAuth flow
                 ├── GET  /api/richheader → Telegram avatar link-preview card
                 ├── POST /api/* → user actions (Bearer token auth)
                 ├── /admin → routes, groups & send logs Web UI
                 └── GET  /health → status check
```

- **Cloudflare Worker** — HTTP ingress, signature verification, routing, platform dispatch
- **Interactions Endpoint** — HTTPS callback (no Discord Gateway connection, no Durable Object); the bot stays offline and commands are registered via the API
- **KV** — token storage (`token:{userId}`), OAuth state (`state:{hex}`), route config (`config:routes`), group config (`config:groups`), admin sessions (`session:{id}`), delivery dedup (`delivery:{provider}:{groupId}:{id}`), delivery state (`delivery-state:*`), message-update tracking (`msg:*`)
- **D1** — send logs (`send_logs`), Discord↔GitHub links (`discord_links`), Telegram↔GitHub links (`telegram_links`)
- **Queue** — async delivery when `QUEUE` is bound: `webhooker-delivery` (exponential retry) + DLQ `webhooker-delivery-dlq`; oversized payloads parked in KV (`queue:payload:*`)

## Quick Start

```bash
bun install          # package manager is bun (lockfile: bun.lock)
cp .env.example .dev.vars   # Fill in secrets for local dev
bun run build        # Production build first (wrangler dev serves the built worker)
bunx wrangler dev    # Start local dev server
```

## Configuration

### Secrets (`.dev.vars` for local, Worker Secrets for production)

| Variable                    | Description                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| `GITHUB_WEBHOOK_SECRET`     | Webhook secret from GitHub                                                                     |
| `GITEA_WEBHOOK_SECRET`      | Webhook secret from Gitea (required only to receive Gitea webhooks)                            |
| `GITHUB_APP_ID`             | GitHub App ID (used by the App install flow to resolve the installing account)                 |
| `GITHUB_PRIVATE_KEY`        | App private key (PKCS#8 PEM; used by the App install flow; optional)                           |
| `GITHUB_CLIENT_ID`          | OAuth client ID                                                                                |
| `GITHUB_CLIENT_SECRET`      | OAuth client secret                                                                            |
| `DISCORD_TOKEN`             | Bot token                                                                                      |
| `DISCORD_PUBLIC_KEY`        | Discord application public key (from the Developer Portal) — required for interactions         |
| `DISCORD_APPLICATION_ID`    | Discord application id (optional; auto-resolved via `GET /oauth2/applications/@me` if omitted) |
| `TELEGRAM_TOKEN`            | Telegram bot token (from BotFather) — required for Telegram routes                             |
| `TELEGRAM_WEBHOOK_SECRET`   | Optional secret token for `POST /telegram/webhook` verification                                |
| `TELEGRAM_RICH_HEADER_HOST` | Optional base URL overriding the built-in `GET /api/richheader` for Telegram avatar cards      |
| `BASE_URL`                  | Public URL for OAuth callbacks and the Telegram webhook sync                                   |
| `ADMIN_USER_IDS`            | Comma-separated GitHub user IDs (or logins) allowed to access `/admin`                         |
| `ALLOW_SELF_SIGNUP`         | `1` to give access-less GitHub users a personal group on first login (default off)             |
| `AUDIT_RETENTION_DAYS`      | Audit-log retention in days for the scheduled cleanup (default 90)                             |
| `NUXT_PUBLIC_DOCS_URL`      | Optional docs site URL used by the landing page                                                |
| `NUXT_PUBLIC_REPO_URL`      | Optional GitHub repo URL used by the landing page                                              |
| `NUXT_PUBLIC_LEGAL_CONTACT` | Optional contact shown on `/terms` and `/privacy`                                              |

### Routes

Routes are stored in KV (`config:routes` as JSON). There are **no default routes** — every route (including its target) must be defined explicitly, either via the Web UI (`/admin`) or by storing a JSON array in KV. A route may carry multiple `targets`, so one rule can forward to several channels at once:

```json
[
  {
    "id": "all-push",
    "name": "Push Events",
    "enabled": true,
    "groupId": "default",
    "filters": [{ "type": "event", "match": "push" }],
    "stop": true,
    "targets": [
      { "platform": "discord", "channelId": "CHANNEL_ID" },
      { "platform": "telegram", "chatId": "-1001234567890" }
    ]
  }
]
```

`target.platform` selects the push target: `discord` (default) or `telegram`. Discord targets require `target.channelId` (optional `threadId` for a thread); Telegram targets require `target.chatId` (optional `topicId` for a topic). Routes belong to **groups** (KV `config:groups`) that scope admin access and can restrict which org/user events flow in. See the [Routes & Targets](https://webhooker.docs.worldexecute.me/guide/routes) and [Groups & Access Control](https://webhooker.docs.worldexecute.me/guide/groups) guides for the full schema.

### Web UI (`/admin`)

The built-in config console lets you manage routes and groups in the browser (add / edit / delete / toggle / reorder), inspect send logs, manage group members and invite links, and read the audit log — no KV access needed:

1. Set `ADMIN_USER_IDS` to the GitHub user IDs (or logins) allowed to manage the console, e.g. `ADMIN_USER_IDS=12345,RhenCloud`.
2. Visit `/admin` and sign in with GitHub. Users with no access get `403` — unless `ALLOW_SELF_SIGNUP=1` (they receive a personal group) or they follow a group invite link.
3. Changes are written to KV immediately and picked up by the webhook pipeline.

Sign out at `/admin/logout`. Every group has `members` with a role (`owner` / `admin` / `viewer`); all admin operations are recorded in the D1 `audit_logs` table.

### Filter Types

Every filter supports plain text, `*`/`?` globs, and `/regex/` patterns (case-insensitive); set `exclude: true` to invert. Filters can also be grouped into an AST via an optional `ast` on a route (`all` / `any` / `not` nodes) to express boolean combinations beyond the default AND-list. See the [Filter Tutorial](https://webhooker.docs.worldexecute.me/guide/filters) for the pattern syntax and the full filter reference.

## API

### Health

- `GET /health` — Returns `{"status": "ok"}`

### OAuth

- `GET /auth/github` — Start GitHub OAuth flow (redirects to GitHub)
- `GET /auth/github/callback` — OAuth callback (exchanges code for token; admin session / Discord link / Telegram link)
- `DELETE /auth/token/:userId` — Revoke user token

### Actions (require `Authorization: Bearer <token>` header)

- `POST /api/comment` — Create issue comment
- `POST /api/merge` — Merge pull request
- `POST /api/close` — Close pull request
- `POST /api/react` — Add reaction to issue

### Admin (require admin OAuth session)

- `GET /admin` — Config console UI
- `GET /admin/login` — Start admin sign-in (GitHub OAuth)
- `GET /admin/logout` — Sign out
- `GET /admin/invite?token=…` — Accept a group invite (browser page)
- `GET /admin/api/routes` — List routes
- `PUT /admin/api/routes` — Replace routes (owner/admin per group)
- `GET /admin/api/groups` — List groups + your role in each
- `PUT /admin/api/groups` — Replace groups (super: all; owner: own groups only)
- `GET /admin/api/groups/:groupId/routes` — List a group's routes
- `PUT /admin/api/groups/:groupId/routes` — Replace a group's routes
- `POST /admin/api/groups/:groupId/invites` — Create invite link (owner)
- `GET /admin/api/groups/:groupId/invites` — List pending invites (owner)
- `DELETE /admin/api/invites/:token` — Revoke an invite (owner)
- `GET /admin/api/audit` — Audit log (scoped)
- `GET /admin/api/me` — Current session / scope / roles
- `GET /admin/api/logs` — Send logs (scoped)
- `GET /admin/api/logs/:id` — Single send-log entry
- `GET /admin/api/metrics` — Delivery stats (totals, failure rate, per-platform/event/status, recent failures); optional `?groupId=` scope
- `GET /admin/api/delivery/:deliveryId` — All send-log attempts for one delivery

## Setup Guides

- **GitHub App** — create the app, subscribe to events, configure OAuth, and set the _Setup URL_ for tenant isolation: see [GitHub App Setup](https://webhooker.docs.worldexecute.me/guide/deployment#github-app-setup)
- **Discord bot** — create the bot, invite it with `applications.commands` (combined permission integer `274877910016`), and configure the Interactions Endpoint: see [Discord Bot Setup](https://webhooker.docs.worldexecute.me/guide/deployment#discord-bot-setup). The bot never connects to the Discord Gateway, so it shows as **offline** — messaging is unaffected (always REST).
- **Telegram bot** — create the bot with [@BotFather](https://t.me/BotFather), set `TELEGRAM_TOKEN` (optional `TELEGRAM_WEBHOOK_SECRET`); the webhook is synced automatically by the scheduled trigger: see [Telegram Bot Setup](https://webhooker.docs.worldexecute.me/guide/deployment#telegram-bot-setup)
- **Deployment** — KV namespace, D1 database + migrations, optional Queues, secrets, and deploy: see the [Deployment guide](https://webhooker.docs.worldexecute.me/guide/deployment)

### Bot Commands (comment on GitHub as yourself)

The bot registers native **slash** and **message context-menu** commands, synced by the scheduled trigger (every 5 minutes): per-guild for instant availability, and globally (24h dedup, ~1h propagation). After `/gh login` you can comment on issues/PRs as yourself, edit/delete your comments, and merge/close PRs via buttons — all replies are ephemeral and GitHub enforces permission.

```
/gh login  /gh logout
/gh comment add|edit|del  link:<url>      (or right-click a notification → Apps → GitHub: 添加/编辑/删除评论)
```

See the full reference in the [Bot Commands guide](https://webhooker.docs.worldexecute.me/guide/commands).

## Development

```bash
bun run dev           # Nuxt dev server (HMR)
bun run typecheck     # Type checking
bun run lint          # ESLint
bun test              # Unit tests
```

## Supported Events

28 event formatters (push, pull_request, issues, workflow_run, release, ...) plus `custom` webhooks; unsupported events fall back to a generic formatter. See the full table with embed highlights in [Supported Events](https://webhooker.docs.worldexecute.me/events/supported).

## License

MIT
