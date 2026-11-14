# 登记与防误改

这是 Write/Edit 防误改机制，不是完整沙箱。它不拦任意 Bash、其它写入工具或同用户进程；角色仍必须遵守修改归属，交付前检查实际 diff。

## 宿主与失败边界

首先面向 Linux，脚本使用 Python 3 标准库（含 Linux 的 `fcntl`），无第三方依赖。官方资料注明 `onFailure: block` 从 Claude Code 2.1.295 支持，SendMessage 最近上下文修复从 2.1.304 提供。因此整套流程的已知版本前提至少是 2.1.304，**这不是全部功能已验证的最低兼容版本声明**；原生 userConfig、运行数据变量、真实身份、工具继承及消息返回仍需逐项验证。本次建设环境 CLI 2.1.323、Python 3.13.11 只是本地版本事实。

PreToolUse 对 Write/Edit 使用 10 秒超时和 `onFailure: block`。正常拒绝返回宿主的 deny 决策，不授予新的 allow 权限；脚本捕获运行数据/路径错误并拒绝。解释器不存在、脚本启动失败、不可捕获错误或超时只能依赖宿主执行失败策略。

**故障隔离限制：** matcher 只能过滤工具，不能过滤角色。检查进程尚未启动或发生超时时，宿主可能阻塞所有匹配 Write/Edit，包括普通模式、测试作者或无关任务。健康脚本对明确无关角色和主会话直接返回，对已绑定普通模式及测试作者不施加测试保护。缺失 `agent_type` 的子代理编辑无法可靠分类，保守拒绝。这两类保守阻塞是已知限制，不能宣称“所有故障下均不误拦”。若用户要求故障时也绝不影响其他任务，当前方案需暂停并由 Main 决定可接受策略；不能擅自改成失败放行。

SubagentStart 只观察身份并提供准备提示；其失败不能阻止角色启动，因此角色必须先只读就绪，绑定前不得通过任何工具写入。PreToolUse 是后续 Write/Edit 的门禁。Hook 没有运行过的环境不能直接进入 TDD 写入阶段。

## 机器记录与可信边界

宿主提供的绝对 `CLAUDE_PLUGIN_DATA` 下使用 `fastdev-v1/`：

- `agent-<hash>.json`：SubagentStart 观察到的 session、agent ID 和完整 namespaced type。
- `session-<hash>.json`：一个宿主会话对应一个任务，保存 task_dir、模式、角色绑定、退休身份、phase、revision、测试组、保护路径及其真实位置。
- `.lock`：串行修改登记；写入采用临时文件加原子替换。目录/文件不得是重定向运行数据的符号链接。

文件名是身份的哈希，不用未校验身份拼路径。所有输入只作为 JSON 数据，不运行路径、测试内容或记录内的命令。错误输出不包含原始事件或文件内容。登记不是授权来源，也不防同用户恶意修改；不得靠手改登记绕过测试归属。

## 可执行登记流程

Main 从已加载插件取得 `resource_root`；从 Hook 的就绪上下文取得真实 runtime data 路径。不要猜缓存路径，不扫描个人配置。以下命令是需要替换占位符的模板；资源路径和运行目录使用安全的独立 shell 参数，JSON 通过带引号的 heredoc 或标准输入传入，绝不 eval。

```bash
CLAUDE_PLUGIN_DATA='<host-confirmed-absolute-runtime-data>' \
  python3 -I '<absolute-resource-root>/scripts/guard.py' apply <<'JSON'
{"action":"observations"}
JSON
```

`observations` 返回 Hook 实际捕获的身份。Main 对照启动结果与角色只读回执，确定属于本次启动的记录。以下每个 JSON 对象是一次独立 apply 输入；将占位符换成真实值，不把整段数组提交。输出包含当前 revision；每次变更都需核对结果，失败不得继续。

```json
{"action":"init","session_id":"<session>","task_dir":"<fixed-absolute-task-dir>","mode":"tdd"}
```

```json
{"action":"bind","session_id":"<session>","role":"maixdev:developer","agent_id":"<observed-developer-id>"}
```

```json
{"action":"bind","session_id":"<session>","role":"maixdev:test-developer","agent_id":"<observed-test-author-id>"}
```

Main 只能绑定已被 Hook 观察且 session/type 完全匹配的身份。不能发明 ID 或由角色自称身份。若当前宿主给两个角色不同的 session、缺少事件字段、没有匹配的 namespaced type，先停止并报告，不改匹配规则猜测。

developer 发起测试请求后停止写入，test-developer 负责以下组操作。第一组也必须走完整登记，不能先给 developer 写入权。

```json
{"action":"pause","session_id":"<session>"}
```

```json
{"action":"open-group","session_id":"<session>","group_id":"G1"}
```

```json
{"action":"protect","session_id":"<session>","paths":[{"path":"<absolute-tests-directory>","kind":"tree"},{"path":"<absolute-test-runner-config>","kind":"file"}]}
```

- `file` 保护具体文件；`tree` 保护目录及未来子项。可以登记尚未创建的文件或目录；seal 时交接文件必须存在。
- 明确登记测试代码、预期数据、快照、辅助文件及决定测试选择/跳过/结果的配置；根目录共享配置如决定测试结果，也归测试作者。developer 需改共享文件时走测试问题流程。
- 路径必须绝对。脚本解析真实位置，考虑逻辑别名、符号链接、链接后的 `..`、已登记文件的硬链接与目录中链接指向的资源。链接位置变化时阻塞，不静默跟随新的归属。
- inventory 上限为 10000 项；登记过宽或超时要收窄到明确范围，不提高超时掩盖问题。登记目录含外部符号链接时会读取其目标的文件标识，先确认这些目标属于批准范围，不读取秘密目录。

写好并运行本组后，测试作者对照实际 diff 核对所有交接文件，再提交完整清单：

```json
{"action":"seal-group","session_id":"<session>","handoff_paths":["<absolute-test-file>","<absolute-new-snapshot>","<absolute-test-runner-config>"]}
```

未登记路径、缺文件或未打开的组会失败。**无法自动识别清单中完全漏报的测试资源**，测试作者必须核对实际变更，最终审查再次检查。seal 保存保护树内成员，识别目录内部的链接与必要别名；不是运行测试的替代。

```json
{"action":"activate","session_id":"<session>"}
```

```json
{"action":"status","session_id":"<session>"}
```

只有 developer 已绑定、TDD 测试作者已绑定且当前组 sealed、保护非空时才能 activate。preparing/paused 时 developer 不能修改源码或测试，防止新增组漏登记期间继续开发；已绑定的 developer 仍可保存固定 task_dir 中自己负责的 development.md、acceptance-developer.md、issues 下的问题文件（不含裁决）和 evidence/developer 下的证据。记录路径若指向目录外或属于保护范围也不能借此放行。测试作者正常修订不因此被拦。新组重复 pause → open-group → protect → 测试 → seal-group → activate，保护范围只能追加，不能缩减。

## 普通模式、恢复与取消

- 普通模式用独立 session init，`mode` 为 `normal`，只 bind developer，直接 activate；不建立测试组、不带 TDD 保护、不绑定测试作者。模式缺失不等于普通模式。
- 同一 session 不允许重复 init。中途切换须用户确认、处理测试归属并 close 原任务后在新会话重新准备，不能覆盖原登记。
- 角色重建：暂停写入 → pause → Main 只读启动同角色 → 获取新观察身份 → bind → 双方确认新身份及结果路由 → activate。旧 ID 进入 retired，无法继续编辑或重新绑定。
- 缺失/未知/损坏登记时，maixdev 的 Write/Edit 拒绝，其他工具也必须由角色协议停止写入。不要删除损坏数据绕过门禁；Main 根据可信业务记录与实际文件重新核验，必要时换新 session 重建全部保护。
- 主动取消或任务终止由 Main 提交 `{"action":"close","session_id":"<session>"}`；closed 对测试作者也拒绝编辑，不可 activate。close 不删除档案，暂停则使用 pause。
- 本地只读 status/stamp 不修改 revision；绑定、组操作及状态变更增加 revision。读取 status 是核对当前数据，不是批准凭证。

## 最终产物标识

`stamp` 对显式文件/目录生成内容与成员指纹，`verify-stamp` 检查是否仍对应当前文件及登记 revision；不执行命令、不证明测试通过。范围须涵盖实际源码、测试与判定配置，不包含运行中会变化的日志、缓存或结果目录，不可漏掉未提交与未跟踪的业务文件。

```json
{"action":"stamp","session_id":"<session>","paths":[{"path":"<absolute-source-directory>","kind":"tree"},{"path":"<absolute-tests-directory>","kind":"tree"}]}
```

将完整输出保存为验收证据，运行最终检查后提交 `verify-stamp`，其 `stamp` 字段为原输出对象。变化时报错，应重新核对范围并重跑受影响检查；不能重新盖章后继续复用旧 PASS。指纹验证也不能代替最终回归、测试变更依据或消息路由的真实行为验证。
