---
max_turns: 16
timeout_seconds: 240
runs: 1
tags: [approval, explicit-path, positive]
allowed_tools: [Skill, Read, Grep, Glob, Write, Edit]
---
请使用 extension-builder 的 component-builder 继续一个很小的任务。以下是我现在明确确认并批准实施的完整方案，不依赖任何历史文件的 approved 状态：在当前工作目录下创建 result/echo/SKILL.md，仅此一个源码文件，不创建其它文件。当前工作目录就是本任务已确认的 workspace_anchor。result/echo 是完整 Skill 目录，不要再追加 .claude 或 skills。

该 Skill 仅在用户明确要求原样回显文本时使用，不调用外部工具。文件内容已确定为：

```markdown
---
name: echo
description: Echo user-provided text verbatim when explicitly requested.
---

# 原样回显

输入为空时，询问要回显的文本并等待。
原样返回用户文本，不调用外部工具。
```

我已确认需求、文件内容、路径和写入范围，现在批准创建此文件。请直接检查目标冲突并实施，不重复询问是否批准。若目标已存在且内容不符，停下报告，不覆盖。文档目录配置不影响这个源码位置。本任务不保存过程文档、不安装、不联网、不调用额外模型、不提交、不运行脚本，不要求添加角色或配套资源。最后只报告实际创建位置和完成的静态检查；宿主加载、真实行为和独立评审没有证据就明确写未验证或阻塞，不能称整体验收通过。
