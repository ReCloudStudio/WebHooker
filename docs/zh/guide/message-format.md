# 消息格式

每个事件格式化器都会产出一条平台中立的消息（`NeutralMessage`），由平台驱动渲染为 Discord 嵌入或 Telegram HTML 消息。

## 标题

每个标题必须以仓库名开头，随后是可选的 `#number`，再是 `: 描述`：

```
{repo}{#number}: {subject}      例如 acme/widget#7: Add feature
```

仓库名取自 `payload.repository.full_name`（缺失时回退为通用的「repository」标签）。评论、审查与行内评论使用与其父对象相同的 `{repo}{#number}: {title}` 标题——绝不使用 `"Comment on org/repo"` 前缀。

## 链接

只有仓库头会被加超链接——整条标题永远不会整体链接：

- **Discord**（嵌入标题不支持局部链接）：标题为仓库头 `{repo}{#number}`，链接到仓库；`: {subject}` 文本作为描述首行渲染，不带链接。
- **Telegram**（HTML 支持行内链接）：单行标题保留描述文本，仅仓库头被包在链接中。

标题中不含冒号分隔符（`:` 后跟一个空格）的消息保持旧的整行链接行为。

提交哈希、分支与标签渲染为带超链接的行内代码（如 ``[`abc123d`](https://…/commit/abc123def456)``），仓库基地址不可用时回退为纯行内代码。

## 表情

事件专属表情由格式化器添加；分组级 `Group.emoji`（默认开启）关闭后会全部去除。里程碑进度条不受影响。见[消息语言](./i18n)。

## 原地更新

`workflow_run` 与 `check_run` 消息只发送一次，随运行进度原地编辑（queued → running → success/failure），不会重复发消息。追踪使用 KV `msg:*` 与每次运行的稳定 `updateKey`。
