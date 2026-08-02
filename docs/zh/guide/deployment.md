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
npx wrangler secret put GITHUB_APP_ID
npx wrangler secret put GITHUB_PRIVATE_KEY   # PKCS#8 PEM（BEGIN PRIVATE KEY）
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

::: warning GitHub App 私钥必须是 PKCS#8
GitHub 下发的私钥为 PKCS#1 格式（`BEGIN RSA PRIVATE KEY`）。Cloudflare Workers 的 JWT 签名要求 PKCS#8，需先转换：

```bash
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt \
  -in your-app.private-key.pem -out gh_pk_pkcs8.pem
```

然后将 `gh_pk_pkcs8.pem` 作为 `GITHUB_PRIVATE_KEY` 上传。
:::

Discord 交互通过 HTTPS Interactions Endpoint 送达，需要设置 `DISCORD_PUBLIC_KEY` 并把 **Interactions Endpoint URL** 指向 `https://your-domain/discord/interactions`。参见下方 [Interactions Endpoint](#interactions-endpoint)。

### 3. 部署

```bash
npx wrangler deploy
```

Worker 现在可通过 `https://webhooker.<your-subdomain>.workers.dev` 访问。

### 4. 配置 GitHub Webhook

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
   - **Repository permissions**: Contents (read)、Issues (write)、Pull requests (write)、Metadata (read)
   - **Organization permissions**: Members (read)——如果需要
4. 订阅事件（全部 23 种支持的事件）：
   - Push、Pull request、Issues、Issue comment、Workflow run、Release、Create、Delete、Star、Fork、Check run、Pull request review、Pull request review comment、Commit comment、Deployment status、Member、Label、Milestone、Discussion、Discussion comment、Repository、Code scanning alert、Dependabot alert
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

## 自定义域名（可选）

要使用自定义域名替代 `*.workers.dev`：

1. 进入 Cloudflare Worker 设置
2. 添加自定义域名或路由
3. 更新 `BASE_URL` 以匹配

## Docker

提供 Dockerfile 用于容器化部署（例如在反向代理后面）：

```bash
docker build -t webhooker .
docker run -p 8787:8787 --env-file .env webhooker
```

注意：Docker 模式下不包含 KV 等 Cloudflare 存储。完整功能请使用 Cloudflare 部署。
