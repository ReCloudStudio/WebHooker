# 分组与访问控制

路由归属于分组。分组用于划分管理权限，并可限制进入其中的事件。它们以 JSON 数组形式存储在 Cloudflare KV 的 `config:groups` 键下，可通过 [Web 控制台](./configuration#web-控制台)或 [Admin API](../api/admin) 管理。每个实例最多可保存 **100 个分组**。

## 分组模式

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

| 字段             | 类型     | 必需 | 说明                                                                                                                                                         |
| ---------------- | -------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`             | string   | 是   | 小写 id（`a-z0-9`、`-`）；被每条路由的 `groupId` 引用。可编辑：重命名分组会同步其路由、分组 webhook secret 与待处理邀请                                      |
| `name`           | string   | 是   | 人类可读的分组名                                                                                                                                             |
| `members`        | object[] | 否   | `{ login, role }` 条目；角色为 `owner`、`admin` 或 `viewer`                                                                                                  |
| `adminIds`       | string[] | 否   | 已废弃的旧字段；存在时视为角色为 `owner` 的 `members`                                                                                                        |
| `owners`         | string[] | 否   | 允许进入该分组的事件所属组织/用户登录名；空 = 全部                                                                                                           |
| `providers`      | string[] | 否   | 允许进入该分组的来源平台（`github`、`gitea`）；空 = 全部                                                                                                     |
| `installationId` | number   | 否   | 绑定到该分组的 GitHub App 安装 id；仅接受该安装的事件（空 = 全部）                                                                                           |
| `emoji`          | boolean  | 否   | 该分组消息是否包含表情（默认 `true`）                                                                                                                        |
| `forgeLabel`     | boolean  | 否   | 是否在该分组消息的底部显示来源平台标识（GitHub / Gitea 实例 / 自定义）（默认 `false`）                                                                       |
| `lang`           | string   | 否   | 该分组所有路由的消息语言（如 `en`、`zh`；可通过 KV `i18n:<lang>` 自定义）——见[消息语言](./i18n)——默认 `en`                                                   |
| `logTarget`      | object   | 否   | Webhook 日志频道：Discord 目标 `{ platform, channelId, threadId? }` 或 Telegram 目标 `{ platform, chatId, topicId? }`，接收该分组路由每次分发 webhook 的摘要 |

## 角色

每个分组成员拥有三种角色之一。超级管理员（`ADMIN_USER_IDS`）始终绕过这些限制。

| 角色     | 查看路由/日志 | 编辑路由 | 管理成员与邀请 | 编辑分组设置     |
| -------- | ------------- | -------- | -------------- | ---------------- |
| `owner`  | ✓             | ✓        | ✓              | ✓（除 `owners`） |
| `admin`  | ✓             | ✓        | ✗              | ✗                |
| `viewer` | ✓（只读）     | ✗        | ✗              | ✗                |

## 权限模型

- **超级管理员**（`ADMIN_USER_IDS`）可查看和编辑所有分组与全部路由；只有他们能编辑分组的 `owners` 列表。
- **Owner** 管理自己分组的路由、成员、邀请、名称、id、`emoji` 与 `providers`。不能移除最后一个 owner，也不能在没有其他 owner 时降级自己。
- **Admin** 编辑自己分组内的路由并查看日志；**viewer** 只有只读控制台。
- 分组管理端点通过 `/admin/api/groups/:id/routes` 一次操作一个分组；`groupId` 强制取自路径参数。
- `owners` 列表限制该分组路由究竟会分发哪些事件操作者（发送者登录名）的事件。
- `providers` 列表限制该分组路由会分发哪个 forge（`github`、`gitea`）的事件。即使组织/用户名冲突，也可借此将 GitHub 与 Gitea 分组分开。

## Webhook 日志频道

分组可以设置 `logTarget` 指向一个 Discord 频道/子区或 Telegram 群组/话题。每当该分组的路由分发（dispatch）一个 webhook，就会向那里发送一条摘要消息：事件类型/动作、仓库、投递 ID，以及每条「路由 × 目标」一行的 ✅/❌ 结果（失败时附带错误信息；最多列出前 10 行，其余以 `+N` 汇总）。全部成功时消息为绿色，任一失败则为红色。摘要使用分组的消息语言。日志消息尽力发送，本身不会被记入 D1 发送日志。

## 来源平台标识

设置 `forgeLabel: true` 后，该分组路由发出的每条消息都会在底部带上来源平台，便于在共享频道中区分来自 GitHub、自建 Gitea 实例与自定义 webhook 的事件：

- **Discord** — embed 底部在仓库名旁显示平台名（`GitHub · acme/widget`），并以站点 favicon 作为底部图标（Gitea 会从其实例源站获取自身 favicon）。
- **Telegram** — 底部行以带超链接的站点名称开头（`[GitHub](https://github.com)` 或 Gitea 实例主机名）。
- **自定义** webhook 显示为无链接的 `Custom`。

该标识与 `Group.emoji` 相互独立，并跟随该分组分发的所有消息（包括工作流/检查消息的就地更新）。

## 邀请

Owner（与超级管理员）可以在分组的 _成员_ 面板创建单次使用、有效期 7 天的邀请链接。接受邀请后，用户以被邀请的角色（`admin` 或 `viewer`——绝不会是 `owner`）加入；已有 `viewer` 会被升级为 `admin`。邀请存储在 KV 的 `invite:{token}` 键下。

## 自助注册

设置 `ALLOW_SELF_SIGNUP=1` 后，没有分组权限的 GitHub 用户首次登录时会获得个人分组（`u-{userId}`，归其所有），而不是 `403`。这是完全自助式 SaaS 安装的入口；关闭它可保持控制台仅邀请制。
