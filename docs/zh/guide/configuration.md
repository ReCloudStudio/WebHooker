# 配置

## 密钥

WebHooker 需要多个密钥才能运行。本地开发时存储在 `.dev.vars` 中，生产环境使用 Cloudflare Worker Secrets。

### 必需密钥

| 变量                    | 说明                                                     |
| ----------------------- | -------------------------------------------------------- |
| `GITHUB_WEBHOOK_SECRET` | GitHub App 设置中的 Webhook 密钥                         |
| `GITHUB_APP_ID`         | GitHub App 的数字 ID                                     |
| `GITHUB_PRIVATE_KEY`    | App 私钥（PEM 格式，用 `\n` 转义）                       |
| `GITHUB_CLIENT_ID`      | App 设置中的 OAuth 客户端 ID                             |
| `GITHUB_CLIENT_SECRET`  | App 设置中的 OAuth 客户端密钥                            |
| `DISCORD_TOKEN`         | Discord Bot Token                                        |
| `TELEGRAM_TOKEN`        | Telegram Bot Token（BotFather 获取）—— Telegram 路由必需 |

### 可选密钥

| 变量                      | 说明                                                                 | 默认值                  |
| ------------------------- | -------------------------------------------------------------------- | ----------------------- |
| `BASE_URL`                | OAuth 回调的公开 URL                                                 | `http://localhost:8787` |
| `ADMIN_USER_IDS`          | 允许访问 WebUI 的 GitHub 用户 ID（或登录名），逗号分隔               | 未设置时 WebUI 关闭     |
| `DISCORD_PUBLIC_KEY`      | Discord 应用的公钥（开发者门户获取），交互功能必需                   | 未设置时交互返回 401    |
| `DISCORD_APPLICATION_ID`  | Discord 应用 ID；省略时自动获取                                      | 自动获取                |
| `TELEGRAM_WEBHOOK_SECRET` | `POST /telegram/webhook` 验签密钥（X-Telegram-Bot-Api-Secret-Token） | 未设置时不校验          |
| `TELEGRAM_RICH_HEADER_HOST` | 外部 rich-header 服务的基础 URL；未设置时使用内置的 `GET /api/richheader` 生成 Telegram 头像卡片 | 内置 `/api/richheader`  |

## Web 控制台

WebHooker 内置了位于 `/admin` 的配置控制台，可在浏览器中管理路由。它由 GitHub OAuth 和管理员白名单保护。

### 设置

1. 配置 `ADMIN_USER_IDS`，填写允许管理路由的 GitHub 用户 ID，也支持登录名，例如 `ADMIN_USER_IDS=12345,RhenCloud`。未设置时控制台禁用。
2. 打开 `/admin` 并使用 GitHub 登录。
3. 只有白名单中的用户会获得会话 Cookie；其他人收到 `403`。

### 端点

| 端点                               | 说明                         |
| ---------------------------------- | ---------------------------- |
| `GET /admin`                       | 配置控制台页面               |
| `GET /admin/login`                 | 开始 GitHub OAuth 登录       |
| `GET /admin/logout`                | 销毁会话                     |
| `GET /admin/api/me`                | 当前会话、权限范围和分组     |
| `GET /admin/api/routes`            | 列出路由（仅管理员）         |
| `PUT /admin/api/routes`            | 替换路由（仅管理员）         |
| `GET /admin/api/groups`            | 列出分组（按权限过滤）       |
| `PUT /admin/api/groups`            | 替换分组（仅超级管理员）     |
| `GET /admin/api/groups/:id/routes` | 列出某分组的路由             |
| `PUT /admin/api/groups/:id/routes` | 替换某分组的路由             |
| `GET /admin/api/logs`              | 发送日志（按可访问路由过滤） |

控制台支持新增、编辑、删除和开关路由。保存后立即写入 KV `config:routes` 并使配置缓存失效，下一次 webhook 处理即会生效。

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

其他路由字段：

| 字段       | 类型    | 必需 | 说明                                                                   |
| ---------- | ------- | ---- | ---------------------------------------------------------------------- |
| `groupId`  | string  | 是   | 该路由所属[分组](#分组)的 id                                           |
| `fallback` | boolean | 否   | 为 `true` 时，仅当没有其它路由匹配该事件时才发送，其自身过滤器会被忽略 |
| `lang`     | string  | 否   | 该路由的消息语言覆盖（如 `en`、`zh`），默认跟随全局设置                |

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
  "adminIds": ["rhencloud"],
  "owners": ["myorg"]
}
```

| 字段       | 类型     | 必需 | 说明                                                  |
| ---------- | -------- | ---- | ----------------------------------------------------- |
| `id`       | string   | 是   | 小写 id（`a-z0-9`、`-`），由每条路由的 `groupId` 引用 |
| `name`     | string   | 是   | 可读的分组名称                                        |
| `adminIds` | string[] | 是   | 可管理该分组路由的 GitHub 用户 ID 或登录名            |
| `owners`   | string[] | 否   | 允许事件进入该分组的组织/用户登录名；为空表示不限制   |

### 权限模型

- **超级管理员**（`ADMIN_USER_IDS`）可查看和编辑所有分组及全部路由。
- **分组管理员**（`adminIds`）只能查看和编辑其管理的分组；提交其分组之外的路由返回 `403`。
- 分组管理端点通过 `/admin/api/groups/:id/routes` 一次只操作一个分组；`groupId` 由路径参数强制指定。
- `owners` 列表限定哪些事件参与者（发送者登录名）的事件会被该分组的路由投递。

## 过滤器类型

实操指南见[过滤器教程](./filters)，包含完整示例。

| 类型      | 匹配对象         | 示例                             |
| --------- | ---------------- | -------------------------------- |
| `event`   | GitHub 事件名称  | `push`, `pull_request`, `issues` |
| `repo`    | 仓库全名         | `org/repo`                       |
| `actor`   | 发送者登录名     | `username`, `[bot]`              |
| `action`  | 事件操作         | `opened`, `closed`, `published`  |
| `branch`  | 分支名称         | `main`, `develop`                |
| `keyword` | 载荷正文中的文本 | `deploy`, `/fix\s+\d+/` (正则)   |

### 过滤器行为

- 路由中的所有过滤器必须都匹配才触发路由（AND 逻辑）
- 在任何过滤器上设置 `"exclude": true` 可反转匹配逻辑（NOT 逻辑）
- 非 keyword 过滤器为**精确、不区分大小写**的匹配——不支持通配符（`repo: "org/*"` 不会匹配任何内容）
- `keyword` 过滤器支持正则表达式——正则有误或超过 200 个字符时回退到子串匹配
- `branch` 过滤器适用于 push、pull_request、pull_request_review、pull_request_review_comment、create/delete、workflow_run 和 code_scanning_alert 事件

### 匹配值

过滤器接受单个字符串或字符串数组：

```json
{ "type": "event", "match": "push" }
{ "type": "event", "match": ["push", "pull_request"] }
```

## KV 存储布局

| 键模式                   | 值                                                  | TTL                |
| ------------------------ | --------------------------------------------------- | ------------------ |
| `config:routes`          | JSON 路由数组                                       | 永久               |
| `config:groups`          | JSON 分组数组                                       | 永久               |
| `session:{id}`           | 管理员会话 `{ userId, login }`                      | 7 天               |
| `token:{userId}`         | `{ userId, accessToken, expiresAt, refreshToken? }` | 0.9 × Token 有效期 |
| `token-reverse:{sha256}` | 用于按 Token 反查的用户 id                          | 0.9 × Token 有效期 |
| `discord-link:{userId}`  | 与 Discord 用户绑定的 GitHub 用户 id                | 永久               |
| `state:{hex}`            | `{ redirectTo, expiresAt, discordUserId? }`         | 600 秒             |
| `delivery:{id}`          | Webhook 投递 id（去重标记）                         | 300 秒             |
| `logs:send:{ts}-{hex}`   | 发送记录                                            | 1 小时             |
| `cmd:guild:{id}`         | 已注册命令的服务器 id（去重标记）                   | 永久               |
| `cmd:registered:global`  | 全局命令已注册标记（24h 去重）                      | 1 天               |
| `config:discord-app-id`  | Discord 应用 id 缓存                                | 永久               |
