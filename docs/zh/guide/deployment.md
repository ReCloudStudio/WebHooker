# 部署

## Cloudflare 设置

### 1. 创建 KV 命名空间

```bash
npx wrangler kv namespace create KV
```

这会输出一个命名空间 ID。更新 `wrangler.jsonc`，填入 ID：

```jsonc
{
  "kv_namespaces": [
    {
      "binding": "KV",
      "id": "your-namespace-id",
    },
  ],
}
```

### 2. 设置密钥

```bash
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY   # Discord 应用的公钥（开发者门户获取），交互功能必需
npx wrangler secret put TELEGRAM_TOKEN       # Telegram Bot Token（BotFather 获取）—— Telegram 路由必需
npx wrangler secret put ADMIN_USER_IDS       # 逗号分隔的 GitHub ID/登录名，允许进入 Web UI
```

::: tip 目标频道按路由配置
不存在全局频道密钥。每条路由在 [Web 控制台](/zh/guide/configuration#web-控制台) 中声明各自的目标频道（及可选的子区/thread），因此不需要 `DISCORD_CHANNEL_ID`。
:::

::: tip GitHub App ID / 私钥未使用
`GITHUB_APP_ID` 与 `GITHUB_PRIVATE_KEY` 当前未被代码使用——OAuth 流程只需要
`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`。无需设置（也无需进行 PKCS#8 转换）。
:::

Discord 交互通过 HTTPS Interactions Endpoint 送达，需要设置 `DISCORD_PUBLIC_KEY` 并把 **Interactions Endpoint URL** 指向 `https://your-domain/discord/interactions`。参见下方 [Interactions Endpoint](#interactions-endpoint)。

### 3. 创建 D1 数据库并执行迁移

```bash
npx wrangler d1 create webhooker
```

将返回的数据库 ID 填入 `wrangler.jsonc`：

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "webhooker",
      "database_id": "your-database-id",
    },
  ],
}
```

然后执行迁移：

```bash
npm run db:migrate:prod   # 将迁移应用到远端 D1 数据库
npm run db:migrate        # 将迁移应用到本地（Miniflare）数据库
```

`db:migrate` 脚本执行 `wrangler d1 migrations apply webhooker`（见 `package.json`），逐一应用 `migrations/` 下的 SQL 文件，并在 `d1_migrations` 表中记录已应用的版本。

::: tip 曾用 `d1 execute` 迁移过的数据库
如果数据库已有这些表/列（例如之前用 `wrangler d1 execute --file` 迁移过），可能缺少 `d1_migrations` 追踪表，`db:migrate:prod` 会尝试重新执行所有迁移；`0002_log_detail.sql` 中的 `ALTER TABLE ... ADD COLUMN` 语句会因列已存在而失败。此时请直接执行文件：

```bash
npx wrangler d1 execute webhooker --remote --file ./migrations/0001_init.sql
npx wrangler d1 execute webhooker --remote --file ./migrations/0002_log_detail.sql
npx wrangler d1 execute webhooker --remote --file ./migrations/0003_telegram_links.sql
```

:::

### 4. 部署

```bash
npx wrangler deploy
```

Worker 现在可通过 `https://webhooker.<your-subdomain>.workers.dev` 访问。

### 5. 配置 GitHub Webhook

1. 进入 GitHub App 设置页面
2. 设置 **Webhook URL** 为 `https://webhooker.<your-subdomain>.workers.dev/webhook`
3. 设置 **Webhook secret** 与 `GITHUB_WEBHOOK_SECRET` 一致

## GitHub App 设置

### 1. 创建 App

1. 打开 <https://github.com/settings/apps/new>
2. 填写：
   - **GitHub App name**: `WebHooker`（或自定义名称）
   - **Homepage URL**: 你的域名
   - **Webhook URL**: `https://your-domain/webhook`
   - **Webhook secret**: 生成并复制到 `GITHUB_WEBHOOK_SECRET`
3. 设置权限：
   - **Repository permissions**: Contents (read)、Issues (write)、Pull requests (write)、Metadata (read)、Checks (read)、Deployments (read)、Discussions (read)、Code scanning alerts (read)、Dependabot alerts (read)
   - **Organization permissions**: Members (read) —— 如果需要
4. 订阅事件（全部 28 种支持的事件）：
   - Push、Pull request、Issues、Issue comment、Workflow run、Workflow job、Status、Deployment、Deployment status、Ping、Release、Create、Delete、Star、Fork、Check run、Check suite、Pull request review、Pull request review comment、Commit comment、Member、Label、Milestone、Discussion、Discussion comment、Repository、Code scanning alert、Dependabot alert
5. 生成私钥 → 将内容保存到 `GITHUB_PRIVATE_KEY` 环境变量

### 2. 安装 App

1. 创建后，进入 App 设置页面
2. 点击 "Install App" → 选择组织/用户
3. 选择要监控的仓库

### 3. 配置 OAuth

1. 进入 App → OAuth 设置
2. 设置 **Callback URL**: `https://your-domain/auth/github/callback`
3. 将 Client ID 和 Client Secret 复制到环境变量

## Discord Bot 设置

1. 打开 <https://discord.com/developers/applications>
2. 创建新应用 → 进入 Bot 部分
3. 将 Bot Token 复制到 `DISCORD_TOKEN`
4. 使用 `bot` 与 `applications.commands` 两个 scope 邀请 Bot，并勾选 `View Channels` + `Send Messages` + `Send Messages in Threads` 权限（组合整数 `274877910016`）：

   ```text
   https://discord.com/oauth2/authorize?client_id=YOUR_BOT_CLIENT_ID&permissions=274877910016&scope=bot+applications.commands
   ```

5. 在 Web UI（`/admin`）中**按路由**配置目标频道——无需全局频道 ID。

### Interactions Endpoint

消息通过 Discord **REST API** 发送，因此仅凭 `DISCORD_TOKEN` 即可推送。交互（斜杠命令、按钮、modal）则通过 HTTPS Interactions Endpoint 送达：

1. 在 Discord 开发者门户 → General Information 复制应用的 **Public Key**，填入 `DISCORD_PUBLIC_KEY`。
2. 将 **Interactions Endpoint URL** 设为 `https://your-domain/discord/interactions`。
3. 所有交互请求都使用 Ed25519 签名验证（`X-Signature-Ed25519` 覆盖 `X-Signature-Timestamp + body`）。

`/gh` 斜杠命令与 `GitHub: 添加/编辑/删除评论` 消息命令由定时任务（每 5 分钟）同步注册：按服务器即时可用，同时全局注册（24h 去重，约 1 小时传播）。Bot 从不连接 Discord Gateway，因此显示为**离线**——消息推送不受影响（始终走 REST）。

用户运行 `/gh login` 绑定自己的 GitHub 账号，即可以本人身份评论 issue/PR。完整命令说明见 [README](https://github.com/ReCloudStudio/WebHooker#bot-commands-comment-on-github-as-yourself)。

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

## 自定义域名（可选）

要使用自定义域名替代 `*.workers.dev`：

1. 进入 Cloudflare Worker 设置
2. 添加自定义域名或路由
3. 更新 `BASE_URL` 以匹配

> [!NOTE]
> 本项目是一个 Cloudflare Worker，依赖 `wrangler.jsonc` 中声明的 KV 与 D1 绑定，无法作为独立的 Node/容器进程运行。
