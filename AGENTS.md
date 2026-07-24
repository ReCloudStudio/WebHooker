# AGENTS.md — WebHooker

## Project Purpose

Cloudflare Worker that receives GitHub webhooks and dispatches processed events to Discord channels/threads via a Durable Object-maintained Gateway connection.

Core pipeline: GitHub Webhook → Worker (verify + filter + format) → Durable Object (Discord Gateway) → Discord

## Key Decisions

- Runtime: Cloudflare Workers
- HTTP framework: Hono
- Discord Gateway: Durable Object (persistent WebSocket + channel cache)
- Storage: Cloudflare KV (tokens, OAuth state, route config)
- Signature verification: Web Crypto API (HMAC-SHA256, timing-safe)
- GitHub OAuth: octokit + jose (JWT)
- Local dev: wrangler + Miniflare

## Architecture

```text
src/
├── index.ts              # CF Workers entry (fetch + scheduled), exports DiscordGateway DO
├── types.ts              # Env, Config, Route, Filter, WebhookEvent, FormattedMessage
├── config.ts             # Loads routes from KV (fallback to 7 defaults), builds Config from env
├── server.ts             # Hono app: /health, /webhook, mounts /auth + /
├── webhook.ts            # HMAC verify (Web Crypto), parseEvent, extractBranch, matchRoute
├── discord.ts            # Dispatch via DO RPC, initGateway (scheduled)
├── discord-gateway.ts    # Durable Object: Discord Gateway WS, heartbeat, channel cache, send
├── formatter.ts          # 23 event formatters + generic fallback (~1380 lines)
├── github-oauth.ts       # OAuth URL, callback token exchange, getUserOctokit
├── oauth-routes.ts       # GET /auth/github, callback, DELETE /token/:userId (KV state)
├── action-routes.ts      # POST /api/comment|merge|react (Bearer token auth via KV lookup)
├── token-store.ts        # KV-based token CRUD with findUserIdByToken reverse lookup
└── log.ts                # JSON console logger (info/warn/error/fatal)
```

## Responsibilities

- Verify GitHub webhook signatures (Web Crypto HMAC-SHA256)
- Filter events by: event type, repo name, actor, action, branch, keyword (regex supported)
- Format 23+ event types as Discord embeds
- Route messages to Discord channels/threads via Durable Object RPC
- Maintain Discord Gateway connection with heartbeat and alarm-based keepalive

## Development

```bash
npx wrangler dev      # Local dev (Miniflare)
npm run typecheck     # Type checking
npm run lint          # ESLint
```

## Configuration

- **Local dev**: `.dev.vars` (wrangler reads this for env bindings)
- **Production**: `wrangler secret put <NAME>` for each secret
- **Routes**: KV key `config:routes` (JSON array); 7 defaults on first boot
- **KV namespace**: Required binding for token/state/config storage

## Deployment

```bash
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npx wrangler secret put DISCORD_TOKEN
npx wrangler kv namespace create KV
# Update wrangler.jsonc with KV ID
npx wrangler deploy
```
