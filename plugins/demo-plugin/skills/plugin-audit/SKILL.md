---
name: plugin-audit
description: 检查插件目录、清单和市场条目，列出打包问题与修复建议。
---

# Plugin Audit

按以下顺序检查目标插件目录，并输出结论。

## 1. 目录结构

- 插件根部是否存在 `.claude-plugin/plugin.json`
- 组件是否放在插件根部：`skills/`、`commands/`、`agents/`、`hooks/hooks.json`、`.mcp.json`
- 是否误把组件放进了 `.claude-plugin/`

## 2. 清单一致性

- `plugin.json` 的 `name` 是否与 marketplace 条目一致
- `marketplace.json` 中的 `source` 是否为以 `./` 开头的相对路径
- 条目是否存在重名

## 3. 组件合法性

- 每个 `skills/<name>/SKILL.md` 是否有 `name` 与 `description` frontmatter
- `agents/*.md` 是否有合法的 `name`、`description`、`model`
- `hooks/hooks.json` 是否为合法 JSON
- `.mcp.json` 的 `mcpServers` 是否为对象

## 4. 输出

按 `Critical` / `Major` / `Minor` 分级列出问题，并给出文件路径与修复建议。没有问题时明确说明「未发现问题」。
