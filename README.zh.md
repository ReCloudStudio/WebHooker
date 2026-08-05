# WebHooker

GitHub webhook → Discord / Telegram 分发服务。通过 Cloudflare Workers 接收 webhook 事件，应用过滤器，将格式化消息路由到 Discord 频道/子区与 Telegram 群组/话题。

## 功能特性

- **28 种事件格式化** — push、pull_request、issues、issue_comment、workflow_run、workflow_job、status、deployment、deployment_status、check_run、check_suite、ping、release、create、delete、star、fork、pull_request_review、pull_request_review_comment、commit_comment、member、label、milestone、discussion、discussion_comment、repository、code_scanning_alert、dependabot_alert（+ 通用回退）
- HMAC-SHA256 签名验证（Web Crypto API）
- 按事件类型、仓库、操作人、操作、分支、关键词（支持正则）过滤
- 富消息：颜色编码、作者头像、字段、时间戳——渲染为 Discord embed 与 Telegram HTML
- 路由到 Discord 频道/子区与 Telegram 群组/话题（一条路由可多目标）
- `workflow_run` 进度**原地编辑**同一条消息（工作流推进时更新），两个平台均支持
- GitHub OAuth 用户授权（评论、编辑评论、删除评论、合并、关闭、反应）
- **Web 配置控制台**（`/admin`）— 通过 GitHub OAuth + 管理员白名单管理路由与分组、查看发送日志
- **Discord Interactions Endpoint**（Ed25519 验签）支持 `/gh` 斜杠命令、消息右键菜单命令、PR 合并/关闭按钮与评论 modal
- **Telegram `/gh` 命令**（login/logout/comment/merge/close），通过 Telegram webhook 接收，头像以链接预览卡片呈现
- Cloudflare KV 存储 token/状态/配置/会话 + D1 存储发送日志与平台账号绑定
- 优雅降级（Discord 不可用时仅 webhook 模式）

## 架构

```text
GitHub Webhook → Cloudflare Worker (Hono)
                 ├── POST /webhook → 验证 → 去重 → 过滤 → 格式化 → Discord (REST) / Telegram (Bot API)
                 ├── POST /discord/interactions → 验证 (Ed25519) → 处理命令/按钮/modal
                 ├── POST /telegram/webhook → 验证 (secret token) → 处理 /gh 命令
                 ├── GET  /auth/github → OAuth 流程
                 ├── GET  /api/richheader → Telegram 头像链接预览卡片
                 ├── POST /api/* → 用户操作（Bearer token 鉴权）
                 ├── /admin → 路由、分组与发送日志 Web UI
                 └── GET  /health → 健康检查
```

- **Cloudflare Worker** — HTTP 入口、签名验证、路由分发
- **Interactions Endpoint** — HTTPS 回调（无 Discord Gateway 连接、无 Durable Object）；bot 保持离线，命令通过 API 注册
- **KV** — Token 存储（`token:{userId}`）、OAuth state（`state:{hex}`）、路由配置（`config:routes`）、分组配置（`config:groups`）、管理员会话（`session:{id}`）、投递去重（`delivery:{id}`）、消息更新追踪（`msg:*`）
- **D1** — 发送日志（`send_logs`）、Discord↔GitHub 绑定（`discord_links`）、Telegram↔GitHub 绑定（`telegram_links`）

## 快速开始

```bash
npm install          # 或 bun install
cp .env.example .dev.vars   # 填写本地开发密钥
npx wrangler dev     # 启动本地开发服务器
```

## 配置

### 密钥（本地用 `.dev.vars`，生产用 Worker Secrets）

| 变量                        | 说明                                                                        |
| --------------------------- | --------------------------------------------------------------------------- |
| `GITHUB_WEBHOOK_SECRET`     | GitHub webhook 密钥                                                         |
| `GITHUB_APP_ID`             | GitHub App ID（当前代码未使用，为兼容保留）                                 |
| `GITHUB_PRIVATE_KEY`        | App 私钥（PKCS#8 PEM；当前代码未使用，为兼容保留）                          |
| `GITHUB_CLIENT_ID`          | OAuth Client ID                                                             |
| `GITHUB_CLIENT_SECRET`      | OAuth Client Secret                                                         |
| `DISCORD_TOKEN`             | 机器人 token                                                                |
| `DISCORD_PUBLIC_KEY`        | Discord 应用的公钥（开发者门户获取）—— 交互功能必需                         |
| `DISCORD_APPLICATION_ID`    | Discord 应用 ID（可选；省略时通过 `GET /oauth2/applications/@me` 自动获取） |
| `TELEGRAM_TOKEN`            | Telegram Bot Token（BotFather 获取）—— Telegram 路由必需                    |
| `TELEGRAM_WEBHOOK_SECRET`   | 可选；`POST /telegram/webhook` 的验签密钥                                   |
| `TELEGRAM_RICH_HEADER_HOST` | 可选；覆盖内置 `GET /api/richheader` 的 Telegram 头像卡片地址               |
| `BASE_URL`                  | 公网地址（用于 OAuth 回调与 Telegram webhook 同步）                         |
| `ADMIN_USER_IDS`            | 允许访问 `/admin` 的 GitHub 用户 ID（或登录名），逗号分隔                   |
| `DOCS_URL`                  | 可选；落地页使用的文档站点 URL                                              |
| `GITHUB_REPO_URL`           | 可选；落地页使用的 GitHub 仓库 URL                                          |
| `LEGAL_CONTACT`             | 可选；`/terms` 与 `/privacy` 页面展示的联系方式                             |

### 路由配置

路由存储在 KV（`config:routes`，JSON 格式）。**没有默认路由**——每条路由（包括目标）都必须显式定义，可通过 Web 控制台（`/admin`）或直接向 KV 存储 JSON 数组。一条路由可携带多个 `targets`，因此一个规则可以同时转发到多个频道：

```json
[
  {
    "id": "all-push",
    "name": "Push 事件",
    "enabled": true,
    "groupId": "default",
    "filters": [{ "type": "event", "match": "push" }],
    "targets": [
      { "platform": "discord", "channelId": "频道ID" },
      { "platform": "telegram", "chatId": "-1001234567890" }
    ]
  }
]
```

`target.platform` 选择推送目标：`discord`（默认）或 `telegram`。Discord 目标需 `target.channelId`（可选 `threadId` 指向子区）；Telegram 目标需 `target.chatId`（可选 `topicId` 指向话题）。旧的单数 `target` 字段仍会被自动迁移。不存在默认频道回退。

路由隶属于**分组**（KV `config:groups`），分组用于限定管理权限，并可限制哪些组织/用户的事件流入。完整模式见 `config.example.yaml` 与 `docs/zh/guide/configuration.md`。

### Web 控制台（`/admin`）

内置的配置控制台让你在浏览器中管理路由与分组（新增 / 编辑 / 删除 / 开关 / 排序），并查看发送日志——无需操作 KV：

1. 设置 `ADMIN_USER_IDS` 为允许管理控制台的 GitHub 用户 ID（或登录名），例如 `ADMIN_USER_IDS=12345,RhenCloud`。
2. 访问 `/admin` 并用 GitHub 登录，仅白名单内用户可进入。
3. 修改会立即写入 KV，webhook 管线随即生效。

在 `/admin/logout` 退出登录。

完整语法示例见 `config.example.yaml`。

### 过滤器类型

| 类型      | 匹配内容                            | 备注                                                                                                          |
| --------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `event`   | `push`、`pull_request`、`issues` 等 | GitHub 事件名                                                                                                 |
| `repo`    | `org/repo` 全名                     |                                                                                                               |
| `actor`   | 发送者登录名                        |                                                                                                               |
| `action`  | `opened`、`closed`、`published` 等  |                                                                                                               |
| `branch`  | 分支名                              | 支持 push、PR/review、create/delete、workflow_run、workflow_job、check_suite、deployment、code_scanning_alert |
| `keyword` | payload 中的文本                    | 支持正则表达式；无效正则回退为子串匹配                                                                        |

设置 `exclude: true` 可取反过滤器。

## API

### 健康检查

- `GET /health` — 返回 `{"status": "ok"}`

### OAuth

- `GET /auth/github` — 发起 GitHub OAuth 授权（重定向到 GitHub）
- `GET /auth/github/callback` — OAuth 回调（交换 code 为 token；管理员会话 / Discord 绑定 / Telegram 绑定）
- `DELETE /auth/token/:userId` — 撤销用户 token

### 操作接口（需要 `Authorization: Bearer <token>` 头）

- `POST /api/comment` — 创建 issue 评论
- `POST /api/merge` — 合并 PR
- `POST /api/close` — 关闭 PR
- `POST /api/react` — 添加 issue 反应

### 管理接口（需要管理员 OAuth 会话）

- `GET /admin` — 配置控制台页面
- `GET /admin/login` — 开始管理员登录（GitHub OAuth）
- `GET /admin/logout` — 退出登录
- `GET /admin/api/routes` — 列出路由
- `PUT /admin/api/routes` — 替换路由
- `GET /admin/api/groups` — 列出分组（按权限过滤）
- `PUT /admin/api/groups` — 替换分组（仅超级管理员）
- `GET /admin/api/groups/:groupId/routes` — 列出某分组的路由
- `PUT /admin/api/groups/:groupId/routes` — 替换某分组的路由
- `GET /admin/api/me` — 当前会话 / 权限范围
- `GET /admin/api/logs` — 发送日志（按权限过滤）
- `GET /admin/api/logs/:id` — 单条发送日志

## GitHub App 配置教程

### 1. 创建 App

1. 访问 <https://github.com/settings/apps/new>
2. 填写信息：
   - **GitHub App name**：`WebHooker`（或自定义名称）
   - **Homepage URL**：你的域名
   - **Webhook URL**：`https://your-domain/webhook`
   - **Webhook secret**：生成并复制到 `GITHUB_WEBHOOK_SECRET`
3. 设置权限：
   - **Repository permissions**：Contents (read)、Issues (write)、Pull requests (write)、Metadata (read)、Checks (read)、Deployments (read)、Discussions (read)、Code scanning alerts (read)、Dependabot alerts (read)
   - **Organization permissions**：Members (read) — 如需要
4. 订阅事件：Push、Pull request、Issues、Issue comment、Workflow run、Workflow job、Status、Deployment、Deployment status、Ping、Release、Create、Delete、Star、Fork、Check run、Check suite、Pull request review、Pull request review comment、Commit comment、Member、Label、Milestone、Discussion、Discussion comment、Repository、Code scanning alert、Dependabot alert
5. 生成私钥 — `GITHUB_PRIVATE_KEY` 当前未被代码使用（OAuth 流程只用到 Client ID/Secret），因此为可选；若日后启用 GitHub App 认证可再配置。

### 2. 安装 App

1. 创建后进入 App 设置页
2. 点击 "Install App" → 选择组织/用户
3. 选择要监控的仓库

### 3. 配置 OAuth

1. 进入 App → OAuth settings
2. 设置 **Callback URL**：`https://your-domain/auth/github/callback`
3. 复制 Client ID 和 Client Secret 到环境变量

## Discord 机器人配置

在 <https://discord.com/developers/applications> 创建机器人，将 Token 复制到 `DISCORD_TOKEN`。

### OAuth2 邀请

使用 `bot` scope 将机器人加入服务器，需要以下权限：

| 权限                                        | 数值           | 用途                                     |
| ------------------------------------------- | -------------- | ---------------------------------------- |
| 查看频道 (View Channels)                    | `1024`         | 查看目标频道以发送消息                   |
| 发送消息 (Send Messages)                    | `2048`         | 向频道发送 embed/消息                    |
| 在线程中发送消息 (Send Messages in Threads) | `274877906944` | 当路由配置了 `threadId` 时向线程发送消息 |

权限组合整数值：`274877910016`

邀请链接（将 `CLIENT_ID` 替换为机器人的 Client ID）。需要 `applications.commands` scope，否则无法注册斜杠 / 右键菜单命令：

```
https://discord.com/oauth2/authorize?client_id=你的机器人CLIENT_ID&permissions=274877910016&scope=bot+applications.commands
```

### Interactions Endpoint

将应用的 **Public Key**（开发者门户 → General Information）复制到 `DISCORD_PUBLIC_KEY`，并将 **Interactions Endpoint URL** 设为 `https://your-domain/discord/interactions`。所有交互（斜杠命令、按钮、modal）均通过 Ed25519 签名验证。

bot 从不连接 Discord Gateway，因此显示为**离线**——消息推送不受影响（始终走 REST）。

### Bot 指令（以本人身份评论 GitHub）

bot 通过定时任务（每 5 分钟）同步注册原生的**斜杠命令**与**消息右键菜单命令**：按服务器注册以获得即时可用性，并全局注册（24h 去重，约 1 小时传播）。评论以**你本人**绑定的 GitHub 账号（OAuth）发出，权限交由 GitHub 判定——若 GitHub 拒绝（例如去修改他人评论），bot 会提示你无权限。所有回复均为 ephemeral（仅你可见）。

**1. 绑定账号**（一次即可）：

```
/gh login     → 返回一个 ephemeral 授权链接，用于绑定你的 GitHub 账号
/gh logout    → 解除绑定
```

**2. 添加 / 编辑 / 删除评论** —— 两种等价方式：

- **右键点击通知**（推荐）：右键一条 bot 推送的 issue / PR / 评论通知 → **应用（Apps）** → **GitHub: 添加评论 / 编辑评论 / 删除评论**。目标会从通知 embed 中自动提取，无需粘贴链接。
- **斜杠命令 + 链接**：

  ```
  /gh comment add  link:<issue 或 PR 链接>          例如 https://github.com/owner/repo/issues/123
  /gh comment edit link:<评论链接>                  链接需包含 #issuecomment-<id>
  /gh comment del  link:<评论链接>                  链接需包含 #issuecomment-<id>
  ```

  `edit` / `del` 需要具体的评论链接（在 GitHub 上：评论 ⋯ 菜单 → **Copy link**）。`add` / `edit` 会弹出 modal 让你输入 / 修改评论内容（编辑时预填原文）。

**3. 合并 / 关闭 PR** —— 打开状态的 PR 通知会附带 **合并 / 关闭** 按钮：

- 点击按钮后以**你绑定**的 GitHub 账号执行合并（squash）或关闭操作，权限交由 GitHub 判定。操作成功后通知上的按钮会被移除，结果以 ephemeral 回复显示。

**要求：**

| 项目       | 说明                                                             |
| ---------- | ---------------------------------------------------------------- |
| Public Key | 已配置 `DISCORD_PUBLIC_KEY` 且已设置 Interactions Endpoint URL   |
| 邀请 scope | 邀请时带上 `applications.commands`（见上方邀请链接）             |
| OAuth      | 已配置 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` 与 `BASE_URL` |
| 用户绑定   | 每个用户先执行 `/gh login`                                       |

## Telegram 机器人配置

1. 用 [@BotFather](https://t.me/BotFather) 创建机器人，将 Token 复制到 `TELEGRAM_TOKEN`。
2. （可选）设置 `TELEGRAM_WEBHOOK_SECRET`；webhook 注册时会作为 `secret_token` 传给 Telegram，`POST /telegram/webhook` 使用时间安全比较校验。
3. Worker 会在定时任务中自动同步 webhook（`setWebhook` 指向 `{BASE_URL}/telegram/webhook`），因此无需手动调用 `setWebhook`——只需确保 `BASE_URL` 已设置。
4. 将机器人加入群组（或启用话题），在路由配置中用 `chatId` / `topicId` 指定目标。

在 Telegram 中，`/gh` 命令通过在通知消息上**回复**来使用：

- `/gh login` — 绑定你的 GitHub 账号（返回 OAuth 链接）
- `/gh logout` — 解除绑定
- `/gh comment <内容>` — 回复一条 issue/PR 通知，以本人身份评论
- `/gh merge` / `/gh close` — 回复一条 PR 通知，合并/关闭该 PR

头像使用内置 `GET /api/richheader` 渲染为链接预览卡片（可用 `TELEGRAM_RICH_HEADER_HOST` 覆盖）。

## 部署

```bash
# 在 Cloudflare 设置密钥
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put TELEGRAM_TOKEN
npx wrangler secret put ADMIN_USER_IDS

# 创建 KV 命名空间
npx wrangler kv namespace create KV
# 更新 wrangler.jsonc 中的 KV namespace ID

# 创建 D1 数据库并执行迁移
npx wrangler d1 create webhooker
# 更新 wrangler.jsonc d1_databases 中的数据库 ID
npx wrangler d1 execute webhooker --remote --file ./migrations/0001_init.sql
npx wrangler d1 execute webhooker --remote --file ./migrations/0002_log_detail.sql
npx wrangler d1 execute webhooker --remote --file ./migrations/0003_telegram_links.sql

# 部署
npx wrangler deploy
```

## 开发命令

```bash
npx wrangler dev      # 本地开发服务器（Miniflare）
npm run typecheck     # 类型检查
npm run lint          # ESLint
npm test              # 单元测试（bun test）
```

## 支持的事件

| 事件                          | 格式化内容                           |
| ----------------------------- | ------------------------------------ |
| `push`                        | 提交列表、分支、作者                 |
| `pull_request`                | PR 标题、分支、差异统计              |
| `issues`                      | Issue 标题、标签、指派人             |
| `issue_comment`               | 评论内容、Issue 引用                 |
| `workflow_run`                | 工作流状态、结论、耗时（原地更新）   |
| `workflow_job`                | 作业名、状态、结论                   |
| `status`                      | 提交状态、上下文、状态值             |
| `deployment`                  | 环境、引用、任务                     |
| `deployment_status`           | 环境、状态、commit ref               |
| `check_run`                   | 状态、结论、详情链接                 |
| `check_suite`                 | 套件结论、head 分支、提交            |
| `ping`                        | Webhook 确认                         |
| `release`                     | Tag、内容、资产                      |
| `create` / `delete`           | 分支/tag 创建或删除                  |
| `star`                        | Star 数量、仓库                      |
| `fork`                        | Fork 来源 → 目标                     |
| `pull_request_review`         | 审查状态、内容预览                   |
| `pull_request_review_comment` | 行内代码评论、文件路径、行号         |
| `commit_comment`              | Commit SHA、评论内容                 |
| `member`                      | 协作者添加/移除                      |
| `label`                       | 标签名、颜色、描述                   |
| `milestone`                   | 进度条、open/closed 计数、截止日期   |
| `discussion`                  | 讨论标题、分类、操作                 |
| `discussion_comment`          | 评论内容、讨论引用                   |
| `repository`                  | 仓库重命名/转移详情                  |
| `code_scanning_alert`         | 严重程度、规则 ID、文件路径          |
| `dependabot_alert`            | 严重程度、包名、受影响范围、修复版本 |

任何其他事件类型回退到通用格式化器（事件类型、操作、操作人、仓库、原始载荷）。

## 许可证

MIT
