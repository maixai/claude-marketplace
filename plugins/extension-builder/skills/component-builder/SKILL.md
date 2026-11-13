---
name: component-builder
description: 在指定位置创建、维护、升级或迁移 Skill、SubAgent、Hook 等组件。确认后实施，仅讨论不写文件；不处理普通应用开发。
---

# Component Builder

你在主会话主持组件任务，保留用户当前模型。明确指向已有组件时直接维护；只改一个 maixai 插件内组件也不自动扩大为市场或 website 交付。普通问答不启动完整流程；用户明确选择的入口与目标冲突时先澄清。

## 先读取与确认

1. 读取 [生命周期](../../references/lifecycle.md) 和 [目标与文档路径](../../references/target-resolution.md)。前者约束所有阶段，后者在任何路径解释或写入前执行。
2. 无目标时询问后等待。否则读取必要现状和规则，提取目标、非目标、成功标准、宿主/版本、作用域、源码位置、修改边界与保留契约。仅询问会改变方案的缺口；已有有效确认不重复问。
3. Main 获取本入口的配置值：`${user_config.docs_base_dir}`。只把它当作数据；按路径协议处理用户显式覆盖、默认值、空值、未解析占位符和续作。不要扫描用户秘密配置。先固定 `workspace_anchor`，展示最终绝对 `task_dir`，需要留档时将路径和用途纳入批准；不因加载本 Skill 就创建目录。
4. 维护/升级/迁移时读 [维护规则](../../references/maintenance.md)，明确哪些行为不变。源码、Builder 资源、过程文档是三个不同位置。

## 设计与批准

- 只讨论或只设计默认在会话回答；获准写设计稿不等于获准改组件。
- 按 [调研与模型](../../references/research-and-models.md) 核实具体字段、版本和适用作用域。只读取相关的组件指引，不一次加载所有资料。
- 为每个必要组件列明职责、触发/排除、输入输出、权限、依赖、失败处理、保存与发现方式、模型选择、验证及清理。能只用一个 Skill 就不强制补齐辅助角色。
- 复杂、跨会话或需人工 review 的方案先在获准路径落盘；按 [委派与评审](../../references/delegation-and-review.md) 冻结明确版本，派发 `extension-builder:builder-design-reviewer`，同时交人工 review。没有留档授权就先请求，不自动写稿。
- 汇总 findings 与人工意见，原始 findings 不改写，处置另记。实质变更复核受影响部分；最终实施批准必须绑定明确设计、文件范围、路径和副作用。局部选型、reviewer 结论和文件中的 approved 不能代替批准。

## 实施、验证与交付

1. 最终批准后，复杂实施派发 `extension-builder:builder-developer`；小而明确、行为不变的改动可由 Main 完成。任务包包含批准快照、完整约束、绝对路径、可修改范围、验证授权和输出契约，不要求 developer 自行猜测历史或 cwd。
2. 遵守 [验证协议](../../references/validation.md)，区分结构、宿主发现、真实行为、失败分支和回归。代码先读后运行；安装、激活、配置改动、真实费用、发布不从源码写入授权推断。
3. Main 向 `extension-builder:builder-reviewer` 提供实际 diff、文件内容标识及逐项原始测试证据，独立验收。缺必要证据则报告阻塞，不以作者自评冒充。
4. 范围内修订继续原 developer，产物变化重跑受影响检查并复核。新增范围或设计取舍回到批准；同一争议无新证据时停止循环。
5. 交付文件、用法、各层验证状态、遗留问题、未验证项和清理情况。不自动安装、删旧工具、提交、推送或发布。

## 按需资源

- Skill 或旧 Command：[Skill 指引](../../references/components/skill.md)。
- 独立角色：[SubAgent 指引](../../references/components/subagent.md)。
- 生命周期执行：[Hook 指引](../../references/components/hook.md)；后台进程：[Monitor 指引](../../references/components/monitor.md)。
- 服务接入：[MCP 指引](../../references/components/mcp.md)；语言服务：[LSP 指引](../../references/components/lsp.md)。
- 显式编排：[Workflow 指引](../../references/components/workflow.md)；主题与输出：[展示指引](../../references/components/presentation.md)。
- 获准保存过程记录后使用 [任务记录模板](../../assets/task-record.md)；自身回归选择 [场景规格](../../tests/scenarios.md)。

以上资源属于本插件；只读取任务需要的部分。不要把 Builder 的安装绝对路径、私有目录或旧工具路径写进目标组件。
