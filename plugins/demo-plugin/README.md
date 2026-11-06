# Demo Plugin

一个用于演示的最小插件，包含：

- 一个 Skill：`plugin-audit`
- 一个 SubAgent：`plugin-reviewer`

## 安装

```bash
claude plugin marketplace add maixai/claude-marketplace
claude plugin install demo-plugin@maixai-marketplace
```

## 使用

- 在会话中输入 `/demo-plugin:plugin-audit`，按提示审计一个插件目录。
- 让 Claude 在需要独立复核插件结构时调用 `plugin-reviewer` 子代理。

## 目录结构

```text
demo-plugin/
├── .claude-plugin/plugin.json
├── skills/plugin-audit/SKILL.md
├── agents/plugin-reviewer.md
└── README.md
```
