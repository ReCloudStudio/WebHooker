# 机器人命令

[绑定你的 GitHub 账号](#绑定账号)后，即可在 Discord 和 Telegram 上**以本人身份**操作 GitHub——评论使用你自己的 OAuth token 发布，权限由 GitHub 强制校验。若 GitHub 拒绝操作（例如编辑他人的评论），机器人会明确告知。

## 绑定账号

使用任何命令前，需先绑定一次 GitHub 账号：

| 平台     | 命令                         | 效果                                                |
| -------- | ---------------------------- | --------------------------------------------------- |
| Discord  | `/gh login`                  | 返回一条仅你可见的 OAuth 链接，用于授权 GitHub 账号 |
| Discord  | `/gh logout`                 | 解除绑定                                            |
| Telegram | `/gh login`（引用一条消息）  | 返回 OAuth 链接                                     |
| Telegram | `/gh logout`（引用一条消息） | 解除绑定                                            |

链接保存在服务端（KV），并在 D1 中映射到你的 Discord/Telegram 用户 ID。

## Discord

Discord 命令为**斜杠命令**与**消息右键菜单命令**，由定时任务同步（每 5 分钟）：按服务器即时注册，并全局注册（24h 去重，约 1 小时传播）。所有回复均为临时消息（仅你可见）。

### 评论 issue / PR

两种等效方式：

- **右键通知**（推荐）：右键机器人发出的 issue / PR / 评论通知 → **应用** → **GitHub: 添加评论 / 编辑评论 / 删除评论**。目标自动从通知嵌入中提取，无需链接。
- **带链接的斜杠命令**：

  ```
  /gh comment add  link:<issue 或 PR 链接>    例如 https://github.com/owner/repo/issues/123
  /gh comment edit link:<评论链接>             链接需包含 #issuecomment-<id>
  /gh comment del  link:<评论链接>             链接需包含 #issuecomment-<id>
  ```

  `edit` / `del` 需要在 GitHub 上复制具体评论链接（评论 ⋯ 菜单 → **复制链接**）。`add` / `edit` 会打开模态框输入/调整评论内容（edit 会预填）。

### 合并 / 关闭 PR

开放 PR 的通知附带 **合并 / 关闭** 按钮：

- 点击按钮即以你绑定的 GitHub 账号合并（squash）或关闭 PR；权限由 GitHub 强制校验。
- 成功后按钮会从通知中移除，结果以临时消息展示。

### 前置条件

| 项目       | 如何满足                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------- |
| 公钥       | 设置 `DISCORD_PUBLIC_KEY` 并配置 Interactions Endpoint URL                                          |
| 邀请 scope | 机器人以 `applications.commands` scope 邀请（见 [Discord Bot 设置](./deployment#discord-bot-设置)） |
| OAuth      | 配置 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` 与 `BASE_URL`                                      |
| 绑定账号   | 每位用户先执行 `/gh login`                                                                          |

## Telegram

Telegram `/gh` 命令通过**引用一条通知消息**来使用：

- `/gh login` — 绑定 GitHub 账号（返回 OAuth 链接）
- `/gh logout` — 解除绑定
- `/gh comment <文本>` — 引用 issue/PR 通知以本人身份评论
- `/gh merge` / `/gh close` — 引用 PR 通知进行合并/关闭

目标 issue/PR 从你引用的消息（通知嵌入中的链接）解析。命令通过 Telegram webhook（`POST /telegram/webhook`，可用 `TELEGRAM_WEBHOOK_SECRET` 校验）送达。
