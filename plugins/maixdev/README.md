# MaixDev

Maixai 用于构建产品的软件开发 Harness

## 开始开发

调用 `/maixdev:fastdev`，说明你要开发的功能或修复的问题：

```text
/maixdev:fastdev 为订单增加取消操作，已发货订单不能取消。
```

根据提示确认需求；命中架构设计评审条件时，先完成设计评审并取得设计批准，再选择开发模式：

- **测试先行**：先编写测试，再逐步实现功能。
- **普通开发**：统一完成业务实现和必要测试。

开发完成后，可以选择是否进行代码审查。

## 模型档位

Main 使用当前会话模型，fastdev 不切换它。建议架构级、跨模块任务在会话开始时选择 Opus 或 Fable；日常修复使用 Sonnet 通常足够。

四个子角色使用固定档位，与会话模型相互独立：

| 角色 | 模型档位 | 用途 |
| --- | --- | --- |
| design-reviewer | `opus` | 实现前的架构、接口与约束评审 |
| developer | `sonnet` | 业务实现、回归与浏览器验收 |
| test-developer | `opus` | 独立测试设计与测试争议裁决 |
| reviewer | `opus` | 独立代码审查 |

四个角色都不设置 effort，使用模型默认值。模型别名的实际解析取决于宿主、套餐和 `availableModels` 设置；本插件不保证所有环境都提供这些档位。

## 架构设计评审

命中以下任一条件时，Main 会在实现前起草 `design.md`，并派发只读的 design-reviewer：

- 跨模块或公共 API 变更
- 数据模型、schema 或迁移
- 权限、认证或安全边界
- 新增依赖、框架或基础设施
- 并发、性能或容量约束
- 破坏性兼容变更
- 用户明确要求

design-reviewer 独立检查需求覆盖、架构与职责、接口契约、约束、备选方案、可测试性和风险，findings 直接返回 Main，由 Main 保存到 `design-review.md` 并交用户裁决。评审通过不等于用户批准；只有用户明确批准设计版本后，才会进入测试先行或普通开发。未命中上述条件时，Main 在需求记录中写明简短设计约束和不评审理由。

## 检索配置

安装或启用时，按原生配置提示填写 `context7_api_key` 和 `tavily_api_key`。两项均为必填敏感配置，仅用于插件自带 Context7、Tavily 的请求头认证；不要在聊天中提供 Key。完成配置不代表服务已连接，工具可用性会在任务准备时另行检查。

网页查证优先用 Tavily；搜索不可用时在已有授权内改用 `WebSearch`，读取不可用时改用 `WebFetch`，只处理受影响能力或 URL。首次切换会简要说明原因与实际渠道；这不免除 Tavily API Key 必填要求，也不代表备用工具已获授权或没有费用。权限拒绝、明确禁用或禁止外发时不会换渠道绕过。空结果不自动触发降级；`WebFetch` 提取可能有损，未提到不等于不存在，关键事实仍须有可复核正文。

## 文档目录

通过配置项 `docs_base_dir` 指定文档目录，默认是任务开始时工作目录下的 `documents`。每个任务的需求、进度和验收结果保存在独立目录中：

```text
<工作目录>/documents/maixdev/fastdev/<任务标识>/
```

## 继续已有任务

提供原任务文档目录即可续作：

```text
/maixdev:fastdev 继续 /workspace/shop/documents/maixdev/fastdev/order-cancel-01/ 的任务。
```
