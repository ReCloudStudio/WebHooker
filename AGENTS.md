# AGENTS.md — WebHooker

## Project Purpose

Cloudflare Worker that receives GitHub webhooks and dispatches processed events to Discord channels/threads and Telegram chats/topics, and receives Discord interactions (slash commands, buttons, modals) via the Interactions Endpoint plus Telegram bot `/gh` commands via the Telegram webhook.

Core pipeline: GitHub Webhook → Worker (verify + filter + format) → Discord (REST) / Telegram (Bot API)

## Key Decisions

- Runtime: Cloudflare Workers
- HTTP framework: Hono
- Discord interactions: HTTPS Interactions Endpoint (`POST /discord/interactions`, Ed25519-signed) — no Discord Gateway / Durable Object; bot stays offline, messages always sent via REST
- Storage: Cloudflare KV (tokens, OAuth state, route config `config:routes`, group config `config:groups`, admin sessions, delivery dedup, message-update tracking `msg:*`, i18n overrides `i18n:*`) + D1 (`send_logs`, `discord_links`, `telegram_links`)
- Signature verification: Web Crypto API (HMAC-SHA256 for GitHub/Gitea, Ed25519 for Discord, timing-safe secret-token compare for Telegram)
- Webhook providers: pluggable forge adapters under `src/providers/` (github, gitea) — each verifies its own signature format and normalizes its payload to a GitHub-shaped `WebhookEvent`; a `custom` provider accepts arbitrary signed JSON posts (`X-WebHooker-Signature`) as `custom` events; GitLab etc. can be added later
- Per-group webhook ingress: optional `POST /webhook/{groupId}` with a per-group secret in KV (`tenant:{groupId}`) — Gitea/classic-GitHub/custom webhooks are verified against the group's secret instead of the operator's global ones; only that group's routes fire. The legacy `POST /webhook` (global secrets, all routes) stays untouched
- GitHub App tenant isolation: `Group.installationId` binds a group to one GitHub App installation; events whose `payload.installation.id` differs are rejected at dispatch (hard isolation on top of the optional `owners` list). `installation.created` events auto-provision: a dedicated `inst-{installationId}` group is created, or existing groups whose `owners` match the installing account get bound automatically
- GitHub OAuth: octokit (token is stored hashed for reverse lookup)
- Admin WebUI: `/admin` config console, OAuth-session protected via `ADMIN_USER_IDS` whitelist
- Access control: every group has role-based members (`owner` / `admin` / `viewer`); super admins bypass; legacy `adminIds` are read as owners (backward compatible); owners manage members + invites; `owners` field stays super-only
- Invites: single-use 7-day links (`invite:{token}`) for joining a group as admin/viewer; `ALLOW_SELF_SIGNUP=1` gives access-less users a personal group on first login (self-service SaaS entry)
- Audit log: every admin operation (logins, group/route/member/invite changes) recorded in D1 `audit_logs`; pruned by the scheduled trigger after `AUDIT_RETENTION_DAYS` (default 90)
- Group webhook log channel: optional `Group.logTarget` (Discord channel/thread or Telegram chat/topic) receives one summary message per webhook the group's routes dispatched (event, repo, delivery id, per route×target ✅/❌ outcome, green/red color); best-effort, not recorded in `send_logs`
- Local dev: wrangler + Miniflare

## Architecture

```text
src/
├── index.ts              # CF Workers entry (fetch + scheduled), scheduled = Discord command sync + Telegram webhook sync
├── types.ts              # Env, Config, Route, Filter, Group, WebhookEvent, NeutralMessage
├── config.ts             # loadRoutes/saveRoutes (KV config:routes, cache w/ 60s TTL), loadConfig from env
├── server.ts             # Hono app: /health, /webhook, /webhook/:groupId, /discord/interactions, /telegram/webhook, mounts /auth, /admin + /
├── webhook.ts            # processWebhook/handleWebhook: tenant lookup, provider detect/verify/parse, dedup, scoped dispatch
├── core/
│   └── dispatch.ts       # Platform-neutral dispatch: match routes → formatEvent → driver.send/edit (recordSend + group filter + per-group webhook log)
├── events/               # Provider-agnostic route matching
│   └── match.ts          # matchRoute, eventOwners, extractBranch, keyword regex filtering
├── providers/            # Forge webhook providers (verify + parse/normalize to GitHub-shaped events)
│   ├── types.ts          # Provider interface (matches/verify/parse)
│   ├── hmac.ts           # HMAC-SHA256 + timing-safe compare helpers
│   ├── index.ts          # detectProvider() registry (gitea, github, custom)
│   ├── github/           # X-GitHub-Event + X-Hub-Signature-256 ("sha256=" prefix); extracts installation.id
│   │   ├── verify.ts     # HMAC signature verify
│   │   └── parse.ts      # parseEvent (headers + body → WebhookEvent)
│   ├── gitea/            # X-Gitea-Event + X-Gitea-Signature (plain hex HMAC)
│   │   ├── verify.ts     # HMAC signature verify (no prefix)
│   │   └── parse.ts      # parse + normalize Gitea payloads to GitHub shape
│   └── custom/           # X-WebHooker-Signature (sha256= HMAC) + arbitrary JSON → `custom` events
│       └── index.ts      # matches/verify/parse for non-forge senders
├── formatters/           # Platform-neutral message formatters (was formatter.ts)
│   ├── index.ts          # formatEvent: 29-event switch → NeutralMessage + re-exports
│   ├── colors.ts         # GITHUB_COLORS + WORKFLOW_CONCLUSION_EMOJI
│   ├── helpers.ts        # emojiPrefix, T, buildMessage
│   └── *.ts              # push, pull-request, issues, comments, workflow, release, create,
│                         # repo, check, review, commit-comment, deployment, member, label,
│                         # milestone, discussion, repository, security, generic, ping, custom
├── drivers/              # Platform drivers (pluggable push targets)
│   ├── types.ts          # PlatformDriver interface + SendResult (send + edit)
│   ├── index.ts          # getDriver() registry (discord default + telegram)
│   ├── discord/
│   │   ├── index.ts      # DiscordDriver: send/edit → renderNeutralMessage + rest.sendMessage/editMessage
│   │   ├── render.ts     # renderNeutralMessage: NeutralMessage → Discord FormattedMessage
│   │   ├── rest.ts       # Discord REST sendMessage/editMessage with retry + rate-limit handling
│   │   ├── interactions.ts # Ed25519 verify + interaction handlers (/gh, buttons, modals)
│   │   └── commands.ts   # APP_COMMANDS + registerGlobalCommands/syncGuildCommands/syncCommands
│   └── telegram/
│       ├── index.ts      # TelegramDriver: send/edit → renderNeutralMessage + rest.sendMessage (avatar rich-header card)
│       ├── render.ts     # renderNeutralMessage: NeutralMessage → Telegram HTML (parse_mode HTML)
│       ├── rest.ts       # Telegram Bot API sendMessage/sendPhoto/editMessage* (chat_id + message_thread_id), retry
│       ├── updates.ts    # POST /telegram/webhook: secret-token verify + handleTelegramUpdate
│       └── commands.ts   # Telegram /gh login|logout|comment|merge|close + reply-message parsing + syncTelegramWebhook
├── github/
│   ├── oauth.ts          # OAuth URL, callback token exchange, getUserOctokit, comment/getComment/editComment/deleteComment/merge/close actions
│   └── store.ts          # KV token CRUD + D1 discord-link/telegram-link mapping (was token-store.ts)
├── web/                  # HTTP UI/API routes
│   ├── oauth-routes.ts   # GET /auth/github, callback (admin session / invite accept / self-signup / discord-link / telegram-link), DELETE /token/:userId
│   ├── action-routes.ts  # POST /api/comment|merge|close|react (Bearer token auth via shared middleware)
│   ├── admin-routes.ts   # /admin UI + GET/PUT /admin/api/routes|groups|me|logs|invites|audit (auth middleware + role guards, validation)
│   ├── auth.ts           # Shared auth middleware + guards: sessionMiddleware, requireAnyAccess, requireGroup(Role), bearerAuthMiddleware, clientIp
│   ├── invites.ts        # Invite CRUD (KV invite:{token}, 7d TTL) + acceptInvite (join group as admin/viewer)
│   ├── session.ts        # Session CRUD (KV session:{id}), isAdminUser, cookie helpers
│   ├── groups.ts         # Group CRUD (config:groups), member roles (normalizeGroupMembers/memberRole), resolveScope + role helpers (roleAt/canEditRoutes/canEditGroup)
│   ├── tenants.ts        # Per-group webhook secret CRUD (KV tenant:{groupId}, 32-byte random hex)
│   ├── home-routes.ts    # landing page (zh/en)
│   ├── legal-routes.ts   # /terms + /privacy pages (zh/en)
│   └── richheader-routes.ts # GET /api/richheader: Open Graph page for Telegram avatar link-preview card
└── lib/                  # shared infra
    ├── i18n.ts           # loadTranslations (KV i18n:{lang} overrides), t() with param interpolation
    ├── send-log.ts       # SendRecord, recordSend/getSendLog/getSendLogById (D1 send_logs)
    ├── audit.ts          # recordAudit/getAuditLog/pruneAuditLogs (D1 audit_logs, best-effort writes)
    ├── log.ts            # JSON console logger (info/warn/error/fatal)
    └── locales/          # en.ts, zh.ts translation dictionaries

src/__tests__/            # bun test unit tests (webhook, formatter, discord, telegram, admin, groups, invites, audit, send-log, token-store)
```

## Responsibilities

- Verify GitHub webhook signatures (Web Crypto HMAC-SHA256, `X-Hub-Signature-256`)
- Verify Gitea webhook signatures (Web Crypto HMAC-SHA256, plain hex `X-Gitea-Signature`)
- Verify custom webhook signatures (Web Crypto HMAC-SHA256, GitHub-style `sha256=` via `X-WebHooker-Signature`)
- Normalize Gitea webhook payloads to a GitHub-shaped `WebhookEvent` (push `compare_url` → `compare`, `pull_request_comment` → `pull_request_review_comment`, ...)
- Verify Discord interactions (Web Crypto Ed25519, X-Signature-Ed25519 over timestamp + body)
- Verify Telegram webhook calls (X-Telegram-Bot-Api-Secret-Token when configured)
- Filter events by: event type, repo name, actor, action, branch, keyword (regex supported)
- Filter routes by group owner restriction (`Group.owners`), group source-platform restriction (`Group.providers`: github/gitea), GitHub App installation restriction (`Group.installationId`), and skip fallback routes whenever a regular route matched; stop evaluating further routes when a matched route has `stop: true`
- Auto-provision GitHub App installs on `installation.created`: create `inst-{installationId}` group or bind existing groups whose `owners` match the installing account
- Enforce role-based access on every admin API: super admins bypass, `owner` manages the group (routes/members/invites/settings), `admin` edits routes, `viewer` is read-only; legacy `adminIds` groups resolve to `owner` members
- Issue single-use 7-day group invite links (`invite:{token}`); accepting joins as admin/viewer (never owner); `ALLOW_SELF_SIGNUP=1` creates a deterministic personal group (`u-{userId}`) on first login
- Record every admin operation (login/logout, group/route/member/invite changes) to D1 `audit_logs`; the scheduled trigger prunes entries past `AUDIT_RETENTION_DAYS`
- Mention Discord roles on route trigger: route-level `discordRoleIds` are rendered as `<@&id>` into the Discord message `content` (Telegram targets ignore the field)
- Format 29 event types as platform-neutral messages (Discord embeds + Telegram HTML)
- Route messages to Discord channels/threads and Telegram chats/topics via REST
- Edit already-sent messages in place for `workflow_run` / `check_run` progress (stable `updateKey`, KV `msg:*` tracking)
- Record every dispatch attempt to D1 `send_logs` (route id, event, target, ok/error, duration, error code)
- Serve a per-group webhook ingress (`POST /webhook/{groupId}`, per-group secret in KV `tenant:{groupId}`) for Gitea/classic-GitHub/custom senders; only that group's routes fire; dedup keys are tenant-scoped
- Send a per-event summary (event, repo, delivery id, per route×target ✅/❌ outcome) to the group's `logTarget` when configured
- Serve `/gh` slash commands + message context-menu commands + PR merge/close buttons + comment modals
- Serve Telegram `/gh` commands (login/logout/comment/merge/close) via reply-message parsing
- Sync application commands from the scheduled trigger (global ~1h propagation + per-guild instant)
- Sync the Telegram webhook URL from the scheduled trigger (setWebhook)

## Message Format Spec

- Every embed title must start with the repo, then optional `#number`, then `: subject`:
  `{repo}{#number}: {subject}` (e.g. `acme/widget#7: Add feature`). Repo comes from
  `payload.repository.full_name`; fall back to `t("common.repository")` when missing.
- Do NOT use `"Comment on org/repo"` / `"Review on org/repo"` prefixes. Comments, reviews
  and inline comments use the same `{repo}{#number}: {title}` title as their parent object.
- All event-specific emoji live in `src/formatters/` (via the `emojiPrefix` helper), never in
  the locale files. Emoji is controlled per group through the `Group.emoji` toggle (default true);
  `showEmoji=false` must strip every emoji from titles, descriptions, fields and links.
- Milestone progress bars (🟢🟡🟠⬜) are data visualization and are exempt from the emoji toggle.
- Commit hashes, branches and tags render as inline code wrapped in a hyperlink
  (`commitLink`/`branchLink`/`tagLink` helpers in `src/formatters/helpers.ts`, e.g.
  ``[`abc123d`](https://.../commit/abc123def456)``, ``[`main`](https://.../tree/main)``),
  falling back to plain inline code when the repo base URL is unavailable.
- Locale templates use a `{emoji}` placeholder immediately followed by the text (no space);
  the formatter injects `em(...)` which carries the trailing space.

## Development

```bash
npx wrangler dev      # Local dev (Miniflare)
npm run typecheck     # Type checking
npm run lint          # ESLint
npm test              # Unit tests (bun test, under src/__tests__)
```

## Documentation

Keep every functional change in sync with the docs. After implementing a feature, fix,
or refactor, update all of the following that are affected:

- `AGENTS.md` (this file) — architecture tree, responsibilities, key decisions, config
- `README.md` / `README.zh.md` — features, setup, configuration, supported events
- `docs/` (VitePress) — both `docs/` (English) and `docs/zh/` (Chinese) mirrors
- `config.example.yaml` / `.env.example` — example config/secret files

Rule: no functional change ships without its documentation; docs and code must not drift.

## Configuration

- **Local dev**: `.dev.vars` (wrangler reads this for env bindings)
- **Production**: `wrangler secret put <NAME>` for each secret
- **Routes**: KV key `config:routes` (JSON array, empty until configured)
- **KV namespace**: Required binding for token/state/config/session storage
- **D1 database**: Binding `DB` (database `webhooker`, id `214a0104-3235-47c0-b7bf-ddda95f3c8ac`) for `send_logs` + `audit_logs` + `discord_links` + `telegram_links` tables
- **Access control**: `ADMIN_USER_IDS` (super admins), `ALLOW_SELF_SIGNUP` (optional personal group on first login), `AUDIT_RETENTION_DAYS` (default 90) — all plain env vars, not secrets
- **Discord**: `DISCORD_PUBLIC_KEY` (Interactions Endpoint signature verification, from Discord Developer Portal) and `DISCORD_APPLICATION_ID` (optional, auto-resolved via `GET /oauth2/applications/@me` when omitted) are required for interactions
- **Telegram**: `TELEGRAM_TOKEN` (Bot API token from BotFather) required for Telegram routes; `TELEGRAM_WEBHOOK_SECRET` (optional secret token for `POST /telegram/webhook` verification); avatars are sent as a link-preview card via the built-in `GET /api/richheader` (overridable with `TELEGRAM_RICH_HEADER_HOST`)
- **Webhook providers**: `GITEA_WEBHOOK_SECRET` (required to receive Gitea webhooks; Gitea signs `X-Gitea-Signature` with the hex HMAC-SHA256 of the body)

## Deployment

```bash
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler kv namespace create KV
# Update wrangler.jsonc with KV ID
npx wrangler d1 create webhooker
# Update wrangler.jsonc d1_databases with the database ID
npm run db:migrate:prod   # wrangler d1 migrations apply webhooker --remote (migrations/0001..0005)
npx wrangler deploy
```

Full list of secrets used: `GITHUB_WEBHOOK_SECRET`, `GITEA_WEBHOOK_SECRET`,
`GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`
(PKCS#8 PEM), `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `DISCORD_TOKEN`,
`DISCORD_PUBLIC_KEY`, `TELEGRAM_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_USER_IDS`,
plus optional `BASE_URL`, `DISCORD_APPLICATION_ID`, `TELEGRAM_RICH_HEADER_HOST`,
`DOCS_URL`, `GITHUB_REPO_URL`, `LEGAL_CONTACT`. See `.env.example` and `docs/guide/configuration.md`.

## Notes

- Commands sync from the scheduled trigger (`*/5 * * * *`): registered per-guild for instant availability and globally (24h dedup, ~1h propagation).
- The bot is always offline (no Discord Gateway); interactions arrive via the HTTP endpoint.
