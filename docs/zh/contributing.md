# 贡献

## 开发环境设置

```bash
git clone https://github.com/ReCloudStudio/WebHooker.git
cd WebHooker
npm install
cp .env.example .dev.vars   # 填入密钥
npm run dev                  # 启动本地开发服务器
```

## 项目结构

```text
src/
├── index.ts              # CF Workers 入口 (fetch + scheduled)，导出 DiscordGateway DO
├── types.ts              # Env、Config、Route、Filter、WebhookEvent、FormattedMessage
├── config.ts             # 从 KV 加载路由（未设置时返回 []），从 env 构建 Config
├── server.ts             # Hono 应用: /health、/webhook，挂载 /auth、/admin + /
├── webhook.ts            # HMAC 验证 (Web Crypto)、parseEvent、extractBranch、matchRoute
├── discord.ts            # 通过 Discord REST 分发（启用 Gateway 时走 DO RPC）、initGateway (scheduled)
├── discord-rest.ts       # Discord REST sendMessage，带重试和限流处理
├── discord-gateway.ts    # Durable Object: Discord Gateway WS、心跳、频道缓存、发送
├── formatter.ts          # 23 种事件格式化器 + 通用回退
├── github-oauth.ts       # OAuth URL、回调 Token 交换、getUserOctokit
├── oauth-routes.ts       # GET /auth/github、回调、DELETE /token/:userId (KV 状态)
├── action-routes.ts      # POST /api/comment|merge|close|react (通过 KV 查找进行 Bearer Token 鉴权)
├── admin-routes.ts       # /admin API：路由、分组、me、日志（会话 + 权限范围鉴权）
├── admin-session.ts      # 管理员会话 CRUD (KV session:{id})、Cookie 辅助函数
├── groups.ts             # 分组加载、分组管理员权限范围
├── i18n.ts               # 消息语言覆盖 (en/zh)
├── send-log.ts           # 发送日志 (logs:send KV 键)
├── token-store.ts        # 基于 KV 的 Token CRUD，带 findUserIdByToken 反向查找
├── home-routes.ts        # 落地页路由
├── legal-routes.ts       # 法律页面路由
└── log.ts                # JSON 控制台日志 (info/warn/error/fatal)
```

## 脚本

| 命令                   | 说明                          |
| ---------------------- | ----------------------------- |
| `npm run dev`          | 启动 wrangler dev 服务器      |
| `npm run typecheck`    | TypeScript 类型检查           |
| `npm run lint`         | ESLint (TypeScript)           |
| `npm run lint:md`      | Markdownlint (Markdown)       |
| `npm test`             | 运行单元测试 (bun test)       |
| `npm run format`       | 使用 Prettier 格式化所有文件  |
| `npm run format:check` | 检查 Prettier 格式            |
| `npm run docs:dev`     | 启动 VitePress 文档开发服务器 |
| `npm run docs:build`   | 构建文档站点                  |

## 代码风格

- **TypeScript** 严格模式
- **双引号** 字符串
- **分号** 必需
- **尾逗号** 所有位置
- **100 字符** 打印宽度
- **ESLint** 使用 `@typescript-eslint` 推荐规则
- **Prettier** 格式化
- **Markdownlint** 用于 Markdown 文件

## 测试

```bash
# 运行单元测试套件 (bun test)
npm test

# 或手动检查健康端点
curl http://localhost:8787/health
```

## 添加新事件格式化器

1. 将事件类型添加到 `formatter.ts` 中的 `GITHUB_COLORS`（如果需要新颜色）
2. 将操作标签添加到 `ACTION_LABELS`（如果有新操作）
3. 在 `formatter.ts` 中创建 `formatEventType` 函数
4. 将 case 添加到 `formatEvent` switch 语句
5. 如果事件包含分支信息，更新 `webhook.ts` 中的 `extractBranch`
6. 将事件添加到 `docs/events/supported.md` 文档中
7. 在 GitHub App 设置中订阅该事件

## 拉取请求指南

- 保持变更聚焦且原子化
- 为所有函数返回值包含类型注解
- 提交前运行 `npm run typecheck && npm run lint && npm run format:check`
- 添加功能时更新文档
