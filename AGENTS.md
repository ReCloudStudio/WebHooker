# AGENTS.md — WebHooker

## Project Purpose

Cloudflare Worker that receives GitHub webhooks and dispatches processed events to Discord channels/threads and Telegram chats/topics, and receives Discord interactions (slash commands, buttons, modals) via the Interactions Endpoint plus Telegram bot `/gh` commands via the Telegram webhook.

Core pipeline: GitHub Webhook → Worker (verify + filter + format) → Discord (REST) / Telegram (Bot API)

## Key Decisions

- Runtime: Cloudflare Workers
- HTTP framework: Hono
- Discord interactions: HTTPS Interactions Endpoint (`POST /discord/interactions`, Ed25519-signed) — no Discord Gateway / Durable Object; bot stays offline, messages always sent via REST
- Storage: Cloudflare KV (tokens, OAuth state, route config `config:routes`, group config `config:groups`, admin sessions, delivery dedup, message-update tracking `msg:*`, i18n overrides `i18n:*`) + D1 (`send_logs`, `discord_links`, `telegram_links`)
- Signature verification: Web Crypto API (HMAC-SHA256 for GitHub, Ed25519 for Discord, timing-safe secret-token compare for Telegram)
- GitHub OAuth: octokit (token is stored hashed for reverse lookup; jose is a dependency but JWT issuance is not used)
- Admin WebUI: `/admin` config console, OAuth-session protected via `ADMIN_USER_IDS` whitelist
- Local dev: wrangler + Miniflare

## Architecture

```text
src/
├── index.ts              # CF Workers entry (fetch + scheduled), scheduled = Discord command sync + Telegram webhook sync
├── types.ts              # Env, Config, Route, Filter, Group, WebhookEvent, NeutralMessage
├── config.ts             # loadRoutes/saveRoutes (KV config:routes, cache w/ 60s TTL), loadConfig from env
├── server.ts             # Hono app: /health, /webhook, /discord/interactions, /telegram/webhook, mounts /auth, /admin + /
├── core/
│   └── dispatch.ts       # Platform-neutral dispatch: match routes → formatEvent → driver.send/edit (recordSend + group filter)
├── events/               # GitHub webhook pipeline (legacy src/webhook.ts is dead code — do not import it)
│   ├── verify.ts         # HMAC signature verify (Web Crypto, timing-safe)
│   ├── parse.ts          # parseEvent (headers + body → WebhookEvent)
│   └── match.ts          # matchRoute, eventOwners, extractBranch, keyword regex filtering
├── formatters/           # Platform-neutral message formatters (was formatter.ts)
│   ├── index.ts          # formatEvent: 28-event switch → NeutralMessage + re-exports
│   ├── colors.ts         # GITHUB_COLORS + WORKFLOW_CONCLUSION_EMOJI
│   ├── helpers.ts        # emojiPrefix, T, buildMessage
│   └── *.ts              # push, pull-request, issues, comments, workflow, release, create,
│                         # repo, check, review, commit-comment, deployment, member, label,
│                         # milestone, discussion, repository, security, generic, ping
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
│   ├── oauth-routes.ts   # GET /auth/github, callback (admin session / discord-link / telegram-link), DELETE /token/:userId
│   ├── action-routes.ts  # POST /api/comment|merge|close|react (Bearer token auth via KV lookup)
│   ├── admin-routes.ts   # /admin UI + GET/PUT /admin/api/routes|groups|me|logs (session + scope auth, validation)
│   ├── session.ts        # Session CRUD (KV session:{id}), isAdminUser, cookie helpers
│   ├── groups.ts         # Group CRUD (config:groups), resolveScope, hasAnyAccess, groupAcceptsOwners
│   ├── home-routes.ts    # landing page (zh/en)
│   ├── legal-routes.ts   # /terms + /privacy pages (zh/en)
│   └── richheader-routes.ts # GET /api/richheader: Open Graph page for Telegram avatar link-preview card
└── lib/                  # shared infra
    ├── i18n.ts           # loadTranslations (KV i18n:{lang} overrides), t() with param interpolation
    ├── send-log.ts       # SendRecord, recordSend/getSendLog/getSendLogById (D1 send_logs)
    ├── log.ts            # JSON console logger (info/warn/error/fatal)
    └── locales/          # en.ts, zh.ts translation dictionaries

src/__tests__/            # bun test unit tests (webhook, formatter, discord, telegram, admin, send-log, token-store)
```

## Responsibilities

- Verify GitHub webhook signatures (Web Crypto HMAC-SHA256)
- Verify Discord interactions (Web Crypto Ed25519, X-Signature-Ed25519 over timestamp + body)
- Verify Telegram webhook calls (X-Telegram-Bot-Api-Secret-Token when configured)
- Filter events by: event type, repo name, actor, action, branch, keyword (regex supported)
- Filter routes by group owner restriction (`Group.owners`) and skip fallback routes whenever a regular route matched; stop evaluating further routes when a matched route has `stop: true`
- Mention Discord roles on route trigger: route-level `discordRoleIds` are rendered as `<@&id>` into the Discord message `content` (Telegram targets ignore the field)
- Format 28 event types as platform-neutral messages (Discord embeds + Telegram HTML)
- Route messages to Discord channels/threads and Telegram chats/topics via REST
- Edit already-sent messages in place for `workflow_run` progress (stable `updateKey`, KV `msg:*` tracking)
- Record every dispatch attempt to D1 `send_logs` (route id, event, target, ok/error, duration, error code)
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
- **D1 database**: Binding `DB` (database `webhooker`, id `214a0104-3235-47c0-b7bf-ddda95f3c8ac`) for `send_logs` + `discord_links` + `telegram_links` tables
- **Discord**: `DISCORD_PUBLIC_KEY` (Interactions Endpoint signature verification, from Discord Developer Portal) and `DISCORD_APPLICATION_ID` (optional, auto-resolved via `GET /oauth2/applications/@me` when omitted) are required for interactions
- **Telegram**: `TELEGRAM_TOKEN` (Bot API token from BotFather) required for Telegram routes; `TELEGRAM_WEBHOOK_SECRET` (optional secret token for `POST /telegram/webhook` verification); avatars are sent as a link-preview card via the built-in `GET /api/richheader` (overridable with `TELEGRAM_RICH_HEADER_HOST`)

## Deployment

```bash
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler kv namespace create KV
# Update wrangler.jsonc with KV ID
npx wrangler d1 create webhooker
# Update wrangler.jsonc d1_databases with the database ID
npm run db:migrate:prod   # wrangler d1 migrations apply webhooker --remote (migrations/0001..0003)
npx wrangler deploy
```

Full list of secrets used: `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`
(PKCS#8 PEM), `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `DISCORD_TOKEN`,
`DISCORD_PUBLIC_KEY`, `TELEGRAM_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_USER_IDS`,
plus optional `BASE_URL`, `DISCORD_APPLICATION_ID`, `TELEGRAM_RICH_HEADER_HOST`,
`DOCS_URL`, `GITHUB_REPO_URL`, `LEGAL_CONTACT`. See `.env.example` and `docs/guide/configuration.md`.

## Notes

- Commands sync from the scheduled trigger (`*/5 * * * *`): registered per-guild for instant availability and globally (24h dedup, ~1h propagation).
- The bot is always offline (no Discord Gateway); interactions arrive via the HTTP endpoint.
