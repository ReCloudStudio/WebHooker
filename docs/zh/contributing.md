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
├── index.ts              # CF Workers 入口 (fetch + scheduled)，scheduled = 命令同步
├── types.ts              # Env、Config、Route、Filter、WebhookEvent、NeutralMessage
├── config.ts             # 从 KV 加载路由（未设置时返回 []），从 env 构建 Config
├── server.ts             # Hono 应用: /health、/webhook、/discord/interactions，挂载 /auth、/admin + /
├── core/
│   └── dispatch.ts       # 平台中立分发：匹配路由 → formatEvent → getDriver().send
├── events/               # GitHub webhook 事件流水线
│   ├── verify.ts         # HMAC 签名验证 (Web Crypto，时间安全)
│   ├── parse.ts          # parseEvent (headers + body → WebhookEvent)
│   └── match.ts          # matchRoute、eventOwners、extractBranch、关键词过滤
├── formatters/           # 平台中立格式化器（产出 NeutralMessage）
│   ├── index.ts          # formatEvent：24 事件 switch → NeutralMessage + re-export
│   ├── colors.ts         # GITHUB_COLORS + WORKFLOW_CONCLUSION_EMOJI
│   ├── helpers.ts        # emojiPrefix、T、buildMessage
│   └── *.ts              # push、pull-request、issues、comments、workflow、release、repo 等
├── drivers/              # 平台驱动（可插拔推送目标）
│   ├── types.ts          # PlatformDriver 接口 + SendResult
│   ├── index.ts          # getDriver() 注册表（discord + telegram 占位）
│   ├── discord/          # index.ts (驱动)、render.ts (NeutralMessage → embed)、
│   │                     # rest.ts、interactions.ts、commands.ts
│   └── telegram/         # TelegramDriver 占位（未实现）
├── github/               # GitHub OAuth + 以用户身份操作
│   ├── oauth.ts          # OAuth URL、回调 Token 交换、getUserOctokit、操作
│   └── store.ts          # KV Token CRUD + D1 discord-link 映射
├── web/                  # HTTP UI/API 路由
│   ├── oauth-routes.ts   # GET /auth/github、回调、DELETE /token/:userId (KV 状态)
│   ├── action-routes.ts  # POST /api/comment|merge|close|react (通过 KV 查找进行 Bearer Token 鉴权)
│   ├── admin-routes.ts   # /admin API：路由、分组、me、日志（会话 + 权限范围鉴权）
│   ├── session.ts        # 管理员会话 CRUD (KV session:{id})、Cookie 辅助函数
│   ├── groups.ts         # 分组加载、分组管理员权限范围
│   ├── home-routes.ts    # 落地页路由
│   └── legal-routes.ts   # 法律页面路由
└── lib/                  # 共享基础设施
    ├── i18n.ts           # 消息语言覆盖 (en/zh)
    ├── send-log.ts       # 发送日志 (D1 send_logs)
    ├── log.ts            # JSON 控制台日志 (info/warn/error/fatal)
    └── locales/          # en.ts、zh.ts 翻译字典
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

1. 将事件类型添加到 `src/formatters/colors.ts` 中的 `GITHUB_COLORS`（如果需要新颜色）
2. 将操作标签添加到 `ACTION_LABELS`（如果有新操作）
3. 在 `src/formatters/` 中创建 `formatEventType` 函数
4. 将 case 添加到 `src/formatters/index.ts` 中的 `formatEvent` switch 语句
5. 如果事件包含分支信息，更新 `src/events/match.ts` 中的 `extractBranch`
6. 将事件添加到 `docs/events/supported.md` 文档中
7. 在 GitHub App 设置中订阅该事件

## 拉取请求指南

- 保持变更聚焦且原子化
- 为所有函数返回值包含类型注解
- 提交前运行 `npm run typecheck && npm run lint && npm run format:check`
- 添加功能时更新文档
