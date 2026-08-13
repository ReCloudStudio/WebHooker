# 配置

## 密钥

WebHooker 需要多个密钥才能运行。本地开发时存储在 `.dev.vars` 中，生产环境使用 Cloudflare Worker Secrets。

### 必需密钥

| 变量                    | 说明                                                     |
| ----------------------- | -------------------------------------------------------- |
| `GITHUB_WEBHOOK_SECRET` | GitHub App 设置中的 Webhook 密钥                         |
| `GITEA_WEBHOOK_SECRET`  | Gitea 实例的 Webhook 密钥（仅接收 Gitea webhook 时需要） |
| `GITHUB_CLIENT_ID`      | App 设置中的 OAuth 客户端 ID                             |
| `GITHUB_CLIENT_SECRET`  | App 设置中的 OAuth 客户端密钥                            |
| `DISCORD_TOKEN`         | Discord Bot Token                                        |
| `TELEGRAM_TOKEN`        | Telegram Bot Token（BotFather 获取）—— Telegram 路由必需 |

> [!NOTE]
> `GITHUB_APP_ID` 与 `GITHUB_PRIVATE_KEY` 当前未被代码使用——OAuth 流程只需要
> `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`。为兼容性保留在模式中，以备日后启用
> GitHub App 认证。

### 可选密钥

| 变量                        | 说明                                                                                             | 默认值                  |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------- |
| `BASE_URL`                  | OAuth 回调的公开 URL                                                                             | `http://localhost:8787` |
| `ADMIN_USER_IDS`            | 允许访问 WebUI 的 GitHub 用户 ID（或登录名），逗号分隔                                           | 未设置时 WebUI 关闭     |
| `ALLOW_SELF_SIGNUP`         | 开启（`1`/`true`）后，没有任何分组权限的 GitHub 用户首次登录会自动获得个人分组而非 403           | 关闭                    |
| `AUDIT_RETENTION_DAYS`      | 定时清理时审计日志的保留天数                                                                     | `90`                    |
| `DISCORD_PUBLIC_KEY`        | Discord 应用的公钥（开发者门户获取），交互功能必需                                               | 未设置时交互返回 401    |
| `DISCORD_APPLICATION_ID`    | Discord 应用 ID；省略时自动获取                                                                  | 自动获取                |
| `TELEGRAM_WEBHOOK_SECRET`   | `POST /telegram/webhook` 验签密钥（X-Telegram-Bot-Api-Secret-Token）                             | 未设置时不校验          |
| `TELEGRAM_RICH_HEADER_HOST` | 外部 rich-header 服务的基础 URL；未设置时使用内置的 `GET /api/richheader` 生成 Telegram 头像卡片 | 内置 `/api/richheader`  |

## Webhook 提供方

WebHooker 通过同一个 `POST /webhook` 端点接收多个 forge 的 webhook，按请求头自动识别来源；只需把各 forge 的 webhook 指向 `{BASE_URL}/webhook` 即可。

| 提供方 | 事件请求头       | 签名请求头            | 签名格式                   | 密钥                    |
| ------ | ---------------- | --------------------- | -------------------------- | ----------------------- |
| GitHub | `X-GitHub-Event` | `X-Hub-Signature-256` | `sha256=<hex>` HMAC-SHA256 | `GITHUB_WEBHOOK_SECRET` |
| Gitea  | `X-Gitea-Event`  | `X-Gitea-Signature`   | 纯 hex HMAC-SHA256         | `GITEA_WEBHOOK_SECRET`  |

Gitea payload 会被归一化为与 GitHub 相同的内部结构，因此路由、过滤器与 28 个格式化器无需改动即可复用；未知或未映射的 Gitea 事件回退到通用格式化器。仓库/提交/用户链接基于 payload 的 `repository.html_url` 生成，会指向你的 Gitea 实例。

## Web 控制台

WebHooker 内置了位于 `/admin` 的配置控制台，可在浏览器中管理路由。它由 GitHub OAuth 和管理员白名单保护。

### 设置

1. 配置 `ADMIN_USER_IDS`，填写允许管理路由的 GitHub 用户 ID，也支持登录名，例如 `ADMIN_USER_IDS=12345,RhenCloud`。未设置时控制台禁用（除非开启 `ALLOW_SELF_SIGNUP`）。
2. 打开 `/admin` 并使用 GitHub 登录。
3. 没有任何权限的用户收到 `403`，除非开启 `ALLOW_SELF_SIGNUP=1`（自动获得个人分组）或通过分组[邀请链接](#邀请)加入。

### 端点

控制台以 SPA 形式挂在 `/admin`，各标签页可通过 URL 路径直达（`/admin/groups`、`/admin/logs`、`/admin/audit`）。`/admin` 之外且未匹配下方端点的 URL 直接返回 `404`，不会再被吞进控制台。

| 端点                                            | 说明                                                     |
| ----------------------------------------------- | -------------------------------------------------------- |
| `GET /admin`                                    | 配置控制台页面                                           |
| `GET /admin/login`                              | 开始 GitHub OAuth 登录                                   |
| `GET /admin/logout`                             | 销毁会话                                                 |
| `GET /admin/invite?token=…`                     | 接受分组邀请（浏览器页面）                               |
| `GET /admin/api/me`                             | 当前会话、权限范围、分组和角色                           |
| `GET /admin/api/routes`                         | 列出路由（按权限过滤）                                   |
| `PUT /admin/api/routes`                         | 替换路由（按分组 owner/admin 权限）                      |
| `GET /admin/api/groups`                         | 列出分组 + 当前用户在各组的角色                          |
| `PUT /admin/api/groups`                         | 替换分组（超管全量；owner 仅自己的组）                   |
| `GET /admin/api/groups/:id/routes`              | 列出某分组的路由                                         |
| `PUT /admin/api/groups/:id/routes`              | 替换某分组的路由（owner/admin）                          |
| `PUT /admin/api/groups/:id/rename`              | 重命名分组（owner）；路由、webhook secret 与邀请自动跟随 |
| `GET /admin/api/logs`                           | 发送日志（按可访问路由过滤）                             |
| `GET /admin/api/logs/:id`                       | 单条发送日志（按权限过滤）                               |
| `POST /admin/api/groups/:id/invites`            | 创建邀请链接（owner）                                    |
| `GET /admin/api/groups/:id/invites`             | 列出待接受邀请（owner）                                  |
| `DELETE /admin/api/invites/:token`              | 撤销邀请（owner）                                        |
| `GET /admin/api/audit`                          | 审计日志（按可访问分组过滤）                             |
| `GET /admin/api/groups/:id/webhook`             | 分组 webhook 入口信息（owner）                           |
| `POST /admin/api/groups/:id/webhook/regenerate` | 生成/重新生成分组 webhook secret（owner）                |
| `DELETE /admin/api/groups/:id/webhook`          | 停用分组 webhook 入口（owner）                           |

控制台支持新增、编辑、删除和开关路由。保存后立即写入 KV `config:routes` 并使配置缓存失效，下一次 webhook 处理即会生效。

## Webhook 端点

### 全局端点（`POST /webhook`）

旧版全局端点使用运维者的全局 secret（`GITHUB_WEBHOOK_SECRET`、`GITEA_WEBHOOK_SECRET`）验签，可分发到**所有**路由。GitHub App 安装事件从该端点进入；多租户场景请用分组的 `installationId` 做隔离。

### 分组端点（`POST /webhook/{groupId}`）

每个分组可以启用独立的 webhook 入口和 secret（在分组页面「Webhook 入口」面板生成，owner 权限）。载荷使用**分组的** secret 验签，且只有该分组的路由会触发。SaaS 用户可以借此配置 Gitea、classic GitHub 或自定义 webhook，无需共享（也无需知道）运维者的全局 secret。

- 支持所有 provider：GitHub（`X-Hub-Signature-256`）、Gitea（`X-Gitea-Signature`）、自定义（`X-WebHooker-Signature`）
- secret 为 64 位十六进制字符串；重新生成后旧值立即失效
- 去重 key 按租户隔离（`delivery:{groupId}:{id}`）
- 分组未配置 secret（或分组不存在）时返回 `404`

### 自定义 Webhook

向 `POST /webhook/{groupId}`（或全局端点）POST 任意 JSON，并用分组的 secret 对原始 body 计算 HMAC-SHA256 放在 `X-WebHooker-Signature: sha256=<hex>` 头中。载荷会变成 `custom` 事件走标准路由管线——创建一条 `event: custom` 的路由（控制台有模板）即可分发到该路由的目标，并自动记录 `send_logs`、出现在分组的日志频道。

载荷格式：

```json
{
  "title": "Deploy failed",
  "description": "Prod rollout failed at 12:03 UTC",
  "color": "red",
  "url": "https://ci.example.com/runs/42",
  "repo": "acme/widget",
  "author": {
    "name": "alice",
    "iconUrl": "https://…/alice.png",
    "url": "https://github.com/alice"
  },
  "fields": [{ "name": "Env", "value": "prod", "inline": true }],
  "footer": "my-monitor",
  "deliveryId": "alert-123"
}
```

| 字段          | 类型     | 说明                                                                                                     |
| ------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `title`       | string   | 消息标题（缺失时回退为「自定义消息」）                                                                   |
| `description` | string   | 可选的消息正文                                                                                           |
| `color`       | string   | 可选消息颜色：颜色词（`red`、`green`、`yellow`、`blue`、`purple`、`orange`、`cyan`、`gray`）或 `#rrggbb` |
| `url`         | string   | 可选标题链接                                                                                             |
| `repo`        | string   | 可选 `owner/repo`；会加在标题前并作为 footer                                                             |
| `author`      | object   | 可选的 `{ name, iconUrl, url }`                                                                          |
| `fields`      | object[] | 可选的嵌入字段 `{ name, value, inline }`                                                                 |
| `footer`      | string   | 可选的 footer 覆盖                                                                                       |
| `deliveryId`  | string   | 可选的发送方去重 id（重试场景）                                                                          |

### GitHub App 租户隔离

GitHub App 安装后，**所有**安装方的事件都会到达全局端点。要让租户互相隔离，请把每个分组绑定到应当为其提供事件的安装 ID：`"installationId": 12345678`。该 ID 可从 App 安装 webhook 载荷（`installation.id`）或 GitHub App 安装页 URL 看到。即使分组的 `owners` 为空，来自其它安装的事件也会被拒绝。未设置 `installationId` 的分组保持旧行为（`owners` 过滤）。

绑定是**自动配置**的 —— 将 GitHub App 的 _Setup URL_ 指向 `{BASE_URL}/auth/github/install`。用户安装 App 后浏览器立即跳转到该页面，可选择将安装绑定到：**新分组**（`inst-{installationId}`，默认）或任意**自己拥有 owner 权限的已有分组**（提交时再次校验角色；由 `POST /auth/github/install/bind` 完成配置）。无需手动填写 ID。作为兜底（例如未配置 Setup URL 时），`installation.created` webhook 事件也会自动创建/绑定分组 —— `owners` 匹配安装账号的现有分组会被绑定，否则创建独立的 `inst-{installationId}` 分组。之后在控制台为分组添加路由和成员即可。

## 路由

路由定义了哪些事件被转发到哪些频道（Discord 或 Telegram）。它们以 JSON 数组形式存储在 Cloudflare KV 中，键为 `config:routes`。

**没有默认路由**——每条路由必须自行定义目标频道。若未配置任何路由，则不会转发任何事件。

### 路由模式

```json
{
  "id": "unique-route-id",
  "name": "可读名称",
  "enabled": true,
  "groupId": "my-group",
  "fallback": false,
  "stop": false,
  "discordRoleIds": ["111111111111111111"],
  "filters": [
    { "type": "event", "match": "push" },
    { "type": "repo", "match": "org/repo", "exclude": false }
  ],
  "targets": [
    {
      "platform": "discord",
      "channelId": "必填频道ID",
      "threadId": "可选线程ID"
    }
  ]
}
```

`targets` 数组的每一项是一个推送目标，因此一条路由可同时转发到多个频道（例如同时发到 Discord 频道 **和** Telegram 群组）。`target.platform` 选择推送目标：`discord`（默认）或 `telegram`。**Discord** 需 `target.channelId`（`target.threadId` 可选的子区）；**Telegram** 需 `target.chatId`（群组/超级群组聊天 id，如 `-1001234567890`），`target.topicId`（话题的 `message_thread_id`，相当于 Discord 的子区）可选。不存在默认频道回退。

### Discord 身份组提醒

在路由上设置 `discordRoleIds`，当该路由触发时会 @提醒（ping）一个或多个 Discord 身份组。`<@&roleId>` 形式的提醒会拼接到该路由所有 **Discord** 目标的消息正文开头；Telegram 目标会忽略此字段。只有在机器人拥有 `Mention Everyone` 权限（或该身份组被标记为可被提及 mentionable）且机器人能看到该身份组时，提醒才会真正触发通知。

```json
{
  "id": "release-notify",
  "name": "发布时提醒",
  "enabled": true,
  "groupId": "default",
  "discordRoleIds": ["111111111111111111", "222222222222222222"],
  "filters": [{ "type": "event", "match": "release" }],
  "targets": [{ "platform": "discord", "channelId": "必填频道ID" }]
}
```

也可以在管理控制台的“Discord 身份组提醒”中配置。

其他路由字段：

| 字段             | 类型     | 必需 | 说明                                                                   |
| ---------------- | -------- | ---- | ---------------------------------------------------------------------- |
| `groupId`        | string   | 是   | 该路由所属[分组](#分组)的 id                                           |
| `fallback`       | boolean  | 否   | 为 `true` 时，仅当没有其它路由匹配该事件时才发送，其自身过滤器会被忽略 |
| `stop`           | boolean  | 否   | 为 `true` 且该路由匹配时，停止评估后续路由                             |
| `discordRoleIds` | string[] | 否   | 该路由触发时要在 Discord 目标中 @提醒的身份组 id                       |

### 自定义路由示例

```json
[
  {
    "id": "backend-prs",
    "name": "后端 PR",
    "enabled": true,
    "groupId": "backend-team",
    "filters": [
      { "type": "repo", "match": "myorg/backend" },
      { "type": "event", "match": "pull_request" },
      { "type": "actor", "match": "[bot]", "exclude": true }
    ],
    "targets": [
      {
        "platform": "telegram",
        "chatId": "-1001234567890",
        "topicId": "9876543210"
      }
    ]
  }
]
```

## 分组

路由隶属于分组。分组用于限定管理权限，并可限制哪些事件允许流入。它们以 JSON 数组形式存储在 Cloudflare KV 中，键为 `config:groups`。

### 分组模式

```json
{
  "id": "backend-team",
  "name": "后端团队",
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

| 字段             | 类型     | 必需 | 说明                                                                                                                                                                 |
| ---------------- | -------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | string   | 是   | 小写 id（`a-z0-9`、`-`），由每条路由的 `groupId` 引用。可修改：重命名分组会同步更新其路由、分组级 webhook secret 与待接受邀请                                        |
| `name`           | string   | 是   | 可读的分组名称                                                                                                                                                       |
| `members`        | object[] | 否   | `{ login, role }` 列表；角色为 `owner`、`admin` 或 `viewer`                                                                                                          |
| `adminIds`       | string[] | 否   | 已废弃的旧字段；存在时按 role 为 `owner` 的成员处理                                                                                                                  |
| `owners`         | string[] | 否   | 允许事件进入该分组的组织/用户登录名；为空表示不限制                                                                                                                  |
| `providers`      | string[] | 否   | 允许进入该分组的来源平台（`github`、`gitea`）；为空表示全部                                                                                                          |
| `installationId` | number   | 否   | 绑定到该分组的 GitHub App 安装 ID；只接受该安装的事件（为空表示全部）                                                                                                |
| `emoji`          | boolean  | 否   | 是否在该分组消息中显示 emoji（默认 `true`）                                                                                                                          |
| `lang`           | string   | 否   | 该分组所有路由的消息语言（如 `en`、`zh`；可通过 KV `i18n:<lang>` 自定义）——默认 `en`                                                                                 |
| `logTarget`      | object   | 否   | Webhook 日志频道：Discord 目标 `{ platform, channelId, threadId? }` 或 Telegram 目标 `{ platform, chatId, topicId? }`，本分组路由每次投递 webhook 时都会向其发送摘要 |

### 角色

每个分组成员拥有三种角色之一。超级管理员（`ADMIN_USER_IDS`）始终绕过角色限制。

| 角色     | 查看路由/日志 | 编辑路由 | 管理成员与邀请 | 编辑分组设置       |
| -------- | ------------- | -------- | -------------- | ------------------ |
| `owner`  | ✓             | ✓        | ✓              | ✓（`owners` 除外） |
| `admin`  | ✓             | ✓        | ✗              | ✗                  |
| `viewer` | ✓（只读）     | ✗        | ✗              | ✗                  |

### 权限模型

- **超级管理员**（`ADMIN_USER_IDS`）可查看和编辑所有分组及全部路由；只有他们能修改分组的 `owners` 列表。
- **owner** 管理本组的路由、成员、邀请、名称、id、`emoji` 与 `providers`；不能移除最后一位 owner，也没有其他 owner 时不能把自己降级。
- **admin** 可编辑本组路由并查看日志；**viewer** 只读控制台。
- 分组管理端点通过 `/admin/api/groups/:id/routes` 一次只操作一个分组；`groupId` 由路径参数强制指定。
- `owners` 列表限定哪些事件参与者（发送者登录名）的事件会被该分组的路由投递。
- `providers` 列表限定哪个 forge（`github`、`gitea`）的事件会被该分组的路由投递。即使组织/用户同名，也可以借此将 GitHub 与 Gitea 分组区分开。

### Webhook 日志频道

分组可以设置 `logTarget` 指向一个 Discord 频道/子区或 Telegram 群组/话题。每当该分组的路由分发（dispatch）一个 webhook，就会向那里发送一条摘要消息：事件类型/动作、仓库、投递 ID，以及每条「路由 × 目标」一行的 ✅/❌ 结果（失败时附带错误信息）。全部成功时消息为绿色，任一失败则为红色。摘要使用分组的消息语言。日志消息尽力发送，本身不会被记入 D1 发送日志。

### 邀请

owner（及超级管理员）可在分组的「成员」面板创建一次性邀请链接，7 天内有效。接受邀请后用户以邀请角色（`admin` 或 `viewer`，绝不授予 `owner`）加入；已有的 `viewer` 会被升级为 `admin`。邀请存储在 KV `invite:{token}`。

### 自助注册

开启 `ALLOW_SELF_SIGNUP=1` 后，没有分组权限的 GitHub 用户首次登录会获得一个由自己担任 owner 的个人分组（`u-{userId}`），而不是 `403`。这是全自助 SaaS 部署的入口；关闭它则控制台保持仅邀请制。

## 过滤器类型

实操指南见[过滤器教程](./filters)，包含完整示例。

| 类型      | 匹配对象         | 示例                                      |
| --------- | ---------------- | ----------------------------------------- |
| `event`   | GitHub 事件名称  | `push`, `pull_*`, `pull_request`          |
| `repo`    | 仓库全名         | `org/repo`, `org/*`                       |
| `actor`   | 发送者登录名     | `username`, `[bot]`, `*[bot]`             |
| `action`  | 事件操作         | `opened`, `closed`, `published`           |
| `branch`  | 分支名称         | `main`, `feature-?`, `/^release-/`        |
| `keyword` | 载荷正文中的文本 | `deploy`, `*release-*`, `/fix\s+\d+/`     |

### 过滤器行为

- 路由中的所有过滤器必须都匹配才触发路由（AND 逻辑）
- 在任何过滤器上设置 `"exclude": true` 可反转匹配逻辑（NOT 逻辑）
- 所有过滤器类型支持相同的模式形式：纯文本、`*`/`?` **通配符**（`*` 任意长度、`?` 单字符）以及 `/正则表达式/`——均不区分大小写
- 字段过滤器（`event`/`repo`/`actor`/`action`/`branch`）的通配符匹配整个值；`keyword` 的通配符和正则搜索载荷任意位置；`keyword` 的纯文本为子串搜索
- 超过 200 个字符的模式不编译为通配符/正则；`//` 包裹的非法正则匹配不到任何内容
- `branch` 过滤器适用于 push、pull_request、pull_request_review、pull_request_review_comment、create/delete、workflow_run、workflow_job、check_suite、deployment 和 code_scanning_alert 事件

### 匹配值

过滤器接受单个字符串或字符串数组：

```json
{ "type": "event", "match": "push" }
{ "type": "event", "match": ["push", "pull_request"] }
```

## KV 存储布局

| 键模式                         | 值                                                                            | TTL                |
| ------------------------------ | ----------------------------------------------------------------------------- | ------------------ |
| `config:routes`                | JSON 路由数组                                                                 | 永久               |
| `config:groups`                | JSON 分组数组                                                                 | 永久               |
| `session:{id}`                 | 管理员会话 `{ userId, login }`                                                | 7 天               |
| `token:{userId}`               | `{ userId, accessToken, expiresAt, refreshToken? }`                           | 0.9 × Token 有效期 |
| `token-reverse:{sha256}`       | 用于按 Token 反查的用户 id                                                    | 0.9 × Token 有效期 |
| `state:{hex}`                  | `{ redirectTo, expiresAt, discordUserId?, telegramUserId?, telegramChatId? }` | 600 秒             |
| `invite:{token}`               | `{ groupId, role, expiresAt, createdBy, note? }`                              | 7 天               |
| `invite:group:{id}`            | 每组的 Token 索引（保证邀请列表一致性）                                       | 永久               |
| `delivery:{id}`                | Webhook 投递 id（去重标记）                                                   | 300 秒             |
| `msg:{routeId}:{key}:{target}` | 原地更新用消息 id 追踪（如 `workflow_run` / `check_run`）                     | 7 天               |
| `cmd:guild:{id}`               | 已注册命令的服务器 id（去重标记）                                             | 永久               |
| `cmd:registered:global`        | 全局命令已注册标记（24h 去重）                                                | 1 天               |
| `config:discord-app-id`        | Discord 应用 id 缓存                                                          | 永久               |
| `i18n:{lang}`                  | 翻译覆盖，合并到英文之上                                                      | 永久               |

## D1 存储布局

D1 数据库（`DB` 绑定，数据库 `webhooker`）包含四张表：

| 表               | 用途                                                                   |
| ---------------- | ---------------------------------------------------------------------- |
| `send_logs`      | 每次分发尝试一行（路由 id、事件、目标、成功/失败、耗时、错误码、详情） |
| `audit_logs`     | 每次管理操作一行（登录/登出、分组/路由/成员/邀请变更）                 |
| `discord_links`  | 映射 `discord_user_id` → `github_user_id`，用于 Discord `/gh` 命令     |
| `telegram_links` | 映射 `telegram_user_id` → `github_user_id`，用于 Telegram `/gh` 命令   |

`audit_logs` 由定时触发器按 `AUDIT_RETENTION_DAYS`（默认 90）自动清理。
