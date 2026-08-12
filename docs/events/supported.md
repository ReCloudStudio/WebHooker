# Supported Events

WebHooker supports 28 GitHub webhook event types, each with a dedicated formatter that produces rich Discord embeds and Telegram HTML messages. Unsupported events fall through to a generic formatter.

## Events Table

| Event                         | Description                    | Embed Highlights                                                               |
| ----------------------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| `push`                        | Code pushed to a branch        | Commit list, branch, author, diff stats                                        |
| `pull_request`                | PR opened/closed/merged/edited | PR title, branch, diff stats, labels                                           |
| `issues`                      | Issue opened/closed/edited     | Issue title, labels, assignees                                                 |
| `issue_comment`               | Comment on issue or PR         | Comment body, issue reference                                                  |
| `workflow_run`                | CI/CD workflow phase updated   | Workflow status, conclusion, duration; phases update a single message in place |
| `workflow_job`                | CI job phase updated           | Job name, status, conclusion, workflow                                         |
| `status`                      | Commit status updated          | Commit status, context, state, commit link                                     |
| `deployment`                  | Deployment created             | Environment, ref, task                                                         |
| `deployment_status`           | Deployment status updated      | Environment, status, commit ref                                                |
| `check_run`                   | Check run phase updated        | Status, conclusion, details URL; phases update a single message in place       |
| `check_suite`                 | Check suite completed          | Suite conclusion, head branch, commit link                                     |
| `ping`                        | Webhook confirmation           | Webhook confirmation, event types subscribed                                   |
| `release`                     | Release published/edited       | Tag, body, assets, pre-release flag                                            |
| `create`                      | Branch or tag created          | Ref name, ref type                                                             |
| `delete`                      | Branch or tag deleted          | Ref name, ref type                                                             |
| `star`                        | Repository starred/unstarred   | Star count, action                                                             |
| `fork`                        | Repository forked              | Source → target fork                                                           |
| `pull_request_review`         | PR review submitted            | Review state (approved/changes/commented), body                                |
| `pull_request_review_comment` | Inline code review comment     | File path, line number, comment body                                           |
| `commit_comment`              | Comment on a commit            | Commit SHA, comment body                                                       |
| `member`                      | Collaborator added/removed     | Member login, action                                                           |
| `label`                       | Label created/edited/deleted   | Label name, color, description                                                 |
| `milestone`                   | Milestone opened/closed        | Progress bar, issue counts, due date                                           |
| `discussion`                  | Discussion created/answered    | Title, category, action                                                        |
| `discussion_comment`          | Comment on discussion          | Comment body, discussion reference                                             |
| `repository`                  | Repo renamed/transferred       | Old → new name, changes                                                        |
| `code_scanning_alert`         | Code scanning alert            | Severity, rule ID, file path                                                   |
| `dependabot_alert`            | Dependabot alert               | Severity, package, vulnerable range, fix version                               |

## Color Coding

Each event type uses a distinct color in the Discord embed (from `src/formatters/colors.ts`):

| Color              | Events                                                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Green (`#2da44e`)  | push, PR opened / ready for review, issue opened, workflow success, release published, check success, review approved, deployment success, member added, milestone closed, discussion answered |
| Red (`#f85149`)    | PR closed, issue closed, workflow failure, release deleted, delete, check failure, review changes requested, deployment failure, member removed, code scanning / dependabot critical & high    |
| Purple (`#8957e5`) | PR merged, label, discussion                                                                                                                                                                   |
| Blue (`#1f6feb`)   | PR (other actions), issue reopened, fork, milestone opened                                                                                                                                     |
| Yellow (`#d29922`) | workflow (queued/running/other), release prerelease, star, check (other), deployment pending, code scanning / dependabot medium                                                                |
| Gray (`#6e7681`)   | issue comment, commit comment, discussion comment                                                                                                                                              |
| Gray (`#8b949e`)   | review commented, repository, code scanning / dependabot low, default                                                                                                                          |

## Generic Fallback

Any event type without a dedicated formatter falls through to the generic formatter, which produces a basic embed with:

- Event type as title
- Action (if available)
- Actor login
- Repository name
- Raw payload as code block (truncated to 1000 chars)

## In-Place Message Updates

`workflow_run` and `check_run` events (queued → running → success/failure) are sent once and then **edited in place** for each subsequent phase instead of posting a new message. The original message's link preview, author, and field layout are preserved; only the status, conclusion emoji, duration, and title are refreshed. Supported on both Discord (`editMessage`) and Telegram (`editMessageText` / `editMessageCaption`).

## Filter Compatibility

See the [Filter Tutorial](../guide/filters) for a hands-on guide with worked examples.

| Filter    | Works With                                                                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event`   | All events                                                                                                                                                     |
| `repo`    | All events                                                                                                                                                     |
| `actor`   | All events                                                                                                                                                     |
| `action`  | Events with `action` field in payload                                                                                                                          |
| `branch`  | push, pull_request, pull_request_review, pull_request_review_comment, create, delete, workflow_run, workflow_job, check_suite, deployment, code_scanning_alert |
| `keyword` | All events (searches full payload body)                                                                                                                        |
