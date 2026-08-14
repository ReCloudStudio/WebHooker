# Message Format

Every event formatter produces a platform-neutral message (`NeutralMessage`), rendered by the platform drivers into a Discord embed or Telegram HTML message.

## Title

Every title must start with the repo, then an optional `#number`, then `: subject`:

```
{repo}{#number}: {subject}      e.g. acme/widget#7: Add feature
```

The repo comes from `payload.repository.full_name` (falling back to a generic "repository" label when missing). Comments, reviews, and inline comments use the same `{repo}{#number}: {title}` title as their parent object — never `"Comment on org/repo"` prefixes.

## Links

Only the repo head is hyperlinked — never the whole title:

- **Discord** (embed titles cannot contain partial links): the title is the repo head `{repo}{#number}`, linked to the repository; the `: {subject}` text is rendered as the first line of the description, unlinked.
- **Telegram** (HTML supports inline links): the one-line title keeps the subject, with only the repo head wrapped in a link.

Messages whose title has no colon separator (a `:` followed by a space) keep the legacy whole-title link behavior.

Commit hashes, branches, and tags render as inline code wrapped in a hyperlink (e.g. ``[`abc123d`](https://…/commit/abc123def456)``), falling back to plain inline code when the repo base URL is unavailable.

## Emoji

Event-specific emoji are added by the formatters; per-group `Group.emoji` (default true) strips them all when disabled. Milestone progress bars are exempt. See [Message Language](./i18n).

## Forge Source Label

With `Group.forgeLabel` (default false) the message footer additionally names the source forge — GitHub, the Gitea instance hostname (hyperlinked), or a plain `Custom` — so events from different forges can be told apart. See [Groups → Forge Source Label](./groups#forge-source-label).

## In-Place Updates

`workflow_run` and `check_run` messages are sent once and edited in place as the run progresses (queued → running → success/failure) — no duplicate messages. Tracking uses KV `msg:*` with a stable `updateKey` per run.
