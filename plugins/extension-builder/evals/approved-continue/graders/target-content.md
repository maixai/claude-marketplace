---
type: regex
pattern: '^---\r?\nname: echo\r?\ndescription: Echo user-provided text verbatim when explicitly requested\.\r?\n---\r?\n\r?\n# 原样回显\r?\n\r?\n输入为空时，询问要回显的文本并等待。\r?\n原样返回用户文本，不调用外部工具。\r?\n?$'
target:
  source: file
  path: result/echo/SKILL.md
---
