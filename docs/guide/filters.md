# Filter Tutorial

Filters decide which webhook events a [route](./configuration#routes) forwards. A route fires only when **every** filter in its `filters` array matches (AND logic). This page is a hands-on tutorial: it explains how each filter type behaves and how to combine them into real-world routing rules.

See [Filter Types](./configuration#filter-types) in the configuration guide for the reference table, and [Supported Events](../events/supported) for the full event list.

## How Matching Works

- All filters in a route must match, otherwise the route is skipped.
- Each filter matches the event against one field of the webhook payload.
- Matching is **case-insensitive** for every filter type.
- The `match` value accepts either a single string or an array of strings. An array behaves as OR — the filter matches if any of its values match.
- Setting `"exclude": true` inverts the result (NOT logic): the filter matches when the value does **not** match.

```json
{
  "type": "event",
  "match": ["push", "pull_request"],
  "exclude": false
}
```

The route above matches both `push` and `pull_request` events.

## Pattern Syntax

Every filter type shares the same three pattern forms:

| Pattern                | Meaning                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `plain text`           | Field filters: **exact** match. `keyword`: search anywhere.   |
| `*` / `?`              | **Glob wildcards** — `*` any run, `?` one char.               |
| `/regular expression/` | Compiled as a **regular expression** (case-insensitive flag). |

- On field filters (`event`/`repo`/`actor`/`action`/`branch`), plain text and globs match the whole value; on `keyword` they search anywhere in the payload.
- Regexes always search: `/^feat/` matches values _starting_ with `feat`, `/feat/` matches anywhere.

Examples:

```json
{ "type": "event", "match": "pull_*" }
```

Matches `pull_request`, `pull_request_review`, `pull_request_review_comment`, ...

```json
{ "type": "repo", "match": "myorg/*" }
```

```json
{ "type": "branch", "match": "feature-?" }
```

Matches `feature-x`, `feature-1`, but not `feature-xy`.

```json
{ "type": "branch", "match": "/^feat/" }
```

Matches any branch whose name starts with `feat`.

> [!TIP]
> Globs and regular expressions are case-insensitive too, and `*` matches across `/` in repo names (`myorg/*` also matches `myorg/sub/backend`).

## Filter Types in Depth

### `event` — Event type

Matches the GitHub event name, e.g. `push`, `pull_request`, `issues`, `release`. Use this as the backbone of every route.

```json
{ "type": "event", "match": "release" }
```

Match several events with an array:

```json
{ "type": "event", "match": ["create", "delete"] }
```

### `repo` — Repository

Matches the repository **full name** (`owner/name`). Case-insensitive.

```json
{ "type": "repo", "match": "myorg/backend" }
```

Route multiple repositories to one channel:

```json
{ "type": "repo", "match": ["myorg/backend", "myorg/frontend"] }
```

### `actor` — Sender

Matches the **sender's GitHub login** that triggered the event (`sender.login` in the payload). Useful for ignoring bots.

```json
{ "type": "actor", "match": "dependabot[bot]", "exclude": true }
```

The route above fires for every event **except** those triggered by Dependabot.

### `action` — Event action

Matches the `action` field of the payload, e.g. `opened`, `closed`, `published`, `completed`. Not all events carry an action — see [Filter Compatibility](../events/supported#filter-compatibility). Combine it with `event` to narrow down a specific lifecycle step:

```json
{
  "type": "event",
  "match": "pull_request",
  "exclude": false
},
{
  "type": "action",
  "match": ["opened", "reopened"]
}
```

This fires when a pull request is opened or reopened (and not on merge/close/edit).

### `branch` — Branch

Matches the branch involved in the event. What counts as "the branch" depends on the event type:

| Event                       | Branch extracted                            |
| --------------------------- | ------------------------------------------- |
| `push`                      | The branch that was pushed to               |
| `pull_request` (and review) | The pull request's **head** (source) branch |
| `create` / `delete`         | The created/deleted branch or tag           |
| `workflow_run`              | The `head_branch` the workflow ran on       |
| `workflow_job`              | The `head_branch` the job ran on            |
| `check_suite`               | The `head_branch` of the check suite        |
| `deployment`                | The deployment ref (strips `refs/heads/`)   |
| `code_scanning_alert`       | The branch the alert belongs to             |

```json
{
  "type": "event",
  "match": "push"
},
{
  "type": "branch",
  "match": "main"
}
```

Fires for pushes to `main` only. To watch several long-lived branches:

```json
{ "type": "branch", "match": ["main", "develop"] }
```

> [!NOTE]
> `branch` matching is case-insensitive. Use globs (`feature/*`) or a `//`-wrapped regex (`/^release-/`) for prefix or wildcard-style matching.

### `keyword` — Text in the payload

Matches against the **full JSON payload**, lowercased. It is the most flexible filter: plain text searches anywhere, `*`/`?` globs search with wildcards, and `//`-wrapped patterns are compiled as regular expressions (with the `i` flag).

```json
{ "type": "keyword", "match": "deploy" }
```

Fires when the payload contains `deploy` anywhere. Because the payload is lowercased, this matches `Deploy`, `DEPLOY`, etc.

```json
{ "type": "keyword", "match": "*release-*" }
```

```json
{ "type": "keyword", "match": "/^(fix|hotfix)/" }
```

```json
{ "type": "keyword", "match": "/release-[0-9]+/" }
```

Behavior details:

- Patterns longer than 200 characters are **not** compiled as glob/regex and fall back to plain matching.
- A `//`-wrapped pattern that is not a valid regex matches **nothing** (the filter stays false) rather than erroring.
- To search for text that is a glob or regex special character (e.g. `v1.2.3`), rely on the plain-text form — a pattern without `*`, `?`, or `//` wrapping matches literally.
- The search covers the **entire** payload: commit messages, PR titles and bodies, labels, refs, even repository and sender names.

### Combining `exclude` with `keyword`

Just like the other filters, `exclude` inverts the keyword match:

```json
{ "type": "keyword", "match": "/wip|draft/", "exclude": true }
```

Skips events whose payload mentions `wip` or `draft`.

## Worked Example 1: PR alerts that skip bots and drafts

Forward pull request activity, but ignore bot authors and draft PRs, to a `#prs` channel:

```json
{
  "id": "pr-notices",
  "name": "PR Notices",
  "enabled": true,
  "groupId": "eng",
  "filters": [
    { "type": "event", "match": "pull_request" },
    { "type": "actor", "match": "dependabot[bot]", "exclude": true },
    { "type": "keyword", "match": "\"draft\": true", "exclude": true }
  ],
  "target": { "channelId": "111111111111111111" }
}
```

The `"draft": true` pattern matches the `draft` field that GitHub includes in pull request payloads; combined with `exclude: true` it filters out draft PRs.

## Worked Example 2: Release-only channel

Forward only published releases from a specific repo:

```json
{
  "id": "release-alerts",
  "name": "Release Alerts",
  "enabled": true,
  "groupId": "eng",
  "filters": [
    { "type": "event", "match": "release" },
    { "type": "action", "match": "published" },
    { "type": "repo", "match": "myorg/backend" }
  ],
  "target": { "channelId": "222222222222222222" }
}
```

## Worked Example 3: CI failures

Forward workflow runs that ended in failure on any branch, to a `#ci` channel:

```json
{
  "id": "ci-failures",
  "name": "CI Failures",
  "enabled": true,
  "groupId": "eng",
  "filters": [
    { "type": "event", "match": "workflow_run" },
    { "type": "action", "match": "completed" },
    { "type": "keyword", "match": "\"conclusion\":\"failure\"" }
  ],
  "target": { "channelId": "333333333333333333" }
}
```

## Common Pitfalls

- **Wildcards are globs, not regex.** `repo: "myorg/*"` matches any repo under `myorg` (and `myorg/sub/backend`), but `repo: "myorg/.*"` matches literally. Use `//` wrapping for regex: `"/myorg\/.*/"`.
- **A `//`-wrapped invalid regex never matches.** Unlike plain text, an unwrapped invalid pattern is matched literally — wrap patterns only when they are real regular expressions.
- **An `action` filter on an action-less event never matches.** Check the event has an `action` field first (see [Filter Compatibility](../events/supported#filter-compatibility)).
- **`branch` on an event without a branch never matches.** A `branch` filter on an `issues` event will always be false. Use `keyword` if you need branch-like matching there.
- **`keyword` searches everything.** Because it scans the whole payload, a pattern like `"fix"` can match commit messages, issue titles, _and_ repository names. Be as specific as possible.
- **Forgetting `exclude` semantics.** `exclude: true` negates the whole filter — one non-matching value in an array does not "block" the route; the negated filter matches only when _none_ of the values match.
