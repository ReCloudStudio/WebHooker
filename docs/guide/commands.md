# Bot Commands

After [linking your GitHub account](#linking-your-account), you can act on GitHub **as yourself** from both Discord and Telegram — comments are posted with your own OAuth token and GitHub enforces permission. If GitHub rejects an action (e.g. editing someone else's comment) the bot tells you so.

## Linking Your Account

You must link your GitHub account once before using any command:

| Platform | Command                           | Effect                                                           |
| -------- | --------------------------------- | ---------------------------------------------------------------- |
| Discord  | `/gh login`                       | Returns an ephemeral OAuth link to authorize your GitHub account |
| Discord  | `/gh logout`                      | Unlinks your GitHub account                                      |
| Telegram | `/gh login` (reply to a message)  | Returns an OAuth link                                            |
| Telegram | `/gh logout` (reply to a message) | Unlinks your GitHub account                                      |

The link is stored server-side (KV) and mapped to your Discord/Telegram user id in D1.

## Discord

Discord commands are **slash commands** and **message context-menu commands**, synced by the scheduled trigger (every 5 minutes): per-guild for instant availability, and globally (24h dedup, ~1h propagation). All replies are ephemeral (only you see them).

### Comment on an issue / PR

Two equivalent ways:

- **Right-click a notification** (recommended): right-click a bot-issued issue / PR / comment notification → **Apps** → **GitHub: 添加评论 / 编辑评论 / 删除评论**. The target is auto-extracted from the notification embed; no link needed.
- **Slash command with a link**:

  ```
  /gh comment add  link:<issue or PR url>          e.g. https://github.com/owner/repo/issues/123
  /gh comment edit link:<comment url>              url must contain #issuecomment-<id>
  /gh comment del  link:<comment url>              url must contain #issuecomment-<id>
  ```

  For `edit` / `del`, copy the specific comment link on GitHub (comment ⋯ menu → **Copy link**). `add` / `edit` open a modal to enter/adjust the comment body (prefilled for edit).

### Merge / close a PR

Notifications for open PRs include **Merge / Close** buttons (labels follow the group's message language):

- Clicking a button merges (squash) or closes the PR as your linked GitHub account; GitHub enforces permission.
- On success the buttons are removed from the notification and the result is shown in an ephemeral reply.

### Requirements

| Item         | How                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------- |
| Public key   | `DISCORD_PUBLIC_KEY` set + Interactions Endpoint URL configured                                    |
| Invite scope | Bot invited with `applications.commands` (see [Discord Bot Setup](./deployment#discord-bot-setup)) |
| OAuth        | `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` and `BASE_URL` configured                              |
| User linked  | Each user runs `/gh login` first                                                                   |

## Telegram

Telegram `/gh` commands work by **replying to a notification message**:

- `/gh login` — link your GitHub account (returns an OAuth link)
- `/gh logout` — unlink
- `/gh comment <text>` — reply to an issue/PR notification to comment as yourself
- `/gh merge` / `/gh close` — reply to a PR notification to merge/close it

The target issue/PR is parsed from the message you reply to (the notification embed links). Commands arrive via the Telegram webhook (`POST /telegram/webhook`, optionally verified with `TELEGRAM_WEBHOOK_SECRET`).
