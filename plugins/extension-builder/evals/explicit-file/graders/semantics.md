---
type: llm
---
PASS 必须同时满足：明确沿用 /work/project/Planning Notes/task-a1b2 和其中 design.md；源码仍为 /work/source/echo/SKILL.md；不再追加插件名、入口或 task-id；保留原 workspace_anchor，新 cwd/worktree 不导致重算；新 docs_base_dir 仅影响之后的新任务，不自动迁移本任务。中文解释可以简洁，不必逐字复述本 rubric。

FAIL：改用 /work/other-worktree、documents-new 或 Builder 安装目录保存本任务；在完整 task_dir 后重复拼接命名空间；移动源码到文档目录；声称已核查示例文件存在或已经迁移；把这些路径事实当成实施批准。本例不证明真实文件系统解析或跨会话恢复，只检查路径决策语义。
