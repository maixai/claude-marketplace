# 两个开发角色的直接协作

此协议用于 TDD。Main 仅处理初始交接、重建、最终结果、阻塞和需用户决定的事项；正常逐轮讨论不转发 Main。角色不得派生子角色。

## 启动与结果路由

1. Main 在同一宿主会话启动两个角色做只读准备；两个角色均返回后，使用真实 Hook 身份绑定，不把显示名当 agent ID。
2. Main 将完整需求、固定 `task_dir`、当前身份表、修改边界和运行前提交给双方，并恢复 developer 推进。
3. developer 使用实际 `SendMessage` 工具向 test-developer 的当前 ID 请求一组测试。工具参数按当前宿主 schema 填写；下表是消息正文协议，不是虚构的工具 API。
4. test-developer 处理后正常返回。宿主应把结果返回恢复它的 developer；它不再向正等待它的 developer 发起另一个需要等待的恢复请求。
5. 需要补充材料时，test-developer 在本轮结果中返回 `need-info`，结束本轮。developer 收到后补材料并发下一轮，避免双向互等。

宿主文档描述恢复与结果重定向，但具体环境必须实际验证。没有 SendMessage、返回落到 Main、找不到 ID 或送达状态不明时，保存阻塞并交 Main；不得把未送达当成功。初次只读准备和宿主自动完成通知可以到 Main，不发送每轮内容摘要。

## 消息正文

每次只带定位必要的信息，详细证据放文件。

| 字段 | 含义 |
| --- | --- |
| `request_id` | 当前任务唯一、单调递增，例如 `R001` |
| `kind` | `next-group`、`test-issue`、`supplement`、`resume-check` 或 `cancel` |
| `task_dir` | Main 固定的绝对任务目录 |
| `requirements` | 当前确认版本及内容标识 |
| `from_id / to_id` | 当前真实角色 ID，不使用旧显示名 |
| `registration_revision` | 发送前 status 中的 revision |
| `group_id / issue_path` | 当前组或问题文件；不适用时明确无 |
| `evidence` | 本轮需要的证据绝对路径与标识 |
| `expected_reply` | 要求完成的业务结果，不是实现指令或裁决结论 |

响应回显 `request_id`、`task_dir` 和当前 ID，给出 `ready / need-info / blocked / all-groups-done / cancelled`、当前 revision、组版本、结果及证据。ID、版本、目录或 request_id 不匹配就停止采用结果；迟到结果不能覆盖新轮次。重复请求先核对已保存结果，不重复修改测试。

developer 在自己的开发记录维护当前请求和等待对象；test-developer 在测试验收记录维护当前已完成请求和响应证据。不要为每条消息另建一套队列或工作流。

## 每组 Red / Green / Refactor

1. developer 完成上一组 Green 和整理后，记录结果，停止写入并请求下一组。第一组无需历史 Green。
2. test-developer 确认 developer 已停止，pause 登记，再 open-group；它按业务场景列表挑选下一小组，补登记后写测试。
3. 运行本组并说明真实结果：预期行为缺失的 Red、现有行为满足、测试错误或环境阻塞。测试错误先修正；环境阻塞不得交接为 Red。
4. 对本组全部测试、预期数据、快照、辅助文件及相关判定配置核对实际 diff。每个新增/变更文件进入 handoff_paths；保护范围只追加不缩减。执行 seal-group，缺路径登记必须失败。
5. 在同一轮中 activate 后返回版本与证据。developer 收到并核对 status/路径/hash 后，才能实现、运行及整理；任何后续代码改动都需要重跑受影响组。
6. 场景全部完成后返回 all-groups-done，developer 仍必须执行最终完整回归，不因每组曾经通过就结束。

脚本检查显式 handoff_paths 是否被保护，**不能自动推断测试作者漏报的文件**。测试作者必须对照实际新增/修改清单，最终检查再次复核。若漏报的是独立新目录，Hook 无从知道其业务用途；发现后停止、补登记并检查期间改动。

## 测试争议

developer 先用 [问题模板](../templates/test-issue.md) 落盘，写明需求、测试要求、最小反例、实测证据和建议。不要在消息里要求对方照做某个预期值。

| 裁决 | 后续 |
| --- | --- |
| 测试正确 | 说明业务依据，developer 修正实现 |
| 测试错误或遗漏 | test-developer pause/open-group，修订、运行、登记后返回新版本 |
| 信息不足 | 本轮返回 need-info，developer 补证据后再请求 |
| 需求不明确 | 暂停受影响部分，升级 Main 请用户明确 |

developer 不修改问题对应的裁决文件。test-developer 不覆盖问题原文或历史裁决；新增决定带版本和依据。没有新证据却反复争议、通信失败、越界或新增授权需要都升级 Main，不无限循环。

## 状态与取消

业务状态保持最少：准备 → 本组测试 → 本组实现与回归 → 下一组 → 最终验收；任一阶段可进入 blocked 或 cancelled。登记 phase 只是编辑门禁，不代替业务验收结果。

- 发起方等待响应时不继续修改实现；测试作者返回前不请求对方做一个还需等待自己的动作。
- Main 重建角色时先暂停双方，更新绑定和身份表，执行 resume-check，再继续。
- 用户取消优先于待处理消息；Main 通知双方停止并 close 登记。角色退出后不得自动重新唤醒。迟到消息只记录，不推进。
- 共享文件归属不清时先指定唯一作者。正常情况下两份验收文档与问题/裁决分开，避免轮流覆盖同一文件。
