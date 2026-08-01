# WebHooker

GitHub webhook → Discord 分发服务。通过 Cloudflare Workers 接收 webhook 事件，应用过滤器，将格式化消息路由到 Discord 频道或子区。

## 功能特性

- **23 种事件格式化** — push、pull_request、issues、issue_comment、workflow_run、release、create、delete、star、fork、check_run、pull_request_review、pull_request_review_comment、commit_comment、deployment_status、member、label、milestone、discussion、discussion_comment、repository、code_scanning_alert、dependabot_alert（+ 通用回退）
- HMAC-SHA256 签名验证（Web Crypto API）
- 按事件类型、仓库、操作人、操作、分支（含 PR）、关键词（支持正则）过滤
- 富 Discord embed：颜色编码、作者头像、字段、时间戳
- 路由到频道或子区
- GitHub App OAuth 用户授权（评论、合并、反应）
- **Web 配置控制台**（`/admin`）— 通过 GitHub OAuth + 管理员白名单管理路由
- Durable Object 维持 Discord Gateway WebSocket 连接 + 频道缓存
- Cloudflare KV 存储 token/状态/配置
- 优雅降级（Discord 不可用时仅 webhook 模式）

## 架构

```text
GitHub Webhook → Cloudflare Worker (Hono)
                 ├── POST /webhook → 验证 → 过滤 → 格式化 → DO (Discord Gateway) → Discord
                 ├── GET  /auth/github → OAuth 流程
                 ├── POST /api/* → 用户操作（Bearer token 鉴权）
                 └── GET  /health → 健康检查
```

- **Cloudflare Worker** — HTTP 入口、签名验证、路由分发
- **Durable Object (DiscordGateway)** — 持久 WebSocket 连接 Discord Gateway、频道缓存、消息发送（含重试）
- **KV** — Token 存储（`token:{userId}`）、OAuth state（`state:{hex}`）、路由配置（`config:routes`）

## 快速开始

```bash
npm install          # 或 bun install
cp .env.example .dev.vars   # 填写本地开发密钥
npx wrangler dev     # 启动本地开发服务器
```

## 配置

### 密钥（本地用 `.dev.vars`，生产用 Worker Secrets）

| 变量                      | 说明                                                                       |
| ------------------------- | -------------------------------------------------------------------------- |
| `GITHUB_WEBHOOK_SECRET`   | GitHub webhook 密钥                                                        |
| `GITHUB_APP_ID`           | GitHub App ID                                                              |
| `GITHUB_PRIVATE_KEY`      | App 私钥（PEM）                                                            |
| `GITHUB_CLIENT_ID`        | OAuth Client ID                                                            |
| `GITHUB_CLIENT_SECRET`    | OAuth Client Secret                                                        |
| `DISCORD_TOKEN`           | 机器人 token                                                               |
| `BASE_URL`                | 公网地址（用于 OAuth 回调）                                                |
| `ADMIN_USER_IDS`          | 允许访问 `/admin` 的 GitHub 用户 ID（或登录名），逗号分隔                  |
| `DISCORD_GATEWAY_ENABLED` | 设为 `true` 启用 Discord Gateway（bot 在线状态）；不启用也能通过 REST 推送 |

### 路由配置

路由存储在 KV（`config:routes`，JSON 格式）。**没有默认路由**——每条路由（包括目标 `channelId` / `threadId`）都必须显式定义，可通过 Web 控制台（`/admin`）或直接向 KV 存储 JSON 数组：

```json
[
  {
    "id": "all-push",
    "name": "Push 事件",
    "enabled": true,
    "filters": [{ "type": "event", "match": "push" }],
    "target": { "channelId": "频道ID" }
  }
]
```

`target.channelId` 必填且按原样使用，不存在默认频道回退。

### Web 控制台（`/admin`）

内置的配置控制台让你在浏览器中管理路由（新增 / 编辑 / 删除 / 开关），无需操作 KV：

1. 设置 `ADMIN_USER_IDS` 为允许管理控制台的 GitHub 用户 ID（或登录名），例如 `ADMIN_USER_IDS=12345,RhenCloud`。
2. 访问 `/admin` 并用 GitHub 登录，仅白名单内用户可进入。
3. 修改会立即写入 KV `config:routes`，webhook 管线随即生效。

在 `/admin/logout` 退出登录。

完整语法示例见 `config.example.yaml`。

### 过滤器类型

| 类型      | 匹配内容                            | 备注                                                            |
| --------- | ----------------------------------- | --------------------------------------------------------------- |
| `event`   | `push`、`pull_request`、`issues` 等 | GitHub 事件名                                                   |
| `repo`    | `org/repo` 全名                     |                                                                 |
| `actor`   | 发送者登录名                        |                                                                 |
| `action`  | `opened`、`closed`、`published` 等  |                                                                 |
| `branch`  | 分支名                              | 支持 push、PR、create/delete、workflow_run、code_scanning_alert |
| `keyword` | payload 中的文本                    | 支持正则表达式；无效正则回退为子串匹配                          |

设置 `exclude: true` 可取反过滤器。

## API

### 健康检查

- `GET /health` — 返回 `{"status": "ok"}`

### OAuth

- `GET /auth/github` — 发起 GitHub OAuth 授权（重定向到 GitHub）
- `GET /auth/github/callback` — OAuth 回调（交换 code 为 token）
- `DELETE /auth/token/:userId` — 撤销用户 token

### 操作接口（需要 `Authorization: Bearer <token>` 头）

- `POST /api/comment` — 创建 issue 评论
- `POST /api/merge` — 合并 PR
- `POST /api/react` — 添加 issue 反应

### 管理接口（需要管理员 OAuth 会话）

- `GET /admin` — 配置控制台页面
- `GET /admin/login` — 开始管理员登录（GitHub OAuth）
- `GET /admin/logout` — 退出登录
- `GET /admin/api/routes` — 列出路由
- `PUT /admin/api/routes` — 替换路由

## GitHub App 配置教程

### 1. 创建 App

1. 访问 <https://github.com/settings/apps/new>
2. 填写信息：
   - **GitHub App name**：`WebHooker`（或自定义名称）
   - **Homepage URL**：你的域名
   - **Webhook URL**：`https://your-domain/webhook`
   - **Webhook secret**：生成并复制到 `GITHUB_WEBHOOK_SECRET`
3. 设置权限：
   - **Repository permissions**：Contents (read)、Issues (write)、Pull requests (write)、Metadata (read)
   - **Organization permissions**：Members (read) — 如需要
4. 订阅事件：Push、Pull request、Issues、Issue comment、Workflow run、Release、Create、Delete、Star、Fork、Check run、Pull request review、Pull request review comment、Commit comment、Deployment status、Member、Label、Milestone、Discussion、Discussion comment、Repository、Code scanning alert、Dependabot alert
5. 生成私钥 → 将内容保存到 `GITHUB_PRIVATE_KEY` 环境变量

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

邀请链接（将 `CLIENT_ID` 替换为机器人的 Client ID）：

```
https://discord.com/oauth2/authorize?client_id=你的机器人CLIENT_ID&permissions=274877910016&scope=bot
```

### Intents

Gateway 连接仅使用 **GUILDS** intent（`1 << 0`）。无需特权 intent（如 Message Content）。

### Gateway（可选）

Discord Gateway 连接仅用于让 bot 显示为**在线**——发送消息**不需要**它。消息通过 Discord REST API 发送，因此只要有 `DISCORD_TOKEN` 即可推送。

- `DISCORD_GATEWAY_ENABLED=false`（默认）：直接通过 REST 发送消息，不建立 Gateway 连接。
- `DISCORD_GATEWAY_ENABLED=true`：由 Durable Object 连接 Gateway 以维持 bot 在线状态；消息仍走 REST。

### Bot 指令（`!gh`）

启用 Gateway 后，**引用（回复）**一条 bot 推送的 issue / PR 通知，然后输入：

```
!gh <评论内容>
```

bot 会以 GitHub App 的身份把内容发为对该 issue / PR 的评论。

**额外要求：**

| 项目         | 说明                                                                                    |
| ------------ | --------------------------------------------------------------------------------------- |
| 启用 Gateway | `DISCORD_GATEWAY_ENABLED=true`                                                          |
| 特权 intent  | 在 Discord Developer Portal → Bot → Privileged Gateway Intents 开启 **Message Content** |
| 权限         | 除发送外还需 **Read Message History**（读取被引用的消息）                               |
| GitHub App   | 已安装到该仓库且有 **Issues (write)** 权限                                              |

## 部署

```bash
# 在 Cloudflare 设置密钥
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npx wrangler secret put GITHUB_APP_ID
npx wrangler secret put GITHUB_PRIVATE_KEY
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_CHANNEL_ID

# 创建 KV 命名空间
npx wrangler kv namespace create KV

# 更新 wrangler.jsonc 中的 KV namespace ID

# 部署
npx wrangler deploy
```

## 开发命令

```bash
npx wrangler dev      # 本地开发服务器（Miniflare）
npm run typecheck     # 类型检查
npm run lint          # ESLint
```

## 支持的事件

| 事件                          | 格式化内容                           |
| ----------------------------- | ------------------------------------ |
| `push`                        | 提交列表、分支、作者                 |
| `pull_request`                | PR 标题、分支、差异统计              |
| `issues`                      | Issue 标题、标签、指派人             |
| `issue_comment`               | 评论内容、Issue 引用                 |
| `workflow_run`                | 工作流状态、结论、耗时               |
| `release`                     | Tag、内容、资产                      |
| `create` / `delete`           | 分支/tag 创建或删除                  |
| `star`                        | Star 数量、仓库                      |
| `fork`                        | Fork 来源 → 目标                     |
| `check_run`                   | 状态、结论、详情链接                 |
| `pull_request_review`         | 审查状态、内容预览                   |
| `pull_request_review_comment` | 行内代码评论、文件路径、行号         |
| `commit_comment`              | Commit SHA、评论内容                 |
| `deployment_status`           | 环境、状态、commit ref               |
| `member`                      | 协作者添加/移除                      |
| `label`                       | 标签名、颜色、描述                   |
| `milestone`                   | 进度条、open/closed 计数、截止日期   |
| `discussion`                  | 讨论标题、分类、操作                 |
| `discussion_comment`          | 评论内容、讨论引用                   |
| `repository`                  | 仓库重命名/转移详情                  |
| `code_scanning_alert`         | 严重程度、规则 ID、文件路径          |
| `dependabot_alert`            | 严重程度、包名、受影响范围、修复版本 |

## 许可证

MIT
