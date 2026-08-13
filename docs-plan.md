# WebHooker 文档评估与优化计划

> 生成日期：2026-08-13
> 范围：`docs/`（VitePress，en+zh）、`README.md` / `README.zh.md`、`AGENTS.md`、`config.example.yaml`、`.env.example`

---

## 一、现状总览

| 文档 | 规模 | 状态 |
|---|---|---|
| `docs/`（VitePress，en+zh 镜像） | 11 页 ×2，约 75KB | 结构完整但存在事实错误、覆盖缺失、信息架构混乱 |
| `README.md` / `README.zh.md` | 363 行 | 与 docs 大量重复（secrets、GitHub App 设置、部署），已出现漂移 |
| `AGENTS.md` | 222 行 | 基本同步，个别过时 |
| `config.example.yaml` / `.env.example` | — | 良好，但 README/AGENTS 中 `DOCS_URL` 等变量名与代码不符（`.env.example` 正确） |

---

## 二、事实错误（需修复）

1. **`GITHUB_APP_ID` / `GITHUB_PRIVATE_KEY` "未被代码使用"说法过时**
   - `server/lib/github/oauth.ts:27-69` 已用它们生成 App JWT 查询安装账号（install 绑定流程）
   - 过时位置：configuration.md:18-21、README.md:60-61/198、deployment.md:40-44、getting-started.md:40-42（en/zh 共 8 处）
   - **deployment.md 内部自相矛盾**：40-44 行说"无需设置"，125-127 行又要求生成私钥保存到 `GITHUB_PRIVATE_KEY`

2. **`DOCS_URL` / `GITHUB_REPO_URL` / `LEGAL_CONTACT` 变量名错误**
   - README.md:74-76 与 AGENTS.md:218 使用旧名
   - 代码实际读取 `NUXT_PUBLIC_DOCS_URL` / `NUXT_PUBLIC_REPO_URL` / `NUXT_PUBLIC_LEGAL_CONTACT`（nuxt.config.ts + runtimeConfig，`.env.example` 正确）

3. **`DELETE /auth/token/:userId` 鉴权标注 "None"**（api/overview.md:23）
   - 实际要求 admin session（oauth.ts:371-377），无 session 返回 401

4. **Generic fallback 描述过时**（events/supported.md:60，en/zh）
   - 声称"原始 payload 代码块（截断 1000 字符）"
   - 实际 `server/lib/formatters/generic.ts` 只输出 title + color + author，无 payload 代码块

5. **事件数量口径不一**
   - "28"（docs/index、configuration、deployment、README）vs "29"（contributing.md、AGENTS.md:126）
   - 实际 `server/lib/formatters/index.ts` switch 有 29 个 case（含 `custom`）
   - 建议统一为："28 种 GitHub/Gitea 事件 + `custom`"

6. **events/supported.md 事件表缺 `custom` 行**（en/zh 都缺）

7. **`src/formatters/colors.ts` 旧路径残留**（events/supported.md:40，en/zh；应为 `server/lib/formatters/colors.ts`）

8. **api/overview.md 端点表缺 9 个端点**
   - `POST/GET /admin/api/groups/:id/invites`、`DELETE /admin/api/invites/:token`
   - `GET /admin/api/audit`、`GET /admin/api/groups/:id/webhook`、`POST .../webhook/regenerate`、`DELETE .../webhook`
   - `GET /admin/logout`、`GET /admin/invite?token=`
   - configuration.md 里反而齐全——两处清单已漂移

9. **providers 校验接受不存在的 `gitlab` 值**（admin.ts:288）
   - 错误信息为 `"github" | "gitea" | "gitlab"`，但无 gitlab provider 实现
   - 需决定：删掉（与文档 github/gitea 对齐）或保留（为未来扩展）

---

## 三、覆盖缺失

1. **KV 布局表缺 `tenant:{groupId}`**（configuration.md:326-343，en/zh 都缺）
   - 租户态 dedup key `delivery:{groupId}:{id}` 只散见正文

2. **`NUXT_PUBLIC_DOCS_URL` / `NUXT_PUBLIC_REPO_URL` / `NUXT_PUBLIC_LEGAL_CONTACT` 未收录**
   - configuration.md Secrets 表（en/zh）都未记录这三个变量

3. **bot 命令文档碎片化**
   - Discord `/gh` 命令只在 README（Bot Commands 段落）
   - Telegram `/gh` 命令只在 deployment.md
   - 无独立页面，sidebar 无入口

4. **无独立页面/章节**：
   - 调度任务（cron `*/5`：discord-sync / telegram-sync / audit-prune）
   - i18n 消息语言与 `i18n:*` KV 覆盖机制
   - 消息格式规范（只在 AGENTS.md，属开发内部文档）
   - 发送日志（send_logs）字段与错误码说明
   - FAQ / 故障排查

5. **次要缺失**：
   - 路由上限 200 / 分组上限 100（admin.ts:76,257）
   - `X-Gitea-Delivery` 头参与去重（providers/gitea/parse.ts:60）
   - install 选择页需要登录 session（oauth.ts:153-158）
   - logTarget 摘要消息只列前 10 条 route×target + "+N"（dispatch.ts:88-100）

---

## 四、结构问题（"杂乱"的主因）

1. **configuration.md 是 356 行巨型文档**
   - 密钥、提供方、Web UI、端点、自定义 webhook、租户隔离、路由、分组、角色、过滤器、KV/D1 布局全挤一页

2. **API 参考混乱**
   - admin API 同时在 configuration.md（Web UI→端点表）、api/overview.md、README 出现三份，已开始漂移

3. **sidebar 信息架构**
   - 只有 Guide / API / Events 三类
   - `docs/contributing.md` 不在 sidebar（孤儿页）
   - 无 Bot 命令、无 FAQ、无故障排查入口

4. **README 与 docs 严重重复**
   - secrets 表、GitHub App 设置、Discord/Telegram bot 设置、部署步骤在 README 和 docs/deployment.md 各写一遍

5. **docs 配置引用不存在的 `logo.svg`**
   - `docs/.vitepress/config.ts` 引用 `/logo.svg`（favicon + 主题 logo），文件不存在（404）

6. **footer copyright 仍写 2025**（当前 2026）

---

## 五、中英一致性（zh 滞后）

| 严重度 | 文件 | 差异 |
|---|---|---|
| 高 | guide/introduction.md | zh 技术栈仍是"Nux3 静态 SPA"，en 已为"Nuxt 4 (Vue 3 + Tailwind CSS v3)" |
| 高 | guide/getting-started.md | zh 脚本表缺 `bun run build`、`bun test` 两行；`bun run dev` 描述不一致（wrangler vs Nuxt HMR） |
| 中 | api/overview.md | zh 漏"or manage a group"准入条件；漏"空过滤器仅 fallback 路由允许" |
| 低 | guide/configuration.md | 可选密钥表行序不同；keyword 示例 zh 多 `*release-*`；"manage everything" 译作"管理路由" |
| 低 | guide/filters.md | zh 一处"`/` 包裹"应为"`//` 包裹"（同文件其他处正确） |
| 低 | index.md | 2 处 feature 描述中文略精简（未列签名头部、未列 slash commands and buttons） |

完全一致的文件对：guide/deployment.md、api/actions.md、api/oauth.md、events/supported.md、contributing.md。

---

## 六、建议的重构方案

### A 阶段：事实修正（低风险，必做）

- 修复"二"中全部 9 项 + "三"的 KV/变量 2 项
- 修复中英"高/中"级差异
- logo.svg（补文件或从 config 移除引用）、footer 年份
- 统一事件数量口径（28 + custom）

### B 阶段：信息架构重构

建议新结构：

```text
指南 Guide
  Introduction / Getting Started / Deployment（保留现状）
  核心概念（从 configuration.md 拆出）：
    Routes & Targets
    Groups & Access Control（角色/邀请/自助注册）
    Webhook Ingress & Tenancy（全局/分组端点、custom、App 隔离）
  消息与命令（新）：
    Discord /gh Commands（合并 README 的 Bot Commands 段落）
    Telegram /gh Commands
    Message Format & i18n（新页：标题规范、emoji 开关、语言覆盖）
  运维（新）：
    Scheduled Tasks
    Storage Layout（KV / D1 布局）
    Send Logs & Audit Logs
    FAQ & 故障排查

参考 Reference
  API（拆分 Public API 与 Admin API，与 configuration 去重）
  Supported Events（补 custom 行、修 generic 描述）

配置（单一权威来源）→ configuration.md 瘦身为"完整参考"
README → 精简为 features + quick start + 命令摘要 + 指向 docs 的链接
```

### C 阶段：README 瘦身

- README 保留：简介、features、quick start、/gh 命令摘要、部署速览、License
- 移除与 docs 重复的完整表格（secrets、GitHub App 设置、bot 设置细节），改为链接指向 docs

---

## 七、待用户确认的决策点

1. **范围**：只做 A？还是 A+B（重构结构）？或 A+B+C（含 README 瘦身）？
2. **configuration.md**：按上述拆分成多个页面（改动大、导航清晰），还是保留单页只做内容修正？
3. **`gitlab` 校验值**：代码放行但无实现——删掉（与文档对齐）还是保留（为未来扩展）？
4. **新页面**：Bot 命令页、i18n/消息格式页、FAQ 页是否都需要？
