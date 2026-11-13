# maixai 市场契约

plugin-builder 定位仓库和设计整体交付时读取。以下是首版核对过的仓库契约，不是所有市场的通用 schema；新任务仍读取当前权威文件，发现变化不按旧快照覆盖。

## 定位与权威文件

通过用户路径或已确认工作区定位 `maixai/claude-marketplace`，核验 `.claude-plugin/marketplace.json`、仓库 `README.md`、`site/scripts/collect-plugins.ts` 与相关测试。找不到则问，不自动 clone，不依赖维护者本机绝对路径。

组件和网站事实分别看采集器、`site/scripts/collect-plugins.test.mjs`、`site/src/components/PluginCard.vue`、`site/src/views/PluginDetailPage.vue`、公共安装/组件/关键词组件。它们属于目标仓库，不是本插件安装包外的运行依赖；只在用户要维护该市场时按目标根读取。

## 登记、元数据与目录

- 市场清单决定收录，不扫描所有插件目录自动展示。
- 当前网站 source 必须是仓库内 `./` 开头的本地相对路径；不能套用官方市场其它远程 source 形式。
- 使用 `plugins/<name>/` 约定，组件目录直接位于插件根，不能放 `.claude-plugin/` 内；详情源码链接依赖该布局。
- 市场条目与 manifest 的 name 一致；提供非空 displayName。使用目标任务批准的技术标识，不擅自更名。
- 版本等同一事实优先由 manifest 维护，不在市场条目重复维护导致漂移。
- 关键词来自 `plugin.json.keywords`，市场 category/tags 不是同一字段。
- 读取当前 author/owner 约定，许可证只作用于获准范围，不能借新增插件改变根仓库授权。

## 采集覆盖

当前读取 Skills（`skills/<name>/SKILL.md`，或无 skills 目录时的根 SKILL.md）、Agents（agents 下递归 Markdown）、Commands（commands 下 Markdown）、`hooks/hooks.json`、`.mcp.json` 和 `.lsp.json`。

Skill/Agent/Command 的 YAML description 必须是非空字符串，这是网站质量约定，不能说成官方全都必填。Hook 以配置整体展示，可选顶层 description 与触发事件；MCP 读取 mcpServers 映射，LSP 读取根映射，不发明 description 字段。

不要假定 monitors、workflows、Theme、Output style、自定义组件路径或内联声明已支持。设计时逐项对照：目标元数据不足只改目标；采集能力缺失先提出最小采集/类型/模板/测试扩展，再批准。未获扩展许可时报告阻塞或明确接受的展示限制，不能静默漏项。

## README 与生成产物

README 只维护实际用法、示例与注意事项。公共模板负责安装步骤、完整组件介绍与关键词，不在 README 重复安装命令、完整组件清单或开发目录树。不为每个插件创建专属页面。

README 的相对链接、图片和标题锚点不保证自动按 GitHub 语义工作；使用可核实的绝对公开链接或避免资源依赖，并在真实页面验证。`docs_base_dir` 只管过程文档，不能重定向 README、源码或 `site/src/generated/catalog.json`。

catalog 是采集生成产物，不手改；单个插件错误可能让整个网站采集失败。不要把 CLI 市场容错规则套到网站采集器。

更新时间按插件 source 目录的 Git committer 时间，不用整个仓库 HEAD、mtime 或构建时间。未提交新增插件可能显示更新时间不可用；这不是伪造日期的理由。重命名影响详情按 name 查找，市场 renames 不保证旧网站路由兼容。

具体执行与证据见 [网站验收](website-validation.md) 和 [发布兼容性](release-and-compatibility.md)。
