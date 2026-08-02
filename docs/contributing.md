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
├── index.ts              # CF Workers entry (fetch + scheduled), scheduled = command sync
├── types.ts              # Env, Config, Route, Filter, WebhookEvent, NeutralMessage
├── config.ts             # Loads routes from KV (returns [] if unset), builds Config from env
├── server.ts             # Hono app: /health, /webhook, /discord/interactions, mounts /auth, /admin + /
├── core/
│   └── dispatch.ts       # Platform-neutral dispatch: match routes → formatEvent → getDriver().send
├── events/               # GitHub webhook pipeline
│   ├── verify.ts         # HMAC signature verification (Web Crypto, timing-safe)
│   ├── parse.ts          # parseEvent (headers + body → WebhookEvent)
│   └── match.ts          # matchRoute, eventOwners, extractBranch, keyword filtering
├── formatters/           # Platform-neutral formatters (produce NeutralMessage)
│   ├── index.ts          # formatEvent: 24-event switch → NeutralMessage + re-exports
│   ├── colors.ts         # GITHUB_COLORS + WORKFLOW_CONCLUSION_EMOJI
│   ├── helpers.ts        # emojiPrefix, T, buildMessage
│   └── *.ts              # push, pull-request, issues, comments, workflow, release, repo, ...
├── drivers/              # Platform drivers (pluggable push targets)
│   ├── types.ts          # PlatformDriver interface + SendResult
│   ├── index.ts          # getDriver() registry (discord + telegram stub)
│   ├── discord/          # index.ts (driver), render.ts (NeutralMessage → embed),
│   │                     # rest.ts, interactions.ts, commands.ts
│   └── telegram/         # TelegramDriver stub (not implemented yet)
├── github/               # GitHub OAuth + as-user actions
│   ├── oauth.ts          # OAuth URL, callback token exchange, getUserOctokit, actions
│   └── store.ts          # KV-based token CRUD + discord-link mapping
├── web/                  # HTTP UI/API routes
│   ├── oauth-routes.ts   # GET /auth/github, callback, DELETE /token/:userId (KV state)
│   ├── action-routes.ts  # POST /api/comment|merge|close|react (Bearer token auth via KV lookup)
│   ├── admin-routes.ts   # /admin API: routes, groups, me, logs (session + scope auth)
│   ├── session.ts        # Admin session CRUD (KV session:{id}), cookie helpers
│   ├── groups.ts         # Group loading, group-admin access scoping
│   ├── home-routes.ts    # Landing page routes
│   └── legal-routes.ts   # Legal page routes
└── lib/                  # Shared infrastructure
    ├── i18n.ts           # Message language overrides (en/zh)
    ├── send-log.ts       # Send logging (logs:send KV keys)
    ├── log.ts            # JSON console logger (info/warn/error/fatal)
    └── locales/          # en.ts, zh.ts translation dictionaries
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

1. Add the event type to `GITHUB_COLORS` in `src/formatters/colors.ts` (if new color needed)
2. Add action labels to `ACTION_LABELS` (if new actions)
3. Create a `formatEventType` function in `src/formatters/`
4. Add the case to the `formatEvent` switch statement in `src/formatters/index.ts`
5. Update `extractBranch` in `src/events/match.ts` if the event has branch info
6. Add the event to the documentation in `docs/events/supported.md`
7. Subscribe to the event in your GitHub App settings

## Pull Request Guidelines

- Keep changes focused and atomic
- Include type annotations for all function returns
- Run `npm run typecheck && npm run lint && npm run format:check` before submitting
- Update documentation if adding features
