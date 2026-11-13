# Extension Builder 设计草案

## 1. 文档状态与用途

本文细化一个用于创建、维护和升级 Claude Code 扩展的 meta plugin，作为后续人工 review、设计修订和实施的依据。

- 文档修订：`D7`，记录最终配置、分阶段实施授权与执行状态。
- 状态：首版源码已落盘；获准的静态与确定性检查完成，独立实现评审的 F1 已修复并复核通过。真实模型、宿主交互和浏览器运行验收尚未完成。
- 本轮已授权：新增 `plugins/extension-builder/`、登记本市场、维护本文记录，以及执行静态检查、确定性测试、采集与网站构建。
- 本轮未授权：修改宿主设置、安装或激活插件、删除旧组件、真实模型测试、提交、推送或发布。浏览器验证仍受当前会话工具可用性限制。
- 插件正式技术名称为 `extension-builder`，初版源码版本采用 `0.1.0`；尚未发布。
- 文档修订号独立于未来插件版本，不表示插件已经发布。

后续继续修改本文件，不为每次对话另建一份竞争性的方案。涉及评审、批准和实施交接时，按第 11 节绑定明确版本；历史批准不能自动覆盖新内容。

### 1.1 已确认的方向

1. 一个插件，两个独立 Skill，分别面向组件与插件任务。
2. `component-builder` 面向用户指定的位置，不限于 maixai 市场。
3. `plugin-builder` 专用于 maixai 插件市场，交付范围包含插件及 website 正确展示。
4. 两个入口都支持新建、维护、升级和迁移。
5. 两个入口共享组件知识和辅助角色，不要求相互调用完整流程。
6. 将独立的开发角色和设计评审角色纳入方案。
7. 复杂方案先文档化，reviewer 只读并直接返回结构化 findings，由主 Agent 在获准位置保存原始结果和独立的处置记录；评审与批准绑定稳定版本。
8. 实现评审的 diff、测试结果与具体产物状态绑定；产物修改后重跑受影响检查，不沿用失效证据。
9. 两个 Skill 共用原生 `userConfig.docs_base_dir`，默认 `documents`；Main 统一解析后追加插件名、入口 Skill 名和任务标识。相对路径绑定任务开始时确认的工作目录，续作沿用原目录，不自动迁移历史文档。
10. `builder-developer` 显式使用 `fable` 档位，不再采用 `inherit`，不改变主会话模型。
11. 用户已确认正式名称 `extension-builder`、中文指令与文档、英文对外元数据、仅新插件采用 MIT，以及 researcher `sonnet`、两个 reviewer `opus` 的配置。

### 1.2 尚未验证或授权

支持环境、实际模型路由、组件加载与行为仍待实测。真实模型测试的凭证注入方式、预算、安装与激活、首次切换、提交和发布仍须另行明确。本次实施授权不扩展为这些动作的授权。

## 2. 产品边界

| 入口                | 目标场景                         | 完成交付的范围                           |
| ------------------- | -------------------------------- | ---------------------------------------- |
| `component-builder` | 任意指定位置的组件创建与维护     | 组件、必要配套文件与接入配置，以及验证   |
| `plugin-builder`    | maixai 市场中的插件创建与维护    | 插件、内部组件、市场登记、展示与验证     |

两个入口是主会话的任务指引，不是两个独立进程。主 Agent 负责理解用户、设计、批准、调度与交付；具体实施可以交给 `builder-developer`。

### 2.1 入口选择

- 创建用户级 Skill、修改某项目的 Hook、维护其它插件源码中的 SubAgent：使用 `component-builder`。
- 新建 maixai 市场插件，或升级插件并同步市场与 website：使用 `plugin-builder`。
- 明确只修改 maixai 插件内的一个组件、不要求完整市场交付：可使用 `component-builder`，不得因目录位置擅自扩大范围。
- 明确调用某个入口时尊重用户选择；目标与入口存在实质冲突时先说明并澄清。
- 只讨论或只设计时，不进入目标实施。
- 普通应用开发、一般事实问答不应自动触发完整 Builder 流程。

### 2.2 复用而非串联

`plugin-builder` 自己负责其任务中的组件设计与实现，读取共享组件指引，不把 `component-builder` 当内部服务。两个入口不互相启动澄清、批准和发布流程。

共享资源包含：生命周期协议、路径解析、组件指引、维护与回归规则、必要脚本及四个 SubAgent 定义。

### 2.3 非目标

- 不创建通用 Agent 编排平台或强制状态数据库。
- 不默认为每个组件分配一个独立 Agent。
- 不自动安装依赖、修改全局权限、提交、推送或部署。
- 不将当前会话拥有的全部工具、模型和服务假设为公开用户都已具备。
- 不因支持某种组件的创作，就自动为 Builder 自身启用该种常驻组件。

## 3. 两个 Skill 的入口设计

### 3.1 component-builder

建议触发描述：

> 在用户指定的用户级、项目级、插件源码或其它源码位置，创建、修改、升级、迁移 Claude Code 组件及必要配套文件，包括 Skills、SubAgents、Hooks、Monitors 等。先确认目标与范围，维护时保护既有行为和配置；只讨论时不修改文件。

职责包括：目标解析、组件方案、必要接入修改、实施协调、分层验证和交付。

不默认登记市场、修改 website、安装组件或改动全局设置。目标组件需要脚本、模板或辅助 Agent 时可以一并设计，不限制为单个文件。

### 3.2 plugin-builder

建议触发描述：

> 为 maixai claude-marketplace 创建、修改、升级或迁移插件，负责插件整体与内部组件，并核对市场登记、元数据、README 和 website 展示契约。维护时保留兼容性，交付插件与展示的验证证据；不自动提交、安装或发布。

职责包括：核验市场、插件整体设计、组件实施协调、市场与网站集成、兼容性和交付验收。

找不到目标仓库时询问位置，不自动 clone。发现 website 不支持目标组件时提出扩展范围，未经批准不修改全站，也不能漏展示后声称完成。

### 3.3 加载与主会话

建议两个 Skill 均允许用户显式调用和自然语言触发，默认在主会话加载，不配置 `context: fork`，不覆盖用户选择的主会话模型。

不要使用宽泛的 `allowed-tools` 自动预授权所有命令与写入。具体字段按实施时选定的 Claude Code 版本核对。

普通 Skill 指令会进入主会话；上下文隔离通过显式委派 developer 等角色实现，不通过把完整交互流程移进 fork 实现。[S1]、[S2]

### 3.4 文档目录配置

两个入口共用插件原生 `userConfig` 中的 `docs_base_dir`。以下是未来 `plugin.json` 的配置片段，不表示本轮已经创建插件或写入用户设置：

```json
{
  "userConfig": {
    "docs_base_dir": {
      "type": "string",
      "title": "Documentation base directory",
      "description": "Base path for generated documents. Relative paths resolve against the task's confirmed workspace directory.",
      "default": "documents"
    }
  }
}
```

选择 `string` 是为了明确支持相对路径和尚未创建的目录，由插件实施并验证第 11.5 节的解析规则。官方也支持 `directory` 类型，但本次读取的文档没有充分说明它对相对目录基准和目录存在性的完整处理，不依赖这些未核实行为。[S6]

Main 从 Skill 内容中的 `${user_config.docs_base_dir}` 获取有效配置，不为读取这个非敏感选项扫描整个用户配置或凭证文件。配置未设置时使用声明的默认值；取值为空、变量未解析或格式无效时先报告并澄清，不能把它误当成工作区根或静默写到其它位置。

按当前官方文档，非敏感选项存于 `pluginConfigs`，其作用域是用户级或 managed 级；项目和 local 设置中的同名项会被忽略。首版不自行建立另一套项目配置文件，也不指导用户通过项目 `settings.local.json` 覆盖该选项。[S7]

此配置仅控制设计稿、决策、评审、快照和验证证据等任务文档，不控制目标插件目录、Skill 文件、目标 README 或其它源码产物的位置。配置是路径偏好，不是读写、安装、提交或发布授权。

## 4. 共享任务与批准协议

### 4.1 最小任务信息

每个任务明确以下信息，但不要求每个短任务都写记录文件：

- 用户目标、非目标、成功标准。
- 操作类型：新建、修改、升级、迁移或删除，可组合。
- 目标宿主、版本、作用域、调用起始目录。
- 文档路径的配置来源与原始值、`workspace_anchor`、解析后的 base dir、最终 `task_dir` 及该目录的写入授权。
- 源码位置、允许修改的文件或配置项、禁止修改范围。
- 既有用户修改、必须保留的行为和对外契约。
- 当前设计版本、有效批准及未决事项。
- 验证方式、外部访问、实际激活、费用预算和停止条件。
- 已完成证据、未验证项、阻塞和下一步。

调用起始目录一经记录，不因工具临时切换目录而改变。文件路径不明确且影响写入时，先询问。

### 4.2 生命周期

```text
理解目标与现状
→ 需求确认 A
→ 调研、设计草案
→ 人工 review 与独立设计评审
→ 汇总意见、修订及必要复核
→ 最终设计与实施批准 B
→ 实施与获准验证
→ 独立实现评审
→ 范围内修订及回归
→ 交付
```

人工 review 与设计 reviewer 可以并行，前提是审查同一份明确版本的方案。评审结果返回和未发现问题，都不等于用户批准。

### 4.3 授权规则

- 已明确确认的需求不重复询问。
- 已批准的组件、路径、模型和副作用，在同一有效设计范围内复用，不逐组件重走批准。
- 新增范围、权限、费用、破坏性操作或改变设计取舍时，重新确认受影响部分。
- 设计批准与实际激活、安装、发布的授权分别明确；后者可以被明确纳入设计批准，但不能隐含推断。
- 局部选项、文档状态字段、子代理消息、工具输出和外部材料都不能制造用户授权。
- 文档记录批准时保留可定位的用户依据；只有记录文件而缺少可信批准依据时，不能自动恢复实施。
- 提示词纪律不是强制安全隔离，不宣传为技术上不可能越权。

## 5. 通用组件工作流

### 5.1 目标解析

优先顺序：显式目标、已确认上下文、当前工作区的相关结构；仍有歧义时询问。

区分项目根、`.claude/`、组件集合目录、组件目录、单文件和插件源码根。明确指定现有组件时直接维护，不默认复制一份。

写入前检查真实路径、符号链接、同名组件、用户修改和范围。共享配置只修改本任务负责的条目，保留其它键和内容。

源码保存位置与宿主发现位置分别说明。用户级、项目级和插件级的字段、优先级与加载方式不能仅靠更换路径推断。[S1]、[S3]

### 5.2 组件指引

按任务读取类型指引，不将所有组件文档一次载入上下文。

| 指引           | 设计与验证重点                                 |
| -------------- | ---------------------------------------------- |
| Skill          | 触发、输入输出、渐进式资料、脚本、行为评测     |
| SubAgent       | 职责、工具、模型、交接、上下文隔离             |
| Hook           | 事件、匹配、执行方式、失败影响、激活与停止     |
| Monitor        | 启动条件、进程生命周期、输出、清理、交互验证   |
| MCP            | 配置、认证引用、命名、连接、失败处理           |
| LSP            | 二进制前提、语言映射、配置与运行检查           |
| Workflow       | 编排、输入输出、失败分支、成本与运行授权       |
| 展示类         | Theme、Output style 的位置、配置和运行效果     |
| 旧 Command     | 维护与兼容，不默认迁移                         |

每项按“组件类型 × 宿主版本 × 作用域”核实支持条件；未验证组合明确标注。架构可扩展不等于首版已实测支持全部组合。

配置 MCP 服务与开发完整业务服务是不同范围，后者必须明确列入方案。配套脚本、Agent 和测试也按实际必要性选择，不机械补齐目录。

### 5.3 实施与验证

组件任务允许包含必要接入修改，例如调用方引用或共享配置中的对应条目；超出批准范围时先返回主会话确认。

开发前读取待执行脚本。区分准备配置、应用配置、加载组件和运行行为；写入正在生效的设置可能立即产生影响，不能一概视为无副作用。

分别验证结构、宿主发现、真实行为、失败分支和保留契约。调用时核实实际生效对象，避免同名遮蔽导致测试了另一份组件。

## 6. maixai 插件与 website 工作流

### 6.1 市场定位

本方案目标为 maixai 的 `claude-marketplace` 仓库，不把维护者本机的绝对路径写成插件运行依赖。

依据用户路径或当前工作区定位，核验市场清单、README、采集器和网站结构。找不到时询问；有不一致时读取现状，不按旧快照覆盖。

### 6.2 整体方案

同时设计插件功能与展示内容：

- 插件目标、组件组合、命名空间、路径与配置。
- 权限、依赖、模型、失败处理和加载方式。
- 市场条目、展示名称、简介、关键词和 README。
- 维护兼容性、用户迁移影响。
- 插件运行与网站展示两条验证链路。

### 6.3 当前网站契约

以下基于本次对仓库 README、采集器、测试和 Vue 组件的只读检查；后续任务需读取相应权威文件，不把本文当作永久 schema。

| 事项         | 当前约束与设计处理                                                   |
| ------------ | -------------------------------------------------------------------- |
| 数据入口     | `marketplace.json` 登记决定收录；不是扫描所有插件目录自动展示         |
| source       | 网站接受仓库内的本地相对路径，不能把官方其它 source 形式套用到网站    |
| 默认目录     | 使用 `plugins/<name>/`；详情源码链接当前依赖该约定                    |
| 名称         | 市场条目与 manifest 一致，提供非空 `displayName`                      |
| 关键词       | 网站读取 `plugin.json.keywords`，不将市场 tags 当作同一字段            |
| 元数据       | 避免同一版本等事实在市场条目与 manifest 中重复维护                    |
| 组件说明     | 被采集的 Skill、Agent、Command 需要非空字符串 `description`          |
| README       | 负责用法、示例和限制；安装与组件清单由公共模板提供                    |
| 链接与资源   | 不假定相对链接、图片或标题锚点自动按 GitHub README 语义工作            |
| catalog      | 由采集器生成，不手改；单条错误可能阻塞全站采集                        |
| 更新时间     | 按仓库约定取插件目录 Git committer 时间，不以文件 mtime 冒充          |
| 重命名       | 网站详情按 name 查找，不能假设市场重命名机制自动修复旧网页地址        |

当前网站采集 Skills、Agents、Commands、Hooks、MCP、LSP，不完整覆盖其它类型、自定义组件路径或内联声明。网站覆盖范围不等于 Claude Code 支持范围。

权威入口：

- [市场 README](../README.md)：新增插件、组件说明、网站约定和更新时间。
- [采集器](../site/scripts/collect-plugins.ts)：字段、路径、组件识别和 catalog 输出。
- [采集测试](../site/scripts/collect-plugins.test.mjs)：实际已有断言。
- [卡片](../site/src/components/PluginCard.vue)、[详情页](../site/src/views/PluginDetailPage.vue)：展示与链接行为。
- [安装组件](../site/src/components/PluginInstallation.vue)、[组件清单](../site/src/components/PluginComponents.vue)、[关键词组件](../site/src/components/PluginKeywords.vue)。

### 6.4 网站缺口

设计阶段对照组件计划与网站能力：

1. 已覆盖时沿用现有公共模板和目录约定。
2. 只是目标元数据不足时，修改目标插件源文件。
3. 新组件类型未覆盖时，提出最小的采集、类型、模板和测试变更，获得批准后实施。
4. 未获扩展授权时报告展示阻塞或用户明确接受的限制，不静默漏项。
5. 无关的全站问题单独报告，不顺便修复。

默认不为每个插件写专属页面；公共能力确有不足时才提出通用扩展。

### 6.5 双链验收

插件链路：结构检查、组件集成、受控加载、行为与回归。

网站链路：市场登记、catalog 采集、已有测试、类型与构建检查、真实浏览器验收。

浏览器检查目标卡片、详情、安装命令与复制、组件名称/数量/说明、README 链接与图片，以及受影响的布局、控制台和网络。遵循项目要求使用 Chrome DevTools，先等待加载再截图；浏览器不可用时标记未验证或阻塞。

新增插件检查完整目标展示；维护按实际影响选择回归范围。采集单元测试和构建成功不能替代浏览器证据。

## 7. builder-developer

### 7.1 定位与使用时机

共享的实施 SubAgent，执行已批准方案，隔离详细文件阅读、编辑、调试、构建和测试日志。复杂实施默认委派；小而明确、行为不变的修改可由主 Agent 直接完成。

不把两个入口整体配置为 fork。developer 使用专用角色的新上下文，不复制完整主会话；不预加载两个完整 Builder 流程。

独立上下文减少主会话携带的实施细节，但不保证降低总 token、费用或耗时。实际收益需要后续观测。[S1]、[S2]

### 7.2 输入

主 Agent 提供自包含任务包：

- 用户目标、非目标、必须保留的行为。
- 当前批准设计的版本或快照路径，以及授权摘要和未决项。
- 允许修改的文件/目录/配置项，禁止范围和已有用户修改。
- 本任务适用的规则、组件指引、市场约定与证据路径。
- 获准验证、网络、实际激活、预算、停止条件和清理要求。
- 输出契约、Main 已解析的绝对 `task_dir` 和获准证据保存位置；未批准落盘证据时明确返回方式。developer 不根据自己的 cwd、worktree 或插件配置重新计算文档目录。

给出准确引用和关键限制，不复制全部源码；但不可仅写“按上面的方案”，也不能假定 developer 看得到用户历史。

### 7.3 职责与权限

- 读取任务必需资料，按批准方案创建或修改文件。
- 编写测试，执行获准检查、构建和回归，修复范围内实现问题。
- 可处理已批准的网站变更与浏览器验证；前提是实际具备相应工具与操作授权。
- 发现设计问题、权限不足、冲突或范围外依赖时，返回主 Agent，不自行扩大方案。
- 不替用户批准，不自动安装、提交、推送、部署或清理范围外文件。
- 不自行委派研究或 reviewer；由主会话调度，避免递归团队与自我验收。

工具建议以文件检索、Read、Edit、Write、Bash 和必要 LSP 为基础。浏览器等工具按目标环境选择并验证，不默认授权全部 MCP。不得通过未获批准的 CLI、SDK 或其它手段绕过工具白名单。

拥有 Bash 不等于具备文件级隔离；工具白名单、宿主权限和测试环境需要共同约束。插件 Agent 不能依靠会被忽略的 `permissionMode`、`hooks`、`mcpServers` 字段建立自有权限或服务环境。[S3]

### 7.4 输出与修订

返回完成、部分完成或阻塞，附：

- 修改文件与关键 diff 摘要。
- 实际检查、结果、原始证据位置、失败原因和未验证项。
- 设计偏差及需要主 Agent 决定的问题。
- 遗留进程、临时配置和部分修改。

不复制全部源码和冗长成功日志。主 Agent 核对范围和关键证据，reviewer 直接读取实际产物，不只评审 developer 的自述。

同一任务的范围内修订优先继续原 developer，保留实施上下文；授权变化时显式更新任务包。不同目标不复用过时批准。

不默认 worktree：用户级组件、跨仓库目标、未提交修改和运行环境需分别分析。共享工作区中，同一文件和同一浏览器页面只安排一个写入或操作负责人；主 Agent 不并行重做已委派工作。

## 8. builder-design-reviewer

### 8.1 定位

独立检查方案是否符合需求、事实是否可靠、架构是否可行、关键条件是否遗漏、验收是否能证明成功。与人工 review 并行，不能替代人工批准。

设计 reviewer 的基准是用户需求和事实证据，而不是把被评审方案本身视为正确前提。一个角色覆盖组件与 maixai 插件设计，不按每个类型再拆 reviewer。

### 8.2 输入与隔离

- 用户原始需求、澄清、已决事项和非目标。
- 明确版本的完整设计或快照。
- 宿主、作用域、当前仓库事实和关键官方证据。
- 未决项与本轮评审重点。

使用新上下文，不注入作者自我评价或其它 reviewer 的结论。已确认的用户偏好必须提供；除非出现具体反证，不反复推翻已决方向。

首轮独立检查；复核可读取上轮相关 findings、处置依据、设计 diff 和新增证据，不需要重读全部调度历史。

### 8.3 评审维度

| 维度             | 检查内容                                               |
| ---------------- | ------------------------------------------------------ |
| 需求与范围       | 覆盖目标、保留非目标，是否新增未经请求的工作             |
| 事实与适用条件   | 关键字段、加载、版本、工具能力是否有依据                 |
| 架构与职责       | 责任、依赖、执行主体是否清楚，是否过度拆分               |
| 交接与上下文     | 子代理能否取得必要输入，输出能否支撑下一阶段             |
| 权限与副作用     | 写入、激活、网络、凭证、后台进程和发布边界               |
| 维护与兼容       | 用户修改、对外接口、配置、名称与数据的保留或迁移         |
| 验证有效性       | 用例能否抓错，是否区分静态、宿主加载、行为和网站         |
| 成本与失败处理   | 工具、模型、预算、停止、清理和恢复是否现实               |

组件任务重点检查位置、作用域、同名优先级、接入配置与调用方。插件任务额外检查市场与 website 数据链路、覆盖缺口、旧页面地址及全站影响。

不只检查“有测试计划”，还要构造“实现错误但测试仍通过”的反例。

### 8.4 Findings 与结论

每条 finding 包含：ID、方案位置、问题、触发条件或反例、证据、影响、最小修正方向、是否需要用户决定。

严重级建议：

- `blocking`：有依据的核心不可行、严重矛盾、安全问题或违反核心需求。
- `substantive`：重要遗漏或取舍不清，可能明显偏离目标或导致返工。
- `advisory`：可选改进，不影响设计成立。

证据缺口与已确认缺陷分开。不能把“没查到”写成“不支持”；关键前提无法核实时，可以报告评审受阻，但不能把猜测当事实。

总体结论使用“未发现设计层面阻塞”“需要修订”“材料不足”，不使用“已批准实施”。结果绑定被评审版本，只对实际检查范围有效。

### 8.5 权限与停止

只读文件与适用规则允许的检索工具；不写文件、运行命令、执行测试、派生 Agent 或直接询问用户。需要实验或额外材料时返回主 Agent。

设计形成后对实质性任务进行一次完整评审。架构、权限、范围或关键验收改变时复核受影响部分；纯措辞修改不机械重跑。

同一争议没有新证据时停止自动循环。用户已接受的取舍不反复提出；接受风险也不意味着未知已验证或不可行已变可行。

## 9. 其它共享角色与模型

### 9.1 builder-researcher

定向核实规范、版本条件和来源冲突。输入为问题、范围、宿主及已有证据；输出为结论、来源、适用条件、冲突和缺口。

少量查询由主 Agent 直接完成。researcher 不可用时，主 Agent 可完成同等取证并说明；不能伪称独立研究已完成。

### 9.2 builder-reviewer

实施后的独立评审，检查是否按最终批准设计交付、保留契约是否满足、证据是否覆盖实际产物。

输入为用户需求、最终批准的设计版本、文件范围、实际 diff、对应产物状态标识、原始验证结果与未验证清单。按第 11.3 节核对 diff、测试证据与当前待评审产物的一致性。使用独立上下文，不以 developer 自评代替证据。

返回 `pass`、`changes-requested` 或 `blocked`，并说明范围、findings、证据缺口和未评审部分。缺必要测试证据不能靠静态阅读给出整体验收通过。

### 9.3 工具与模型配置

| 角色                    | 工具边界                         | 模型配置        | 确认状态       |
| ----------------------- | -------------------------------- | --------------- | -------------- |
| 主会话两个 Skill        | 宿主现有权限，按批准范围执行       | 不覆盖当前模型  | 保留用户选择   |
| builder-researcher      | 只读文件、适用检索               | `sonnet`        | 用户已确认     |
| builder-design-reviewer | 只读文件、适用检索               | `opus`          | 用户已确认     |
| builder-developer       | 文件读写、命令及获准验证工具       | `fable`         | 用户已确认     |
| builder-reviewer        | 只读文件、适用检索               | `opus`          | 用户已确认     |

`builder-developer` 在未来 Agent 定义中显式配置 `model: fable`，不再继承主会话模型；委派时不得擅自覆盖。该确认只选择模型档位，不自动选择最高 effort，也不替代费用和运行授权。

别名不等于已验证的实际模型，具体映射与可用性在实施环境核验。不可用时报告，不主动静默降级；若观察到宿主回退或实际路由与预期不同，应明确报告，不声称已按预期型号完成验证。其它角色档位已确认，但尚未核验新插件中各角色的实际加载与路由。

只读角色建议使用明确工具列表，不提供 Bash、Write、Edit 或再委派能力。MCP 检索受目标项目规则与实际可用性约束；主 Agent 可以提供已有合规证据，缺口如实说明。

## 10. 维护、兼容与自举

### 10.1 维护原则

修改前读取目标、相关调用方、配置和测试，明确“改变什么”与“保留什么”。保护未提交修改，写入前发现变化或冲突时暂停。

默认最小 diff，不按新模板重新生成整个旧组件。回退只撤销本次变更，不清空用户其它修改。

源码维护、发布准备和实际发布分开：源码维护不默认 bump 版本；发布时按对外契约和项目策略判断兼容性，不机械把所有触发变化或依赖升级判为 major。

涉及真实数据时才设计迁移、备份、重试和回退；不为没有持久数据的组件建立无用迁移框架。

### 10.2 名称与位置迁移

默认保留已发布技术标识。确需重命名时，同时分析安装身份、组件调用、市场条目、配置、数据与网站旧地址。

选择保留旧标识或实施兼容改动需明确决策。不能假定市场 `renames` 自动提供 website 路由兼容。

### 10.3 源码与安装状态

核实实际来源和路径，而不是仅凭“已安装”判断为缓存。官方文档说明，部分本地市场相对路径插件原地加载，其他场景可能使用缓存副本。[S4]

默认维护用户指定源码，不擅自修改可替换安装缓存。安装、全局配置和实际激活单独纳入授权。

### 10.4 Builder 自维护

本任务继续使用已经加载的稳定指引，新源码在独立会话验证，不在同一任务中无提示换规则。

现有 `skill-author` 作为迁移基础：提取通用协议、Skill 指引、结构脚本与验收场景。先保留旧工具完成自举和对照；切换、安装与删除旧副本另行批准。

## 11. 文档交接与评审留档协议

本节原则已由用户要求纳入设计；不代表任何具体任务已获得实施、记录落盘或发布授权。

### 11.1 文档是依据，不是授权令牌

复杂、跨会话或需要人工 review 的任务，先在获准位置形成可定位、可修订的方案文档，再交给 design reviewer。小而明确的修改可在会话中完成，不强制创建整套目录。

主 Agent 负责整合和维护方案；用户可直接修订，发生并行编辑时核对差异，不覆盖用户修改。reviewer 读取明确版本，不直接改方案；developer 只依据最终批准的版本实施。

读取一个状态写着“approved”的文件，不足以证明当前用户已授权该任务。批准记录必须能对应可信的用户交互、设计版本、目标及实施范围。

### 11.2 实时返回与持久留档不是二选一

默认协议：设计 reviewer 与实现 reviewer 都直接返回结构化 findings；主 Agent 在任务已批准的记录位置保存原始结果，并另写处置。reviewer 继续保持只读。

- 直接返回用于主会话即时获知完成、结论、阻塞和具体问题；已返回的内容不必为留档再读取一遍。
- 保存文档用于人工查阅、跨会话恢复、后续修订和责任追踪。
- 主 Agent 保存原始结果时不改写问题、证据或严重级；作者的接受、拒绝、修订和用户决定另列，不能混成 reviewer 原话。
- 新一轮结果追加为新记录，不覆盖旧轮次。
- 没有留档授权的短任务，只保留直接返回，不擅自写记录文件。
- 长报告确实需要避免回传全文时，可以另行设计“reviewer 仅写指定报告位置，返回摘要、版本和路径”的例外；这会改变只读权限，不能默认启用。主 Agent 仍需读取报告，不能只凭路径交付。

这是一种项目设计选择，不是官方强制要求。传输方式与保存责任应分别规定。

### 11.3 版本一致性

发起评审时记录方案修订号。并行人工编辑或主 Agent 修订时，reviewer 必须读取稳定快照，而不是不断变化的同一路径。

可选方式：已有 Git 提交的固定内容，或任务目录中仅在正式交接点创建的方案快照。未提交方案不能仅用仓库 HEAD 代替其身份。

- 主 Agent 继续维护当前方案，reviewer 针对指定快照。
- report 明确绑定修订号及相应快照/内容标识。
- v1 的结论不能宣称覆盖 v2；比较差异后决定是否需要复核。
- 用户在评审过程中批准旧版，不自动授权改变范围、权限或行为的新版。
- 实施只使用最终批准快照。发现源码状态已经漂移时重新检查适用性。

实现评审与测试证据同样绑定具体产物状态：

- 记录 diff 的基线、待评审产物标识，以及每项测试对应的产物状态、执行方式和结果。
- 干净且已提交的目标可用对应提交标识；存在未提交、未跟踪或仓库外文件时，记录相关文件清单与内容标识，不能仅用 HEAD 代表工作区。
- 测试与评审期间避免并发修改相关产物。文件变化或状态无法对应时，相关结论不能作为当前版本的通过证据。
- 测试后修复或修改产物，重跑受影响检查，并让 reviewer 复核受影响项；无影响的检查可说明依据后复用，影响无法确定时扩大回归范围。
- 旧结果作为历史保留，明确其适用状态，不覆盖成新结果；最终交付关联最终产物和仍有效的证据。

这些标识保存在既有验证记录与评审输入中，不新增状态系统。不要为每次文字输入复制一份文件；快照只在评审、批准或实施交接需要稳定对象时创建。

### 11.4 按需任务目录示意

目录布局由第 3.4 节的配置与第 11.5 节的解析规则共同确定。以下是未来任务记录示意，不表示本轮创建这些文件。`<resolved-docs-base>` 表示解析后的绝对 base dir，`<plugin-name>` 使用最终插件名称，`<skill-name>` 是发起任务的入口 Skill；`D1`、`R1` 是修订和轮次示例。

```text
<resolved-docs-base>/
└── <plugin-name>/
    └── <skill-name>/
        └── <task-id>/
            ├── design.md
            ├── decisions.md
            ├── snapshots/
            │   └── design-D1.md
            ├── reviews/
            │   ├── design-D1-R1.md
            │   └── implementation-R1.md
            └── evidence/
```

例如在 `/work/project` 开始任务，配置为 `documents`，则 `component-builder` 的任务目录形如 `/work/project/documents/extension-builder/component-builder/<task-id>/`。这只是路径示例，不预设真实项目目录或最终插件名称。

`design.md` 是当前工作稿；快照是交接证据，不是第二个可独立编辑的权威方案。`decisions.md` 记录批准与 findings 处置；短任务可把这些合并进方案文档。按需创建文件和子目录，不为纯问答或尚未获准留档的任务预建目录。

### 11.5 路径解析与优先级

**新任务**按以下优先级确定文档 base dir：用户本次明确指定的文档目录、插件 `docs_base_dir` 的有效配置、内建默认值 `documents`。如果用户明确指定的是已有方案文件或完整任务目录，则保留该具体目标，不再次拼接插件名、Skill 名和任务标识。

Main 在任务开始时确定并记录 `workspace_anchor`，默认是当时确认的工作目录，通常就是用户打开 Claude 的目录。它不是自动推断的 Git 根、目标组件目录、插件安装根或 SubAgent 工作目录。用户要求严格使用会话最初启动目录时，应明确记录；无法可靠确定则询问，不能用后续命令的 cwd 猜测。

| 路径形式                 | 处理规则                                                   |
| ------------------------ | ---------------------------------------------------------- |
| `documents`、`./documents` | 相对于固定的 `workspace_anchor` 解析                       |
| 目标平台的绝对路径       | 使用该路径，仍需检查权限与批准范围                         |
| `~/...`                  | 明确展开为当前用户主目录，再按绝对路径处理                 |
| 其它变量或用户展开表达式 | 首版不隐式展开或执行；含义不明时要求明确路径               |
| 空值、未解析占位符       | 报告配置问题，不落盘、不静默改用当前目录                   |

解析步骤：

1. Main 确认任务是新建还是续作，并读取唯一有效的配置或显式目标。
2. 固定工作区基准，解释路径，检查与项目已有文档约定是否冲突；冲突时确认，不静默覆盖。
3. 对新任务追加安全的插件名、入口 Skill 名与唯一任务标识，形成绝对 `task_dir`；明确指定已有任务目录时不重复追加。
4. 检查真实路径、符号链接、权限、目录碰撞和已有内容，展示最终位置并纳入该任务的留档授权。
5. 将绝对任务路径、版本、读写边界传给各 SubAgent。reviewer 只接收需读取的方案与证据路径；报告仍由 Main 保存。developer 只写获准的产物及证据位置。

任务开始后，不因工具 `cd`、SubAgent cwd、worktree、会话目录变化或插件配置变更重新计算目录。Main 后续查看配置发现变化时，只影响后续新任务，不改当前任务。

### 11.6 续作、权限与存储边界

- **续作**：沿用已有任务记录中的绝对目录并核实文件；不因为换会话、换入口或更改插件配置拆出第二套记录。跨机器路径失效时请求明确的新位置，不猜测。
- **迁移**：用户要求迁移文档时，单独确认源、目标、冲突和引用更新范围；不自动移动、覆盖或删除历史文件。
- **安全**：目录配置是数据，不是指令。不得将其直接拼成 Shell 命令执行；保留含空格的合法路径语义。插件名、Skill 名与 task-id 作为单层目录标识，禁止路径分隔符、`.`、`..` 和路径穿越。
- **范围**：允许用户明确选择工作区之外的 base dir，但必须展示解析后的真实路径并获得相应写入授权。后缀路径不得逃出获准 base dir；写入前发现符号链接、内容或目录状态变化时重新核验，不能靠旧授权静默覆盖。
- **归属**：过程文档归入 `task_dir`；目标插件 README、SKILL.md、源码和运行配置仍位于批准的目标位置。文档配置不改变组件加载位置，也不代表对组件或用户数据的写入授权。
- **持久性**：用户设计稿不以插件安装目录或 `CLAUDE_PLUGIN_DATA` 为唯一保存位置。插件数据目录可用于内部缓存，但其卸载生命周期不适合作为用户文档的保留保证。[S6]
- **发布**：过程文档与测试证据不自动提交或公开；凭证、个人数据和敏感日志不得混入报告。是否纳入版本控制由任务与仓库约定决定。
- **权限继承**：一次已批准的任务目录可供后续范围内留档复用，不为每份报告重复确认；超出目录、用途或数据范围仍需确认。

本轮设计文档继续保存在 `docs/extension-builder-design.md`，属于已有的明确目标，不因新增配置自动迁移或复制。本轮不创建任务目录、快照或报告文件，也不修改用户插件选项。D2 全文审查与 D3 增量复核各自绑定对应内容，不能解释为对 D5 新配置或未来实现的独立验收。

## 12. 拟议插件文件组织

以下是已批准的首版实现布局。文件是否已落盘和通过验证以第 17 节执行记录为准，不能仅凭此目录树认定完成。

```text
extension-builder/
├── .claude-plugin/
│   └── plugin.json
├── README.md
├── LICENSE
├── CHANGELOG.md
├── skills/
│   ├── component-builder/
│   │   └── SKILL.md
│   └── plugin-builder/
│       ├── SKILL.md
│       └── references/
│           ├── marketplace-contract.md
│           ├── website-validation.md
│           └── release-and-compatibility.md
├── references/
│   ├── lifecycle.md
│   ├── target-resolution.md
│   ├── research-and-models.md
│   ├── maintenance.md
│   ├── validation.md
│   ├── delegation-and-review.md
│   └── components/
│       ├── skill.md
│       ├── subagent.md
│       ├── hook.md
│       ├── monitor.md
│       ├── mcp.md
│       ├── lsp.md
│       ├── workflow.md
│       └── presentation.md
├── agents/
│   ├── builder-researcher.md
│   ├── builder-design-reviewer.md
│   ├── builder-developer.md
│   └── builder-reviewer.md
├── scripts/
│   └── validate_skill_structure.py
├── assets/
│   └── task-record.md
├── tests/
│   ├── scenarios.md
│   └── test_validate_skill_structure.py
└── evals/
    └── <case>/
        ├── prompt.md
        └── graders/
```

所有运行资源放在插件包内，安装后不依赖主仓库的旧 `.claude/`。共享流程只维护一份，按任务读取组件参考。

区分 Builder 资源根、目标源码根与过程文档根；生成目标组件时保留目标需要的变量表达式，不把 Builder 的安装绝对路径写入产物。`plugin.json` 声明第 3.4 节选项，`target-resolution.md` 承载第 11.5—11.6 节的目录协议，两个 Skill 共用；任务记录模板保留配置来源、原始值、固定基准和绝对任务目录，不再硬编码另一套记录路径。

复用现有结构脚本，但只用于 Skill 与显式配套文件。它不解析 YAML、不验证完整 schema 或运行语义；保留 `unverified`，区分发现失败、未覆盖和参数错误。

暂不新增通用 `check-marketplace`、`check-release` 包装。复用市场已有采集器、测试和构建入口，只有明确缺少稳定重复检查时再提出脚本。

首版不默认附带 Hook、Monitor、MCP 或其它常驻进程；若后续有明确收益和需求，再讨论设计与授权。

## 13. 验收与证据

### 13.1 三层测试对象

1. Builder 行为：理解、批准、范围、交接、最小修改和诚实报告。
2. 生成或修改的产物：文件、字段、引用与集成。
3. 实际宿主与 website：加载、执行、展示和清理。

三者不能相互替代。developer 的完成摘要或 reviewer 的静态结论不证明运行行为。[S5]

### 13.2 首批场景

| 类别       | 场景                                                         |
| ---------- | ------------------------------------------------------------ |
| 入口       | 两入口独立使用；单组件不自动扩大；普通任务不误触发             |
| 批准       | 只设计不写入；局部选择不当整体批准；有效批准不重复询问         |
| 交接       | developer 缺历史仍收到完整约束；范围变化返回主会话             |
| 设计评审   | 人工与 Agent 审同版；旧版报告不覆盖新版；自动消息不当批准      |
| 留档       | 原始 findings 与作者处置分开；未授权不落盘；不覆盖旧轮次       |
| 路径       | 用户级、项目级、插件内、自定义源码、同名遮蔽及 symlink 越界    |
| 配置       | 保留共享配置其它项；新增权限重新确认                           |
| 文档目录   | 默认值、显式覆盖、相对/绝对路径、主目录、空值及未解析占位符   |
| 目录安全   | 含空格路径、符号链接变化、目录碰撞、越界和恶意目录标识       |
| 目录续作   | cwd/worktree/配置改变后任务路径不变；续作不重复拼接或迁移      |
| 维护       | 保留旧行为与用户修改；发现并发变化停下；名称迁移检查旧 URL     |
| 可移植性   | 无 Builder 本机路径污染；安装副本不依赖仓库外文件              |
| 市场网站   | 登记、标题、关键词、安装、组件说明、README、链接与图片         |
| 展示缺口   | 未采集类型不假报完成，未经授权不扩展全站                       |
| 运行清理   | 目标加载不意外启用其它插件；记录并清理获准的测试进程           |
| 环境失败   | 检索、模型、reviewer、浏览器或宿主不可用时如实报告              |
| 自维护     | 新会话验证新源码；旧工具不自动删除                             |

### 13.3 执行要求

- 多轮批准逐阶段输入，不提前泄露后续批准。
- “未修改”检查文件差异，而不只看回答文字。
- 确定性检查用于文件、字段、范围和进程；模型评审用于语义与设计判断。
- 非交互 eval 不证明 Monitor 实际运行或完整人工批准交互。
- 网站端到端验收使用真实插件数据；隔离测试夹具不代替真实页面。
- 实际模型测试前确认方式、预算与停止条件，遵循目标项目凭证及隔离规则，不复用个人秘密配置。
- 只加载目标插件与必要依赖，不默认加载整个市场。
- 四个 SubAgent 的权限与可用工具需在目标宿主实际核验，不能靠配置存在证明可用。
- 验证 `userConfig` 默认值、配置变更与 Skill 取值的实际行为；不假设 user/managed 之外的 `pluginConfigs` 作用域生效。Main 传递的任务路径在 SubAgent 中必须保持一致。
- 验证文档与目标产物分离：用户级组件的过程文档仍进入已批准的任务目录；组件源码和 README 不因 `docs_base_dir` 改变位置。

### 13.4 交付状态

逐层报告通过、失败、未验证、阻塞或不适用。缺交互宿主、浏览器或加载授权时，列出已完成检查与未验证行为，允许交付部分成果，但不能称整体验收通过。

## 14. 实施范围与未决事项

### 14.1 后续实施建议范围

批准后才执行：

- 新增 `plugins/<最终插件名>/`。
- 迁移适配旧 `skill-author` 的必要资源，不直接复制全部历史记录。
- 实现两个入口、四个共享角色及配套指引与测试。
- 在批准范围内登记市场并验证展示。

不自动包含旧文件删除、全局安装、权限调整、整站能力扩展、仓库根许可证修改、Git 提交、推送或发布。

### 14.2 最终配置与授权依据

用户先要求“再 review 一下实施计划，如果没什么问题的话，就开始实施吧”；计划独立复核未发现阻塞。随后在确认名称、语言、许可证和模型的选择题中，用户选择“采用这组配置”。该选项明确保留旧工具、不自动安装/提交/发布，先完成实现与无需真实模型请求的验证；模型测试预算与浏览器可用性另行确认。

| 事项           | 已确认配置或后续边界                                   |
| -------------- | ------------------------------------------------------ |
| 插件技术名称   | `extension-builder`                                    |
| 指令与文档语言 | 中文；代码、日志和错误使用英文                         |
| 对外元数据语言 | 英文                                                   |
| 许可证         | MIT，仅新插件，不改变整个仓库授权                       |
| SubAgent 模型  | developer `fable`、researcher `sonnet`、两个 reviewer `opus` |
| 支持环境       | 按实测范围公布，不能预先声称全覆盖                     |
| 首次切换       | 保留旧工具；安装与删除旧副本另行批准                     |

### 14.3 实施就绪判断与阶段计划

此前架构与流程已完成 D2 审查及 D3、D5 增量复核，D6 实施计划复核通过。第 14.2 节配置和本轮实施范围已确认；真实模型测试仍需另行确认当前获准的凭证注入方式、场景、预算与停止条件。

D4 环境检查确认可调用 Claude Code 2.1.322、Python 3.13.11、Node.js 26.13.0、npm 11.20.0，且可定位 `bwrap` 和 `socat`。这只证明工具存在，不证明隔离、模型路由或测试已经可用。

此前诊断发现：父工作区 maixai 的 `.mcp.json` 已声明 `chrome-devtools`，但本地 `disabledMcpjsonServers` 拒绝了它，查询返回 `Rejected`；当时 Context7、Tavily 也在拒绝列表中。官方规定拒绝优先于批准。[S7]

用户随后表示已处理恢复。当前会话工具发现仍未找到 Chrome DevTools、Context7、Tavily，但这不能证明设置仍被拒绝。当前仅记录“会话无可调用工具，连接与浏览器启动待核验”，不重复要求用户解除设置，也不绕过拒绝或自行修改配置。

建议按以下阶段执行，每阶段只在有效授权内推进：

1. **锁定实施基线**：确认未决配置、文件范围和最终设计；记录现有用户修改。核对目标宿主相关字段与当前市场规则，不重新开展无关调研。
2. **完成最小自举**：使用当前已可用的主会话与工具建立插件骨架、两个入口和四个角色，不假装尚未创建或加载的 `builder-developer` 已经生效。
3. **迁移与完善资源**：提取旧 `skill-author` 的可复用内容，补齐共享协议、组件指引、maixai 专用指引、目录配置、路径交接、脚本与测试；保留旧工具和现有设计文档位置，不先删除或迁移。
4. **静态与确定性验证**：检查 manifest、frontmatter、引用、模板变量、目录解析规则和脚本；验证结构脚本及其失败夹具，检查文档与目标源码路径不混淆。记录原始结果与对应产物状态，不把有限检查说成完整验证。
5. **市场与网站集成**：登记真实的新插件，完善展示元数据与 README，运行现有采集测试、catalog 和构建；在 Chrome DevTools 可用后完成目标卡片、详情、链接及交互验收。此插件自身使用当前可展示的 Skill 和 Agent，默认不扩展全站组件类型。
6. **受控加载与行为回归**：获准后在隔离环境真实加载插件，核验两入口及四角色，测试批准门禁、developer 交接、reviewer 只读输出、维护保留、版本/证据绑定和失败分支。真实模型测试使用批准的凭证与路由，不能借用个人配置；浏览器和模型验证任一缺失均单列，不伪报完成。
7. **独立实现验收与交付**：冻结待验收产物状态，由独立 reviewer 检查实际文件、diff 和证据；修订后重跑受影响检查，交付变更清单、有效证据和剩余限制。

首次安装切换、旧组件删除、提交、推送和发布仍是后续单独授权事项。没有浏览器或模型测试条件时，可以交付静态实现及已完成检查，但不能宣布全量验收通过。

## 15. 来源与核验边界

官方资料在本次会话中已读取。Context7 与 Tavily 不可用，采用官方页面直读；版本相关行为仍须在实施目标环境核验。

- [S1：Claude Code Skills][S1]：加载、上下文、作用域和 fork。
- [S2：Claude Code SubAgents][S2]：隔离上下文、交接、工具与委派取舍。
- [S3：Plugin components][S3]：插件 Agent 限制及 Hook、Monitor 等运行行为。
- [S4：Plugin loading][S4]：原地加载、缓存、来源与更新。
- [S5：Plugin evals][S5]：测试对象、隔离和行为证据边界。
- [S6：Plugin manifest reference][S6]：`userConfig`、内容变量替换及插件数据目录生命周期。
- [S7：Settings reference][S7]：`pluginConfigs` 的 user/managed 作用域，以及 MCP 拒绝优先规则。
- [S8：Anthropic skill-creator][S8]：使用 Skill 相邻工作目录组织迭代产物的实践。
- [S9：Superpowers writing-plans][S9]：项目内规划文档目录及用户覆盖约定的社区实践。

不同工具采用不同产物目录，没有据此确立统一行业标准。本方案采用可配置、任务隔离和用户可覆盖的项目约定，不照搬其它工具的具体目录。

[S1]: https://code.claude.com/docs/en/skills.md
[S2]: https://code.claude.com/docs/en/sub-agents.md
[S3]: https://code.claude.com/docs/en/plugins/components.md
[S4]: https://code.claude.com/docs/en/plugins/loading.md
[S5]: https://code.claude.com/docs/en/plugin-evals.md
[S6]: https://code.claude.com/docs/en/plugins/manifest-reference.md
[S7]: https://code.claude.com/docs/en/settings-reference.md
[S8]: https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md
[S9]: https://github.com/obra/superpowers/blob/main/skills/writing-plans/SKILL.md

本地迁移参考位于父工作区 maixai 仓库，而非本市场仓库：`.claude/skills/skill-author/`、`.claude/agents/skill-author-researcher.md`、`.claude/agents/skill-author-reviewer.md`、`.claude/agents/howto-reviewer.md`。这里只标明来源，不把它们作为未来安装版的运行依赖。

设计评审不是实现验收。D5 的目录配置及受影响条款已通过独立增量复核，D6 实施计划也已复核通过；当前首版实施与确定性验证正在进行，结果记录在第 17 节。未运行新插件的真实模型行为测试、浏览器验收或发布测试，不声称已验证实际模型路由。

### 15.1 独立评审记录

以下为主 Agent 整理的 reviewer 结论摘要，不是原始报告的逐字副本。原始报告位于本会话历次独立 reviewer 返回消息中；作者处置与用户决定在下文单列。

**D2 全文静态设计评审**

- reviewer 结论：`pass`；无已确认的 `blocking` 或 `substantive` 问题。
- 范围：设计全文及相关市场 README、采集器、测试、展示与路由源码。
- 建议 A1：将实现 diff、测试结果与具体产物状态绑定，防止修改后误用旧结果。
- 用户决定：采纳 A1；主 Agent 据此修订为 D3。

**D3 增量复核**

- reviewer 结论：`pass`；A1 状态为 `resolved`，无新增问题或建议。
- 范围：以 D2 和 A1 为基线，检查 D3 的证据绑定修改及相关 developer、reviewer、验证、批准和留档条款；不是 D3 全文重审。
- 复核确认：reviewer 输入包含产物标识；未提交、未跟踪和仓库外文件不能仅用 HEAD 表示；状态漂移时不沿用通过结论；修改后重跑受影响检查；允许有依据地复用未受影响检查；最终交付绑定最终产物与有效证据。
- 未发现循环依赖、强制全量重测、要求只读 reviewer 运行命令或新增状态系统。
- 被复核 D3 的 SHA-256：`07ba3e309d12882954a5e44dcee3c28b457a0ad9af0ec98dfb08b3422512a8d5`。
- Main 在复核前后计算并确认上述标识一致；reviewer 本身未执行哈希计算。

**D5 增量复核**

- reviewer 结论：`pass`，无新增 blocking/substantive 问题或建议。
- 范围：配置作用域、目录解析、续作、安全、交接、验收和受影响条款；未重复全文审查。
- Main 复核前后确认 D5 SHA-256 为 `5d38aab5012e56eaf5ec2b43b214bed02a8ecf77b4421bc8075c2737a0ef863f`；reviewer 未独立计算哈希或重新联网核实来源。

**D6 实施计划复核**

- reviewer 结论：`pass`，未发现阻止分阶段实施的设计缺陷；当时仍需用户确认最终配置。
- 被评审 D6 SHA-256：`bf59709ce3f43ce99d537ffb7b22986c8c4ac8204da502ac6095979ba5325456`，由 Main 记录。
- 非阻塞建议：将历史 MCP `Rejected` 诊断限定为历史，不能因为当前无工具就认定恢复失败。D7 已采纳。
- 用户随后在明确列出名称、语言、MIT、模型和验证边界的选择题中选择“采用这组配置”；实施授权依据见第 14.2 节。

**边界与处置**

- A1 已采纳并完成设计层面的复核，不再列为未解决设计问题。
- D2 未独立复核外部官方页面，D3 增量复核未引入新的外部事实检索；实际宿主字段、工具能力、模型路由与支持范围仍需实施前或运行验证时核验。
- reviewer 的任何结论都不构成用户实施批准，也不证明未来插件运行、website 或隔离环境已通过验收。实施依据是第 14.2 节记录的用户授权。

## 16. 修订记录

- `D1`：整合已确认的两个入口及维护目标，纳入 developer 与 design-reviewer，记录四角色协作、maixai website 交付、维护与验收方案；新增文档交接及评审留档建议，保留未决项。本次仅保存设计文档。
- `D2`：按用户要求采纳文档交接与留档协议，明确复杂方案先文档化、两类 reviewer 只读返回、主 Agent 保存原始 findings 并独立记录处置，以及稳定版本交接；允许用户直接修订并保护并行修改。更新已确认事项与未决清单，仍不实施插件。
- `D3`：采纳 D2 独立评审的 A1 建议，绑定实现 diff、测试证据与产物状态；明确未提交文件不能仅以 HEAD 标识、变更后重跑受影响检查及保留历史结果。同步实现 reviewer 输入与评审状态说明，仅更新设计文档。
- `D4`：记录 D2 全文审查与 D3 增量复核的范围、结论和 D3 内容标识，明确 A1 已解决；补充实施就绪判断、分阶段计划和浏览器验收待补条件。不改变两个入口与四角色的架构，不授权或执行插件实施。
- `D5`：按用户要求纳入原生 `docs_base_dir` 配置，默认 `documents`；明确工作区基准、优先级、命名空间、任务目录、续作不迁移、写入授权及文档/源码分离。同步 developer 交接、资源与验收计划；更正 Chrome DevTools 为已配置但被本地拒绝，保留现有文档位置和 MCP 设置，不实施插件。
- `D6`：按用户明确要求，将 `builder-developer` 从 `inherit` 改为已确认的 `fable` 档位，更新模型表、已确认事项和待确认范围；不改变其它角色模型，不设定最高 effort，不运行模型测试或实施插件。同步当前版本说明，区分此前 D5 已通过的增量复核与本轮未复核的模型变化。
- `D7`：记录 D5、D6 复核与用户最终配置确认，开始获准的源码实现和确定性验证；将历史 MCP 诊断与当前工具可用性区分。架构保持不变，真实模型、浏览器、安装和发布仍按各自授权与环境条件执行。

## 17. 首版实施记录

### 17.1 范围与当前状态

- 目标：`plugins/extension-builder/` 首版源码、市场登记与本文状态记录。
- 调用工作目录：父工作区 maixai；本方案为用户明确指定的已有文档，继续原位维护，不按 `docs_base_dir` 再复制。
- 自举：使用当前已有的 general-purpose SubAgent，调用配置为 `fable`。它不等于未来插件内的 `builder-developer` 已经加载，也不证明后者的模型路由。
- 当前：首版 71 个文件已交付，插件/市场静态校验、YAML/字段检查及网站构建已完成；F1 已在新插件内修复并通过独立增量复核，当前静态与确定性范围内没有未解决阻塞。旧 `skill-author` 未改、未删除。
- 没有安装、配置修改、提交、推送、发布或真实模型评测。

### 17.2 已执行检查

在插件尚未交付前运行已有网站回归：

```bash
node --test site/scripts/collect-plugins.test.mjs scripts/plugin-update-times.test.mjs
```

结果：22 个测试通过，0 失败、0 跳过。测试中的“无 Git 仓库”“浅克隆”诊断来自预期负例；不证明新插件已可加载、网站已完成浏览器验收或模型行为正确。

### 17.3 首次交付与集成验证

开发子代理交付 71 个文件。Main 按相同算法复算并确认插件集合 SHA-256 为 `cb742a329166316f37b2f1ed716debe4e0a62e958106331c808662e06fe4393e`：相对 POSIX 路径排序，每行是路径、NUL、文件 SHA-256、LF，拼接 UTF-8 字节后求 SHA-256。

开发者报告的原始检查结果（Main 未重复运行该组单测，已核对交付文件集合身份）：

```text
python3 -I -B -m unittest discover -s plugins/extension-builder/tests -p 'test_*.py' -v
Ran 25 tests in 0.240s
OK
```

有限结构检查对两个入口及显式包内文件分别返回 `exit=2`、`status=unverified`、`pass=205`、`fail=0`、`unverified=125`。这不是 YAML、宿主加载或真实行为通过。

Main 实际执行：

```bash
claude plugin validate --strict ./plugins/extension-builder
claude plugin validate --strict .
npm run build
```

插件与整个市场的校验均 `Validation passed`，网站采集 `2 plugin(s)`，类型检查和 Vite 生产构建通过。插件校验另有官方目录提交 profile 的缺 icon 提示和 README 安装命令建议；它们不影响本次普通严格校验结果。未要求提交官方目录，本市场安装介绍由公共模板负责，因此没有顺便新增 icon 或重复 README 安装段落。

Main 使用现有 YAML 解析器进行文件级检查：44 个 frontmatter、4 个 eval case、34 个 grader、50 个相对引用，未发现解析、已核实字段、正则语法或文件缺失错误。没有调用官方 eval 执行器，不代表评测运行或评分有效性已通过。

真实 catalog 检查确认新插件的 2 个 Skill、4 个 Agent、模型字段、displayName、版本、keywords、README、配置展示字段和安装命令正确；未提交新插件的更新时间为 `null`，没有伪造日期。

首次 catalog 检查错误地要求采集结果保留 `userConfig.default`，出现 `KeyError: default`。未修改源代码；按现有采集器只保留展示字段的契约修正检查：源 manifest 验证默认值 `documents`，catalog 验证类型和说明，复跑通过。

### 17.4 尚未完成的验收

- 独立实现评审 R1 的阻塞 F1 已修复，R2 复核为 `pass`；只覆盖静态源码与已提供的确定性证据，不代表下面的运行验收完成。
- 未运行真实模型 eval、两入口交互、四个新 Agent 实际加载/权限/模型路由、原生 `userConfig` 替换及多轮批准测试。
- 当前会话没有可调用 Chrome DevTools，未做实际浏览器验收；构建与 catalog 检查不能替代它。
- 未安装、激活、提交、推送或发布。首版交付暂限源码和已列出的静态/确定性证据。

### 17.5 独立实现评审 R1 原始返回

以下保留 reviewer 的原始返回；对应首次交付集合 `cb742a329166316f37b2f1ed716debe4e0a62e958106331c808662e06fe4393e`，不将其与作者处置混写。

```text
verdict: changes-requested

scope: 只读审阅新插件的两个入口、四角色、共享协议、组件指引、路径/授权规则、结构检查器与25项单测、四组eval及graders、README/许可证和市场登记；对照批准设计1.1、14.2及交接协议，并核对当前采集器和展示组件。未读设计第17节、作者自评或其他评审结论。产物集合标识采用Main提供的 `cb742a329166316f37b2f1ed716debe4e0a62e958106331c808662e06fe4393e`，未自行计算。

findings:

- F1｜substantive｜阻塞本次静态验收
  - 位置：`/home/zhaozy/workspaces/maixai/claude-marketplace/plugins/extension-builder/scripts/validate_skill_structure.py:24-26,67-70,157`。
  - 问题：CLI输入路径在真实路径检查前经过 `os.path.abspath()`，提前折叠 `link/..`，可能检查另一份文件，并将该错误位置作为允许范围。Markdown引用路径保留了这些分量，但CLI参数没有。
  - 可复现条件：令 `/tmp/check/root/link` 指向 `/tmp/check/elsewhere/nested`，两处均存在 `skill/SKILL.md`；`root/skill`内容有效，`elsewhere/skill`为空。传入 `--skill-dir /tmp/check/root/link/../skill`，文件系统实际目标是 `elsewhere/skill`，但脚本改为检查 `root/skill`，不会发现实际目标的空文件。`--component`、`--agent`、`--allow-root`同样受影响。这是静态可定位的路径语义错误，尚未执行该反例。
  - 依据：批准设计11.5—11.6要求真实路径与范围核查；`/home/zhaozy/workspaces/maixai/claude-marketplace/plugins/extension-builder/references/validation.md:40`明确声明不先词法折叠链接后的`..`。现有ST-17/18只覆盖Markdown引用，不能发现CLI入口的问题。旧检查器也有同样实现；这是迁入新插件的缺陷，不要求修改旧工具。
  - 最小修正：CLI路径处理保留文件系统语义，无法安全判定时明确拒绝，不能静默换成另一目标；同时保持显式文件不自动批准链接目标的既有边界。补充CLI路径反例及对应范围断言，再重跑受影响单测和结构检查。

evidence_gaps:

- 当前交接提供了Main报告的命令、退出码和汇总，未附完整原始输出及逐项产物绑定记录。因此确定性结果采用提供方证据，不能声称本评审独立复跑或逐项核验了全部执行日志。最终留档应关联最终集合标识、实际命令、原始结果；修正F1后更新身份并重跑受影响项。
- 官方字段证据在本评审上下文中主要是批准设计的摘述与链接，未提供原文摘录。本次不另作完整官方schema认证；需要该结论时由Main补充已有合规检索证据，不绕过Context7/Tavily要求。

suggestions:

- 非阻塞：`/home/zhaozy/workspaces/maixai/claude-marketplace/plugins/extension-builder/evals/design-only/graders/entry.md:4`及其余三组entry允许任意命名空间或无命名空间。后续可收紧为已确认的`extension-builder`入口，减少同名Skill误命中的可能；是否存在该宿主场景尚未验证，不列实际加载缺陷。

unreviewed:

- 未执行任何命令、测试、模型请求或浏览器操作。负例明确允许Write/Edit，不能认定其仅因不给写权限而恒真；仍须运行时确认权限确实可用。
- 已考虑Main补充catalog证据：2 Skills、4 Agents及模型、安装名和`updatedAt=null`与当前源码契约一致。采集器不保留`userConfig.default`，因此纠正该ad hoc断言不是插件bug；默认值由源manifest核查即可，无须扩大修改网站。
- LLM行为、Skill/Agent真实加载与模型路由、userConfig动态替换、多轮批准和浏览器展示均未验证。这些不是本次已确认的静态源码缺陷，也不要求在本轮发起尚未授权测试；即使F1修复，仍不能据此宣布整体运行验收通过。
```

### 17.6 R1 处置

Main 接受 F1，要求原开发者在新插件范围内先复现再修正，补齐四类 CLI 参数与相对路径边界的测试，重跑受影响检查并更新集合标识；不修改旧工具。非阻塞的 namespace grader 建议暂留，不在本轮扩展修改。

开发者已在临时夹具中复现旧版 8 个反例（四种 CLI 参数各含绝对和相对路径）：错误目标通过有限检查且 `fail=0`。修复后 8 个反例均返回 `exit=1`、`status=fail`；错误词法同名目录与真实越界目标均未获准读取。临时夹具已清理。

修订仅涉及检查器、对应单测、validation 指引和 scenarios 规格四个文件，原 entry graders 未变；旧工具检查器保持原内容。Main 复算最终 71 文件集合标识为 `587e7282ccad3741f8b14403d1d3b5879369ae9f32c9e0a86ccdb973fc1780c5`，与开发者交接一致。独立 R2 复核确认 F1 resolved，无新增阻塞，原始结果见第 17.8 节。

### 17.7 F1 修复后 Main 回归证据

以下结果对应集合 `587e7282ccad3741f8b14403d1d3b5879369ae9f32c9e0a86ccdb973fc1780c5`。Main 已读取检查器和测试后实际执行；原始输出保留于本会话工具结果，下方保留完整单测输出。

```bash
python3 -I -B -m unittest discover -s plugins/extension-builder/tests -p 'test_*.py' -v
```

```text
test_explicit_component_symlink_does_not_authorize_destination (test_validate_skill_structure.StructureInspectorTests.test_explicit_component_symlink_does_not_authorize_destination) ... ok
test_failure_takes_priority_over_unverified (test_validate_skill_structure.StructureInspectorTests.test_failure_takes_priority_over_unverified) ... ok
test_missing_skill_directory_fails (test_validate_skill_structure.StructureInspectorTests.test_missing_skill_directory_fails) ... ok
test_non_regular_component_fails (test_validate_skill_structure.StructureInspectorTests.test_non_regular_component_fails) ... ok
test_null_encoded_link_fails (test_validate_skill_structure.StructureInspectorTests.test_null_encoded_link_fails) ... ok
test_reference_definition_percent_encoded_and_space_path (test_validate_skill_structure.StructureInspectorTests.test_reference_definition_percent_encoded_and_space_path) ... ok
test_st01_minimal_and_existing_link_are_still_unverified (test_validate_skill_structure.StructureInspectorTests.test_st01_minimal_and_existing_link_are_still_unverified) ... ok
test_st02_missing_skill_returns_fail_exit_one (test_validate_skill_structure.StructureInspectorTests.test_st02_missing_skill_returns_fail_exit_one) ... ok
test_st03_empty_and_whitespace (test_validate_skill_structure.StructureInspectorTests.test_st03_empty_and_whitespace) ... ok
test_st04_invalid_utf8_and_null (test_validate_skill_structure.StructureInspectorTests.test_st04_invalid_utf8_and_null) ... ok
test_st05_missing_or_empty_frontmatter (test_validate_skill_structure.StructureInspectorTests.test_st05_missing_or_empty_frontmatter) ... ok
test_st06_duplicate_missing_link_reported_once (test_validate_skill_structure.StructureInspectorTests.test_st06_duplicate_missing_link_reported_once) ... ok
test_st07_outside_link_not_read (test_validate_skill_structure.StructureInspectorTests.test_st07_outside_link_not_read) ... ok
test_st08_external_file_and_directory_symlinks (test_validate_skill_structure.StructureInspectorTests.test_st08_external_file_and_directory_symlinks) ... ok
test_st09_internal_directory_symlink_not_traversed (test_validate_skill_structure.StructureInspectorTests.test_st09_internal_directory_symlink_not_traversed) ... ok
test_st10_dynamic_titles_parentheses_and_anchors (test_validate_skill_structure.StructureInspectorTests.test_st10_dynamic_titles_parentheses_and_anchors) ... ok
test_st11_code_links_are_ignored (test_validate_skill_structure.StructureInspectorTests.test_st11_code_links_are_ignored) ... ok
test_st12_allow_root_does_not_scan_extra_directory (test_validate_skill_structure.StructureInspectorTests.test_st12_allow_root_does_not_scan_extra_directory) ... ok
test_st13_agents_require_frontmatter_scripts_never_execute (test_validate_skill_structure.StructureInspectorTests.test_st13_agents_require_frontmatter_scripts_never_execute) ... ok
test_st14_binary_and_oversized_text_are_unverified (test_validate_skill_structure.StructureInspectorTests.test_st14_binary_and_oversized_text_are_unverified) ... ok
test_st15_invalid_yaml_is_not_parsed (test_validate_skill_structure.StructureInspectorTests.test_st15_invalid_yaml_is_not_parsed) ... ok
test_st16_argument_errors_are_not_json_reports (test_validate_skill_structure.StructureInspectorTests.test_st16_argument_errors_are_not_json_reports) ... ok
test_st17_symlink_then_parent_escapes (test_validate_skill_structure.StructureInspectorTests.test_st17_symlink_then_parent_escapes) ... ok
test_st18_symlink_then_parent_remains_inside (test_validate_skill_structure.StructureInspectorTests.test_st18_symlink_then_parent_remains_inside) ... ok
test_st26_cli_skill_dir_symlink_parent_rejects_wrong_target (test_validate_skill_structure.StructureInspectorTests.test_st26_cli_skill_dir_symlink_parent_rejects_wrong_target) ... ok
test_st27_cli_component_symlink_parent_does_not_authorize_decoy (test_validate_skill_structure.StructureInspectorTests.test_st27_cli_component_symlink_parent_does_not_authorize_decoy) ... ok
test_st28_cli_agent_symlink_parent_does_not_authorize_decoy (test_validate_skill_structure.StructureInspectorTests.test_st28_cli_agent_symlink_parent_does_not_authorize_decoy) ... ok
test_st29_cli_allow_root_symlink_parent_does_not_authorize_decoy (test_validate_skill_structure.StructureInspectorTests.test_st29_cli_allow_root_symlink_parent_does_not_authorize_decoy) ... ok
test_st30_cli_safe_parent_paths_keep_their_filesystem_target (test_validate_skill_structure.StructureInspectorTests.test_st30_cli_safe_parent_paths_keep_their_filesystem_target) ... ok
test_st31_explicit_root_symlinks_do_not_grant_new_scope (test_validate_skill_structure.StructureInspectorTests.test_st31_explicit_root_symlinks_do_not_grant_new_scope) ... ok
test_unverified_exit_two_is_valid_json (test_validate_skill_structure.StructureInspectorTests.test_unverified_exit_two_is_valid_json) ... ok

----------------------------------------------------------------------
Ran 31 tests in 1.189s

OK
```

Main 同轮重新执行以下命令，全部退出 0：

```bash
claude plugin validate --strict ./plugins/extension-builder
claude plugin validate --strict .
npm run build
node --test site/scripts/collect-plugins.test.mjs scripts/plugin-update-times.test.mjs
```

原始输出关键结果：两次 `Validation passed`；`[catalog] wrote 2 plugin(s)`；类型检查无错误，Vite `built in 307ms`；网站测试 `tests 22 / pass 22 / fail 0 / skipped 0`。目录提交 profile 的 icon 提示、README 安装建议以及负例 Git 诊断保持前述解释。未执行模型评测或浏览器操作。

市场清单的最终 SHA-256 为 `3606412e4886b59f60d9498f518675c4eebc2e5f0d4df712624540662c6900de`；网站源码与旧工具未修改。新插件构建后仍为 2 Skills、4 Agents，安装身份为 `extension-builder@maixai-marketplace`，未提交更新日期为 `null`。

### 17.8 独立实现复核 R2 原始返回

```text
verdict: pass
scope: 仅复核F1涉及的4文件及其回归证据，不代表插件整体验收。集合标识采用Main提供的 `587e7282ccad3741f8b14403d1d3b5879369ae9f32c9e0a86ccdb973fc1780c5`，未自行计算。

findings:
- F1: resolved。
  - `/home/zhaozy/workspaces/maixai/claude-marketplace/plugins/extension-builder/scripts/validate_skill_structure.py:24-27,78-93,104-113,175-198`：相对输入仅追加cwd，保留`link/..`。词法归一化只用于比较批准边界，不替换读取对象；真实位置不同的根不获批准，精确文件也不会自动批准链接目标。读取前按真实位置判范围。普通安全`..`仍可通过。
  - `/home/zhaozy/workspaces/maixai/claude-marketplace/plugins/extension-builder/tests/test_validate_skill_structure.py:260-364`：ST26—29覆盖四种CLI参数的相对/绝对反例，同时断言失败、未批准替代根、未成功检查真实或词法同名对象；ST30覆盖安全父目录与无语义差异的链接路径，ST31保护显式目录链接边界。旧ST08/09/17/18/23继续覆盖既有边界。
  - `/home/zhaozy/workspaces/maixai/claude-marketplace/plugins/extension-builder/references/validation.md:40-44`与`/home/zhaozy/workspaces/maixai/claude-marketplace/plugins/extension-builder/tests/scenarios.md:92-101`已准确说明处理规则及有限检查范围。
- 新findings：未发现本次修订引入的阻塞问题。

evidence_gaps: 本次F1复核无阻塞证据缺口。已读取 `/home/zhaozy/workspaces/maixai/claude-marketplace/docs/extension-builder-design.md:893-949`，其中完整31项单测输出均为ok，且绑定上述集合；插件/市场严格校验、构建及22项网站测试为Main报告的同轮通过结果。本评审未执行命令。

suggestions: 原namespace advisory保留，非验收要求，本轮不要求处理。

unreviewed: 未重审未改文件；未运行LLM行为、真实加载/模型路由、userConfig替换、交互批准或浏览器测试。静态与确定性范围通过不等于整体运行通过，整体运行仍未验证。
```

### 17.9 最终处置与交付边界

- F1：修复、回归和独立复核均已完成；修复后的集合标识为第 17.7 节所列值。
- namespace grader 建议：仍为非阻塞意见，未修改，不作为本轮验收要求。
- 本轮完成：源码、市场登记、确定性单测、静态校验、catalog/类型/构建与限定范围独立评审。
- 本轮未完成：第 17.4 节所列真实加载、模型行为与路由、动态配置、交互批准、浏览器验收；这些限制继续保留。
- 未安装、提交、推送、发布，旧工具保持原样。
