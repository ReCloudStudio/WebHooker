# Supported Events

WebHooker supports 23 GitHub webhook event types, each with a dedicated formatter that produces rich Discord embeds. Unsupported events fall through to a generic formatter.

## Events Table

| Event                         | Description                    | Embed Highlights                                 |
| ----------------------------- | ------------------------------ | ------------------------------------------------ |
| `push`                        | Code pushed to a branch        | Commit list, branch, author, diff stats          |
| `pull_request`                | PR opened/closed/merged/edited | PR title, branch, diff stats, labels             |
| `issues`                      | Issue opened/closed/edited     | Issue title, labels, assignees                   |
| `issue_comment`               | Comment on issue or PR         | Comment body, issue reference                    |
| `workflow_run`                | CI/CD workflow completed       | Workflow status, conclusion, duration            |
| `release`                     | Release published/edited       | Tag, body, assets, pre-release flag              |
| `create`                      | Branch or tag created          | Ref name, ref type                               |
| `delete`                      | Branch or tag deleted          | Ref name, ref type                               |
| `star`                        | Repository starred/unstarred   | Star count, action                               |
| `fork`                        | Repository forked              | Source → target fork                             |
| `check_run`                   | Check run completed            | Status, conclusion, details URL                  |
| `pull_request_review`         | PR review submitted            | Review state (approved/changes/commented), body  |
| `pull_request_review_comment` | Inline code review comment     | File path, line number, comment body             |
| `commit_comment`              | Comment on a commit            | Commit SHA, comment body                         |
| `deployment_status`           | Deployment status updated      | Environment, status, commit ref                  |
| `member`                      | Collaborator added/removed     | Member login, action                             |
| `label`                       | Label created/edited/deleted   | Label name, color, description                   |
| `milestone`                   | Milestone opened/closed        | Progress bar, issue counts, due date             |
| `discussion`                  | Discussion created/answered    | Title, category, action                          |
| `discussion_comment`          | Comment on discussion          | Comment body, discussion reference               |
| `repository`                  | Repo renamed/transferred       | Old → new name, changes                          |
| `code_scanning_alert`         | Code scanning alert            | Severity, rule ID, file path                     |
| `dependabot_alert`            | Dependabot alert               | Severity, package, vulnerable range, fix version |

## Color Coding

Each event type uses a distinct color in the Discord embed:

| Color              | Events                                                               |
| ------------------ | -------------------------------------------------------------------- |
| Green (`#2ea44f`)  | push, issue opened, PR opened, release published, star, member added |
| Red (`#d73a49`)    | issue closed, PR closed, deployment failure, dependabot critical     |
| Purple (`#7057ff`) | PR merged, discussion created                                        |
| Blue (`#0366d6`)   | PR review commented, issue comment, workflow run                     |
| Yellow (`#dbab09`) | PR review changes requested, deployment pending                      |
| Teal (`#00897b`)   | check run, code scanning                                             |
| Orange (`#e67e22`) | label, milestone                                                     |
| Gray (`#6a737d`)   | delete, repository, member removed                                   |

## Generic Fallback

Any event type without a dedicated formatter falls through to the generic formatter, which produces a basic embed with:

- Event type as title
- Action (if available)
- Actor login
- Repository name
- Raw payload as code block (truncated to 1000 chars)

## Filter Compatibility

| Filter    | Works With                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------- |
| `event`   | All events                                                                                                              |
| `repo`    | All events                                                                                                              |
| `actor`   | All events                                                                                                              |
| `action`  | Events with `action` field in payload                                                                                   |
| `branch`  | push, pull_request, pull_request_review, pull_request_review_comment, create, delete, workflow_run, code_scanning_alert |
| `keyword` | All events (searches full payload body)                                                                                 |
