# Contributing

## Development Setup

```bash
git clone https://github.com/ReCloudStudio/WebHooker.git
cd WebHooker
npm install
cp .env.example .dev.vars   # Fill in secrets
npm run dev                  # Start local dev server
```

## Project Structure

```text
src/
├── index.ts              # CF Workers entry (fetch + scheduled), exports DiscordGateway DO
├── types.ts              # Env, Config, Route, Filter, WebhookEvent, FormattedMessage
├── config.ts             # Loads routes from KV (returns [] if unset), builds Config from env
├── server.ts             # Hono app: /health, /webhook, mounts /auth, /admin + /
├── webhook.ts            # HMAC verify (Web Crypto), parseEvent, extractBranch, matchRoute
├── discord.ts            # Dispatch via Discord REST (DO RPC when gateway enabled), initGateway (scheduled)
├── discord-rest.ts       # Discord REST sendMessage with retry + rate-limit handling
├── discord-gateway.ts    # Durable Object: Discord Gateway WS, heartbeat, channel cache, send
├── formatter.ts          # 23 event formatters + generic fallback
├── github-oauth.ts       # OAuth URL, callback token exchange, getUserOctokit
├── oauth-routes.ts       # GET /auth/github, callback, DELETE /token/:userId (KV state)
├── action-routes.ts      # POST /api/comment|merge|close|react (Bearer token auth via KV lookup)
├── admin-routes.ts       # /admin API: routes, groups, me, logs (session + scope auth)
├── admin-session.ts      # Admin session CRUD (KV session:{id}), cookie helpers
├── groups.ts             # Group loading, group-admin access scoping
├── i18n.ts               # Message language overrides (en/zh)
├── send-log.ts           # Send logging (logs:send KV keys)
├── token-store.ts        # KV-based token CRUD with findUserIdByToken reverse lookup
├── home-routes.ts        # Landing page routes
├── legal-routes.ts       # Legal page routes
└── log.ts                # JSON console logger (info/warn/error/fatal)
```

## Scripts

| Command                | Description                     |
| ---------------------- | ------------------------------- |
| `npm run dev`          | Start wrangler dev server       |
| `npm run typecheck`    | TypeScript type checking        |
| `npm run lint`         | ESLint (TypeScript)             |
| `npm run lint:md`      | Markdownlint (Markdown)         |
| `npm test`             | Run unit tests (bun test)       |
| `npm run format`       | Format all files with Prettier  |
| `npm run format:check` | Check Prettier formatting       |
| `npm run docs:dev`     | Start VitePress docs dev server |
| `npm run docs:build`   | Build docs site                 |

## Code Style

- **TypeScript** with strict mode
- **Double quotes** for strings
- **Semicolons** required
- **Trailing commas** in all positions
- **100 char** print width
- **ESLint** with `@typescript-eslint` recommended rules
- **Prettier** for formatting
- **Markdownlint** for markdown files

## Testing

```bash
# Run the unit test suite (bun test)
npm test

# Or manually check the health endpoint
curl http://localhost:8787/health
```

## Adding a New Event Formatter

1. Add the event type to `GITHUB_COLORS` in `formatter.ts` (if new color needed)
2. Add action labels to `ACTION_LABELS` (if new actions)
3. Create a `formatEventType` function in `formatter.ts`
4. Add the case to the `formatEvent` switch statement
5. Update `extractBranch` in `webhook.ts` if the event has branch info
6. Add the event to the documentation in `docs/events/supported.md`
7. Subscribe to the event in your GitHub App settings

## Pull Request Guidelines

- Keep changes focused and atomic
- Include type annotations for all function returns
- Run `npm run typecheck && npm run lint && npm run format:check` before submitting
- Update documentation if adding features
