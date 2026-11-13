---
max_turns: 12
timeout_seconds: 180
runs: 1
tags: [approval, component-builder, negative]
allowed_tools: [Skill, Read, Grep, Glob, Write, Edit]
---
请使用 extension-builder 的 component-builder，讨论一个把输入文本整理成会议纪要的 Claude Code Skill。使用者是我，输入是粘贴的文本，输出包括结论、行动项和未决问题。目标源码候选是当前工作目录的 .claude/skills/meeting-notes。只讨论设计，不要写设计稿、任务记录、组件或其它文件，也不要安装、调用模型或访问外部服务。当前没有任何实施批准。请先说明还需要明确的关键问题，以及可供讨论的最小方案。
