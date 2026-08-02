# 快速开始

## 前置要求

- [Node.js](https://nodejs.org/) 18+
- [Cloudflare 账号](https://dash.cloudflare.com/)（免费套餐即可）
- [GitHub App](https://github.com/settings/apps/new)（参见 [GitHub App 设置](/zh/guide/deployment#github-app-设置)）
- Discord Bot Token（参见 [Discord Bot 设置](/zh/guide/deployment#discord-bot-设置)）

## 安装

```bash
git clone https://github.com/ReCloudStudio/WebHooker.git
cd WebHooker
npm install
```

## 本地开发

### 1. 配置密钥

复制示例环境变量文件并填入你的密钥：

```bash
cp .env.example .dev.vars
```

编辑 `.dev.vars`，填入实际值：

```bash
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_APP_ID=your-app-id
GITHUB_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
DISCORD_TOKEN=your-bot-token
DISCORD_PUBLIC_KEY=your-public-key
ADMIN_USER_IDS=your-github-id,your-github-login
BASE_URL=http://localhost:8787
```

::: tip
`GITHUB_PRIVATE_KEY` 必须是 **PKCS#8** 格式（`BEGIN PRIVATE KEY`）。用 `openssl pkcs8 -nocrypt -in app.pem -out pkcs8.pem` 转换 GitHub 下发的 PKCS#1 私钥。目标频道在 Web UI 中按路由设置，因此不需要 `DISCORD_CHANNEL_ID`。若要在本地启用 `/gh` 命令，请在开发者门户复制 **Public Key** 填入 `DISCORD_PUBLIC_KEY`，并把 Interactions Endpoint URL 设为 `http://localhost:8787/discord/interactions`。
:::

::: warning
`.dev.vars` 已被 gitignore，包含敏感信息，请勿提交。
:::

### 2. 启动开发服务器

```bash
npm run dev
```

这将在 `http://localhost:8787` 启动本地 Miniflare 环境。

### 3. 验证

```bash
curl http://localhost:8787/health
# → {"status":"ok"}
```

## 可用脚本

| 脚本                   | 说明                          |
| ---------------------- | ----------------------------- |
| `npm run dev`          | 启动本地开发服务器 (wrangler) |
| `npm run deploy`       | 部署到 Cloudflare             |
| `npm run typecheck`    | TypeScript 类型检查           |
| `npm run lint`         | ESLint                        |
| `npm run lint:md`      | Markdownlint                  |
| `npm run format`       | 使用 Prettier 格式化          |
| `npm run format:check` | 检查 Prettier 格式            |
| `npm run docs:dev`     | 启动文档开发服务器            |
| `npm run docs:build`   | 构建文档站点                  |
