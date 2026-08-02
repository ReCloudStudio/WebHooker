# AGENTS.md — WebHooker

## Project Purpose

Cloudflare Worker that receives GitHub webhooks and dispatches processed events to Discord channels/threads, and receives Discord interactions (slash commands, buttons, modals) via the Interactions Endpoint.

Core pipeline: GitHub Webhook → Worker (verify + filter + format) → Discord (REST)

## Key Decisions

- Runtime: Cloudflare Workers
- HTTP framework: Hono
- Discord interactions: HTTPS Interactions Endpoint (`POST /discord/interactions`, Ed25519-signed) — no Discord Gateway / Durable Object; bot stays offline, messages always sent via REST
- Storage: Cloudflare KV (tokens, OAuth state, route config, admin sessions)
- Signature verification: Web Crypto API (HMAC-SHA256 for GitHub, Ed25519 for Discord)
- GitHub OAuth: octokit + jose (JWT)
- Admin WebUI: `/admin` config console, OAuth-session protected via `ADMIN_USER_IDS` whitelist
- Local dev: wrangler + Miniflare

## Architecture

```text
src/
├── index.ts              # CF Workers entry (fetch + scheduled), scheduled = command sync
├── types.ts              # Env, Config, Route, Filter, WebhookEvent, FormattedMessage
├── config.ts             # loadRoutes/saveRoutes (KV config:routes, cache w/ 60s TTL), loadConfig from env
├── server.ts             # Hono app: /health, /webhook, /discord/interactions, mounts /auth, /admin + /
├── webhook.ts            # HMAC verify (Web Crypto), parseEvent, extractBranch, matchRoute
├── discord.ts            # Dispatch to Discord via REST (sendMessage)
├── discord-rest.ts       # Discord REST sendMessage with retry + rate-limit handling
├── discord-interactions.ts # Ed25519 verify + interaction handlers (/gh, buttons, modals) + command registration
├── formatter.ts          # 24 event formatters + generic fallback (~1570 lines)
├── github-oauth.ts       # OAuth URL, callback token exchange, getUserOctokit
├── oauth-routes.ts       # GET /auth/github, callback (sets admin session if redirect=/admin), DELETE /token/:userId
├── action-routes.ts      # POST /api/comment|merge|react (Bearer token auth via KV lookup)
├── admin-routes.ts       # /admin UI + GET/PUT /admin/api/routes (session + ADMIN_USER_IDS auth, validation)
├── admin-session.ts      # Session CRUD (KV session:{id}), isAdminUser, cookie helpers
├── admin-ui.ts           # ADMIN_HTML: single-file config console (vanilla HTML/CSS/JS)
├── token-store.ts        # KV-based token CRUD with findUserIdByToken reverse lookup
└── log.ts                # JSON console logger (info/warn/error/fatal)
```

## Responsibilities

- Verify GitHub webhook signatures (Web Crypto HMAC-SHA256)
- Verify Discord interactions (Web Crypto Ed25519, X-Signature-Ed25519 over timestamp + body)
- Filter events by: event type, repo name, actor, action, branch, keyword (regex supported)
- Format 23+ event types as Discord embeds
- Route messages to Discord channels/threads via REST
- Serve `/gh` slash commands + message context-menu commands + PR merge/close buttons + comment modals
- Sync application commands from the scheduled trigger (global ~1h propagation + per-guild instant)

## Message Format Spec

- Every embed title must start with the repo, then optional `#number`, then `: subject`:
  `{repo}{#number}: {subject}` (e.g. `acme/widget#7: Add feature`). Repo comes from
  `payload.repository.full_name`; fall back to `t("common.repository")` when missing.
- Do NOT use `"Comment on org/repo"` / `"Review on org/repo"` prefixes. Comments, reviews
  and inline comments use the same `{repo}{#number}: {title}` title as their parent object.
- All event-specific emoji live in `src/formatter.ts` (via the `em()` helper), never in the
  locale files. Emoji is controlled per group through the `Group.emoji` toggle (default true);
  `showEmoji=false` must strip every emoji from titles, descriptions, fields and links.
- Milestone progress bars (🟢🟡🟠⬜) are data visualization and are exempt from the emoji toggle.
- Locale templates use a `{emoji}` placeholder immediately followed by the text (no space);
  the formatter injects `em(...)` which carries the trailing space.

## Development

```bash
npx wrangler dev      # Local dev (Miniflare)
npm run typecheck     # Type checking
npm run lint          # ESLint
```

## Configuration

- **Local dev**: `.dev.vars` (wrangler reads this for env bindings)
- **Production**: `wrangler secret put <NAME>` for each secret
- **Routes**: KV key `config:routes` (JSON array, empty until configured)
- **KV namespace**: Required binding for token/state/config storage
- **Discord**: `DISCORD_PUBLIC_KEY` (Interactions Endpoint signature verification, from Discord Developer Portal) and `DISCORD_APPLICATION_ID` (optional, auto-resolved via `GET /oauth2/applications/@me` when omitted) are required for interactions

## Deployment

```bash
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler kv namespace create KV
# Update wrangler.jsonc with KV ID
npx wrangler deploy
```

## Notes

- Commands sync from the scheduled trigger (`*/5 * * * *`): registered per-guild for instant availability and globally (24h dedup, ~1h propagation).
- The bot is always offline (no Discord Gateway); interactions arrive via the HTTP endpoint.
