# Groups & Access Control

Routes belong to groups. Groups scope admin access and can restrict which events flow into them. They are stored in Cloudflare KV under the key `config:groups` as a JSON array, managed via the [Web UI](./configuration#web-ui) or the [Admin API](../api/admin). At most **100 groups** can be saved per instance.

## Group Schema

```json
{
  "id": "backend-team",
  "name": "Backend Team",
  "members": [
    { "login": "rhencloud", "role": "owner" },
    { "login": "octobot", "role": "admin" },
    { "login": "reader", "role": "viewer" }
  ],
  "owners": ["myorg"],
  "providers": ["github", "gitea"],
  "installationId": 12345678,
  "logTarget": { "platform": "discord", "channelId": "123456789", "threadId": "987654321" }
}
```

| Field            | Type     | Required | Description                                                                                                                                                                                  |
| ---------------- | -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | string   | Yes      | Lowercase id (`a-z0-9`, `-`); referenced by each route's `groupId`. Editable: renaming a group re-points its routes, per-group webhook secret and pending invites                            |
| `name`           | string   | Yes      | Human-readable group name                                                                                                                                                                    |
| `members`        | object[] | No       | `{ login, role }` entries; role is `owner`, `admin`, or `viewer`                                                                                                                             |
| `adminIds`       | string[] | No       | Deprecated legacy field; treated as `members` with role `owner` when present                                                                                                                 |
| `owners`         | string[] | No       | Org/user logins whose events are accepted into this group; empty = all                                                                                                                       |
| `providers`      | string[] | No       | Source platforms allowed into this group (`github`, `gitea`); empty = all                                                                                                                    |
| `installationId` | number   | No       | GitHub App installation id bound to this group; only that installation's events are accepted (empty = all)                                                                                   |
| `emoji`          | boolean  | No       | Whether to include emoji in this group's messages (default `true`)                                                                                                                           |
| `lang`           | string   | No       | Message language for every route in this group (e.g. `en`, `zh`; custom via KV `i18n:<lang>`) — see [Message Language](./i18n) — defaults to `en`                                            |
| `logTarget`      | object   | No       | Webhook log channel: a Discord `{ platform, channelId, threadId? }` or Telegram `{ platform, chatId, topicId? }` target that receives a summary of every webhook the group's routes dispatch |

## Roles

Every group member has one of three roles. Super admins (`ADMIN_USER_IDS`) always bypass them.

| Role     | View routes/logs | Edit routes | Manage members & invites | Edit group settings |
| -------- | ---------------- | ----------- | ------------------------ | ------------------- |
| `owner`  | ✓                | ✓           | ✓                        | ✓ (except `owners`) |
| `admin`  | ✓                | ✓           | ✗                        | ✗                   |
| `viewer` | ✓ (read-only)    | ✗           | ✗                        | ✗                   |

## Access Model

- **Super admins** (`ADMIN_USER_IDS`) see and edit every group and all routes; only they can edit a group's `owners` list.
- **Owners** manage their group's routes, members, invites, name, id, `emoji`, and `providers`. They cannot remove the last owner or demote themselves when no other owner remains.
- **Admins** edit routes inside their groups and view logs; **viewers** get a read-only console.
- Group admin endpoints operate on a single group at a time via `/admin/api/groups/:id/routes`; `groupId` is forced from the path parameter.
- The `owners` list restricts which event actors (sender logins) the group's routes will dispatch at all.
- The `providers` list restricts which forge's events (`github`, `gitea`) the group's routes will dispatch. This lets you keep GitHub and Gitea groups separate even when org/user names collide.

## Webhook Log Channel

A group may set `logTarget` to a Discord channel/thread or Telegram chat/topic. Whenever the group's routes dispatch a webhook, a single summary message is sent there: the event type/action, the repo, the delivery id, and one line per route×target with an ✅/❌ outcome (including the error for failed sends; at most the first 10 lines are listed, the rest is summarized as `+N`). The message is green when every dispatch succeeded and red when any failed. The summary uses the group's message language. Log messages are sent best-effort and are not themselves recorded in the D1 send log.

## Invites

Owners (and super admins) can create single-use invite links valid for 7 days from the group's _Members_ panel. Accepting an invite adds the user with the invited role (`admin` or `viewer` — never `owner`); an existing `viewer` is upgraded to `admin`. Invites are stored in KV as `invite:{token}`.

## Self Sign-up

With `ALLOW_SELF_SIGNUP=1`, a GitHub user who has no group access gets a personal group (`u-{userId}`, owned by them) on first login instead of a `403`. This is the entry point for a fully self-service SaaS install; disable it to keep the console invite-only.
