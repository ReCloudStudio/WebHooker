# 支持的事件

WebHooker 支持 28 种 GitHub webhook 事件类型，每种都有专用的格式化器，生成丰富的 Discord 嵌入消息与 Telegram HTML 消息。不支持的事件会回退到通用格式化器。

## 事件表

| 事件                          | 说明                   | 嵌入亮点                                         |
| ----------------------------- | ---------------------- | ------------------------------------------------ |
| `push`                        | 代码推送到分支         | 提交列表、分支、作者、差异统计                   |
| `pull_request`                | PR 打开/关闭/合并/编辑 | PR 标题、分支、差异统计、标签                    |
| `issues`                      | 议题打开/关闭/编辑     | 议题标题、标签、指派人                           |
| `issue_comment`               | 议题或 PR 的评论       | 评论内容、议题引用                               |
| `workflow_run`                | CI/CD 工作流阶段更新   | 工作流状态、结论、耗时；各阶段原地更新同一条消息 |
| `workflow_job`                | CI 作业阶段更新        | 作业名、状态、结论、工作流                       |
| `status`                      | 提交状态更新           | 提交状态、上下文、状态值、提交链接               |
| `deployment`                  | 部署已创建             | 环境、引用、任务                                 |
| `deployment_status`           | 部署状态更新           | 环境、状态、提交引用                             |
| `check_run`                   | 检查运行完成           | 状态、结论、详情 URL                             |
| `check_suite`                 | 检查套件完成           | 套件结论、head 分支、提交链接                    |
| `ping`                        | Webhook 确认           | Webhook 确认、已订阅的事件类型                   |
| `release`                     | 发布创建/编辑          | 标签、内容、附件、预发布标记                     |
| `create`                      | 分支或标签已创建       | 引用名称、引用类型                               |
| `delete`                      | 分支或标签已删除       | 引用名称、引用类型                               |
| `star`                        | 仓库加星/取消星标      | 星标数、操作                                     |
| `fork`                        | 仓库已复刻             | 源 → 目标复刻                                    |
| `pull_request_review`         | PR 审查已提交          | 审查状态（已批准/需修改/已评论）、正文           |
| `pull_request_review_comment` | 行内代码审查评论       | 文件路径、行号、评论内容                         |
| `commit_comment`              | 提交的评论             | 提交 SHA、评论内容                               |
| `member`                      | 协作者添加/移除        | 成员登录名、操作                                 |
| `label`                       | 标签创建/编辑/删除     | 标签名称、颜色、描述                             |
| `milestone`                   | 里程碑打开/关闭        | 进度条、议题计数、截止日期                       |
| `discussion`                  | 讨论创建/回答          | 标题、分类、操作                                 |
| `discussion_comment`          | 讨论的评论             | 评论内容、讨论引用                               |
| `repository`                  | 仓库重命名/转移        | 旧 → 新名称、变更                                |
| `code_scanning_alert`         | 代码扫描告警           | 严重程度、规则 ID、文件路径                      |
| `dependabot_alert`            | Dependabot 告警        | 严重程度、包、受影响版本、修复版本               |

## 颜色编码

每种事件类型在 Discord 嵌入中使用不同的颜色（来自 `src/formatters/colors.ts`）：

| 颜色             | 事件                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 绿色 (`#2da44e`) | push、PR 打开/可审查、issue 打开、工作流成功、发布已发布、检查成功、审查已批准、部署成功、成员添加、里程碑关闭、讨论已回答      |
| 红色 (`#f85149`) | PR 关闭、issue 关闭、工作流失败、发布已删除、delete、检查失败、审查请求修改、部署失败、成员移除、代码扫描/Dependabot 严重与高危 |
| 紫色 (`#8957e5`) | PR 合并、label、discussion                                                                                                      |
| 蓝色 (`#1f6feb`) | PR（其他操作）、issue 重新打开、fork、里程碑打开                                                                                |
| 黄色 (`#d29922`) | 工作流（排队/运行中/其他）、预发布 release、star、检查（其他）、部署待定、代码扫描/Dependabot 中危                              |
| 灰色 (`#6e7681`) | issue 评论、commit 评论、讨论评论                                                                                               |
| 灰色 (`#8b949e`) | 审查评论、repository、代码扫描/Dependabot 低危、默认                                                                            |

## 通用回退

没有专用格式化器的事件类型会回退到通用格式化器，生成包含以下内容的基础嵌入：

- 事件类型作为标题
- 操作（如果可用）
- 发送者登录名
- 仓库名称
- 原始载荷作为代码块（截断到 1000 字符）

## 原地消息更新

`workflow_run` 事件（queued → running → success/failure）只发送一条消息，后续每个阶段会**原地编辑**该消息，而不是发送新消息。消息的链接预览、作者和字段布局保持不变，仅刷新状态、结论 emoji、耗时和标题。Discord（`editMessage`）和 Telegram（`editMessageText` / `editMessageCaption`）均支持。

## 过滤器兼容性

实操指南见[过滤器教程](../guide/filters)，包含完整示例。

| 过滤器    | 适用事件                                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event`   | 所有事件                                                                                                                                                       |
| `repo`    | 所有事件                                                                                                                                                       |
| `actor`   | 所有事件                                                                                                                                                       |
| `action`  | 载荷中包含 `action` 字段的事件                                                                                                                                 |
| `branch`  | push、pull_request、pull_request_review、pull_request_review_comment、create、delete、workflow_run、workflow_job、check_suite、deployment、code_scanning_alert |
| `keyword` | 所有事件（搜索完整载荷正文）                                                                                                                                   |
