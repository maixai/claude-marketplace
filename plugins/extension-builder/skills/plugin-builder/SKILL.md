---
name: plugin-builder
description: 创建、维护、升级或迁移 maixai 市场插件，并检查网站展示。确认后实施，不自动安装、提交或发布；不处理其它市场或普通应用。
---

# Plugin Builder

你在主会话负责 maixai 插件整体交付，保留用户当前模型。自己设计内部组件并调度共享 developer，**不调用 component-builder 重走流程**。明确仅维护一个组件时不擅自扩展任务；入口与目标冲突则先澄清。

## 定位与需求

1. 先读 [生命周期](../../references/lifecycle.md)、[目标与文档路径](../../references/target-resolution.md)。无目标时询问并等待；只讨论默认不写文件。
2. 从用户路径或已确认工作区定位 maixai `claude-marketplace`，按 [市场契约](references/marketplace-contract.md) 读取当前市场清单、README、采集器与相关网站代码。找不到就问，不自动 clone，不依赖维护者本机目录。
3. Main 读取配置值 `${user_config.docs_base_dir}`，按照共享路径协议固定 `workspace_anchor`，处理显式覆盖、默认、空值、未解析和续作，展示绝对 `task_dir` 并取得需要的留档授权。配置不改变插件 README、源码或 catalog 的位置，不是写入授权。
4. 明确目标、非目标、成功标准、宿主与版本、允许文件和保留契约。读 [维护规则](../../references/maintenance.md) 和 [发布兼容性](references/release-and-compatibility.md)；保留旧名称和用户修改，除非迁移已获批准。

## 整体方案与批准

- 按 [调研与模型](../../references/research-and-models.md) 及本文件下方组件索引，设计插件与内部组件的职责、命名空间、输入输出、权限、配置、依赖、模型和失败处理。
- 同时设计市场登记、简明中文展示文案、实际用法 README，以及插件运行、网站展示两条验收链。简介和组件说明简短写清用途；技术名称、命令和模型名保持原样，详细流程留在组件正文。
- 逐项对照采集能力：标准六类已覆盖，其它类型、自定义路径、内联声明不得假定会显示。缺口先提出最小扩展范围；未经批准不改全站、不静默漏项后称完成。
- 复杂方案先在获准位置形成文档；按 [委派与评审](../../references/delegation-and-review.md) 交稳定快照给 `extension-builder:builder-design-reviewer`，人工 review 可并行但必须同版。
- 原始 findings 与处置分开保存，修订后按影响复核。用户最终批准当前设计、源码/网站范围、记录位置和运行副作用后才实施。评审无阻塞不等于批准。

## 实施与双链验收

1. 给 `extension-builder:builder-developer` 完整任务包，包含最终批准快照、市场事实、允许范围、绝对路径和验证授权；不通过另一个入口调度。简单且行为不变的修改可由 Main 直接做。
2. 按 [共享验证](../../references/validation.md) 检查插件结构、组件集成、受控加载、行为与回归；按 [网站验收](references/website-validation.md) 检查登记、采集、测试、类型、构建与真实页面。
3. developer 的工具白名单没有 Chrome DevTools。浏览器验收交回具有实际工具与授权的 Main；没有工具则明确未验证或阻塞，不绕过 MCP 连接，不把构建成功当浏览器证据。
4. Main 派 `extension-builder:builder-reviewer` 读取实际文件、diff、产物标识和原始证据。缺加载、模型或浏览器证据不能宣布整体验收通过。
5. 范围内修订优先继续原 developer；重跑受影响检查并复核。交付变更、用法、有效证据、未验证项和清理情况。源码维护不默认 bump 版本，实际安装、提交、推送、部署和发布另行授权。

## 按需读取

组件设计按需读取 [Skill](../../references/components/skill.md)、[SubAgent](../../references/components/subagent.md)、[Hook](../../references/components/hook.md)、[Monitor](../../references/components/monitor.md)、[MCP](../../references/components/mcp.md)、[LSP](../../references/components/lsp.md)、[Workflow](../../references/components/workflow.md)、[展示类](../../references/components/presentation.md)，不要全量预加载或复制官方规范。

获准留档后按 [任务记录模板](../../assets/task-record.md) 组织事实、批准和证据；自维护时从 [场景规格](../../tests/scenarios.md) 选回归。共享资料留在插件内，不依赖旧 `.claude/skills/skill-author` 的安装位置。
