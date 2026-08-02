# 支持的事件

WebHooker 支持 23 种 GitHub webhook 事件类型，每种都有专用的格式化器，生成丰富的 Discord 嵌入消息。不支持的事件会回退到通用格式化器。

## 事件表

| 事件                          | 说明                   | 嵌入亮点                               |
| ----------------------------- | ---------------------- | -------------------------------------- |
| `push`                        | 代码推送到分支         | 提交列表、分支、作者、差异统计         |
| `pull_request`                | PR 打开/关闭/合并/编辑 | PR 标题、分支、差异统计、标签          |
| `issues`                      | 议题打开/关闭/编辑     | 议题标题、标签、指派人                 |
| `issue_comment`               | 议题或 PR 的评论       | 评论内容、议题引用                     |
| `workflow_run`                | CI/CD 工作流完成       | 工作流状态、结论、耗时                 |
| `release`                     | 发布创建/编辑          | 标签、内容、附件、预发布标记           |
| `create`                      | 分支或标签已创建       | 引用名称、引用类型                     |
| `delete`                      | 分支或标签已删除       | 引用名称、引用类型                     |
| `star`                        | 仓库加星/取消星标      | 星标数、操作                           |
| `fork`                        | 仓库已复刻             | 源 → 目标复刻                          |
| `check_run`                   | 检查运行完成           | 状态、结论、详情 URL                   |
| `pull_request_review`         | PR 审查已提交          | 审查状态（已批准/需修改/已评论）、正文 |
| `pull_request_review_comment` | 行内代码审查评论       | 文件路径、行号、评论内容               |
| `commit_comment`              | 提交的评论             | 提交 SHA、评论内容                     |
| `deployment_status`           | 部署状态更新           | 环境、状态、提交引用                   |
| `member`                      | 协作者添加/移除        | 成员登录名、操作                       |
| `label`                       | 标签创建/编辑/删除     | 标签名称、颜色、描述                   |
| `milestone`                   | 里程碑打开/关闭        | 进度条、议题计数、截止日期             |
| `discussion`                  | 讨论创建/回答          | 标题、分类、操作                       |
| `discussion_comment`          | 讨论的评论             | 评论内容、讨论引用                     |
| `repository`                  | 仓库重命名/转移        | 旧 → 新名称、变更                      |
| `code_scanning_alert`         | 代码扫描告警           | 严重程度、规则 ID、文件路径            |
| `dependabot_alert`            | Dependabot 告警        | 严重程度、包、受影响版本、修复版本     |

## 颜色编码

每种事件类型在 Discord 嵌入中使用不同的颜色：

| 颜色             | 事件                                                       |
| ---------------- | ---------------------------------------------------------- |
| 绿色 (`#2ea44f`) | push、issue 打开、PR 打开、release 发布、star、member 添加 |
| 红色 (`#d73a49`) | issue 关闭、PR 关闭、deployment 失败、dependabot 严重      |
| 紫色 (`#7057ff`) | PR 合并、discussion 创建                                   |
| 蓝色 (`#0366d6`) | PR review 评论、issue 评论、workflow run                   |
| 黄色 (`#dbab09`) | PR review 请求修改、deployment 待定                        |
| 青色 (`#00897b`) | check run、code scanning                                   |
| 橙色 (`#e67e22`) | label、milestone                                           |
| 灰色 (`#6a737d`) | delete、repository、member 移除                            |

## 通用回退

没有专用格式化器的事件类型会回退到通用格式化器，生成包含以下内容的基础嵌入：

- 事件类型作为标题
- 操作（如果可用）
- 发送者登录名
- 仓库名称
- 原始载荷作为代码块（截断到 1000 字符）

## 过滤器兼容性

实操指南见[过滤器教程](../guide/filters)，包含完整示例。

| 过滤器    | 适用事件                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------- |
| `event`   | 所有事件                                                                                                                |
| `repo`    | 所有事件                                                                                                                |
| `actor`   | 所有事件                                                                                                                |
| `action`  | 载荷中包含 `action` 字段的事件                                                                                          |
| `branch`  | push、pull_request、pull_request_review、pull_request_review_comment、create、delete、workflow_run、code_scanning_alert |
| `keyword` | 所有事件（搜索完整载荷正文）                                                                                            |
