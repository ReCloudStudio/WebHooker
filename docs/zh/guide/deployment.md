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
npx wrangler secret put GITHUB_PRIVATE_KEY
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_CHANNEL_ID
```

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
4. 使用 `bot` 权限范围邀请 Bot 到你的服务器，并勾选 `Send Messages` 权限
5. 将目标频道 ID 复制到 `DISCORD_CHANNEL_ID`

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

注意：Docker 模式下不包含 Durable Objects 和 KV。完整功能请使用 Cloudflare 部署。
