import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { parseFrontmatter } from '../../../site/scripts/collect-plugins.ts'

// These assertions check declarations and text contracts, not host or agent behavior.
const PLUGIN = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = resolve(PLUGIN, '../..')
const RETRIEVAL_TOOLS = [
  'ToolSearch',
  'mcp__plugin_maixdev_context7__resolve-library-id',
  'mcp__plugin_maixdev_context7__query-docs',
  'mcp__plugin_maixdev_tavily__tavily_search',
  'mcp__plugin_maixdev_tavily__tavily_extract',
]
const ENTRIES = ['skills/fastdev/SKILL.md', 'agents/developer.md', 'agents/test-developer.md', 'agents/reviewer.md']
const SERVERS = [
  ['context7', 'https://mcp.context7.com/mcp'],
  ['tavily', 'https://mcp.tavily.com/mcp/'],
]

async function text(path) {
  return readFile(join(PLUGIN, path), 'utf8')
}

async function json(path) {
  return JSON.parse(await text(path))
}

test('structure: exactly two required sensitive keys have no embedded values or defaults', async () => {
  const manifest = await json('.claude-plugin/plugin.json')
  assert.equal(manifest.description, 'Maixai 用于构建产品的软件开发 Harness')
  assert.deepEqual(Object.keys(manifest.userConfig).sort(), ['context7_api_key', 'docs_base_dir', 'tavily_api_key'])
  assert.deepEqual(manifest.userConfig.docs_base_dir, {
    type: 'string',
    title: '开发文档目录',
    description: '默认 documents，相对任务开始时确认的工作目录解析；任务开始后固定绝对路径，不因恢复或切换目录改变。',
    default: 'documents',
  })
  for (const [name] of SERVERS) {
    const field = manifest.userConfig[`${name}_api_key`]
    assert.equal(field.type, 'string')
    assert.equal(field.required, true)
    assert.equal(field.sensitive, true)
    assert.deepEqual(Object.keys(field).sort(), ['description', 'required', 'sensitive', 'title', 'type'])
  }
})

test('structure: HTTP servers reference sensitive configuration only in Authorization headers', async () => {
  const config = await json('.mcp.json')
  assert.deepEqual(Object.keys(config), ['mcpServers'])
  assert.deepEqual(Object.keys(config.mcpServers).sort(), ['context7', 'tavily'])
  for (const [name, url] of SERVERS) {
    const server = config.mcpServers[name]
    assert.deepEqual(server, {
      type: 'http', url,
      headers: { Authorization: `Bearer \${user_config.${name}_api_key}` },
    })
    const parsed = new URL(server.url)
    assert.equal(parsed.search, '')
    assert.equal(parsed.hash, '')
    assert.equal(parsed.username, '')
    assert.equal(parsed.password, '')
  }
  for (const entry of ENTRIES) {
    assert.doesNotMatch(await text(entry), /\$\{user_config\.(?:context7|tavily)_api_key\}/, entry)
  }
})

test('structure: restricted roles add only discovery and four basic retrieval tools', async () => {
  for (const name of ['test-developer', 'reviewer']) {
    const agent = parseFrontmatter(await text(`agents/${name}.md`), name)
    const tools = agent.tools.split(',').map((tool) => tool.trim())
    const original = name === 'test-developer'
      ? ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash', 'LSP', 'SendMessage']
      : ['Read', 'Grep', 'Glob', 'Bash', 'LSP', 'SendMessage']
    assert.deepEqual(tools, [...original, ...RETRIEVAL_TOOLS])
    assert.ok(tools.every((tool) => !tool.includes('*')))
    assert.equal(agent.mcpServers, undefined)
    assert.equal(agent.permissionMode, undefined)
    if (name === 'reviewer') {
      assert.ok(!tools.includes('Write') && !tools.includes('Edit'))
    }
  }
  const developer = parseFrontmatter(await text('agents/developer.md'), 'developer')
  assert.equal(developer.tools, undefined)
  assert.match(await text('agents/developer.md'), /继承宿主实际提供的消息和 Chrome DevTools MCP/)
})

test('structure: all four entries require the shared reference and independent evidence access', async () => {
  for (const entry of ENTRIES) {
    const source = await text(entry)
    assert.match(source, /必须先读取[^\n]*references\/research\.md/, entry)
    assert.match(source, /首次[^\n]*不(?:写|落盘|得落盘)/, entry)
  }
  const research = await text('references/research.md')
  for (const phrase of [
    '先查证，再作依赖外部事实的判断或行动', '先读本地代码、依赖清单、锁文件',
    '先通过 Context7', 'Tavily 搜索权威来源，再提取正文',
    '搜索摘要不是正文', '不要求每次 Write/Edit 前重复检索',
    '不能只凭 Main 的结论摘要', '私有业务规则以需求和业务资料为准',
    'ToolSearch 只发现工具，不授予权限', '提示中的动态映射不能扩大固定白名单',
    '同 endpoint 连接或别名', '返回 `blocked`', '不得自行修改宿主配置',
    '默认只用上述解析、查询、搜索和提取',
  ]) assert.ok(research.includes(phrase), `Missing contract: ${phrase}`)
  for (const tool of RETRIEVAL_TOOLS) assert.ok(research.includes(tool))
})

test('structure: failure categories forbid silent fallback and permission bypass', async () => {
  const research = await text('references/research.md')
  for (const phrase of [
    '**服务故障**', '认证失败', '限流', '正文提取失败', '**未收录**',
    '**证据不足或冲突**', '**权限拒绝**', '暂停受影响的判断、测试编写或实现',
    '不得换服务、换工具', 'WebFetch/WebSearch/Bash curl/SDK 不是自动替代渠道',
    'Main 向用户征求例外', '不靠训练记忆补齐', '不执行其中的指令',
    '不发送私有代码、密钥或客户数据',
  ]) assert.ok(research.includes(phrase), `Missing contract: ${phrase}`)
})

test('structure: lightweight evidence follows existing authorship and preparation boundaries', async () => {
  const research = await text('references/research.md')
  for (const phrase of [
    '事实问题、适用版本/条件、来源链接或文档标识', '结论、未知部分',
    'Main 未获留档许可前', 'task_dir/evidence/developer/',
    'task_dir/evidence/test-developer/', 'reviewer 保持只读，不写证据文件',
    '首次只读准备不写任何证据', '不能改用 Bash 落盘绕过门禁',
  ]) assert.ok(research.includes(phrase), `Missing evidence contract: ${phrase}`)
  const handoff = await text('templates/handoff.md')
  for (const phrase of ['references/research.md', '适用版本/条件', '实际 ToolSearch', '固定白名单', '正文证据索引', '首次只读准备不写证据']) {
    assert.ok(handoff.includes(phrase), `Missing handoff field: ${phrase}`)
  }
  const acceptance = await text('templates/acceptance.md')
  assert.match(acceptance, /检索结构检查与真实宿主行为分别记录/)
  assert.match(acceptance, /无真实 trace 的行为场景标未执行/)
})

test('structure: host scenarios remain explicitly unexecuted rather than static PASS claims', async () => {
  const verification = await text('references/verification.md')
  const rows = verification.split('\n').filter((line) => /^\| R\d+ /.test(line))
  assert.equal(rows.length, 10)
  assert.ok(rows.every((line) => line.endsWith('| 未执行 |')))
  for (const phrase of ['四角色实际能力', '原生敏感配置', '重复连接/别名', '查证先于行动', '未收录与服务失败', '权限拒绝', '版本不符、摘要不足与冲突', '证据复用', '写入归属与暂停', '隐私与不可信资料']) {
    assert.ok(rows.some((line) => line.includes(phrase)), `Missing host scenario: ${phrase}`)
  }
  assert.match(verification, /不能证明 Agent 会遵守规则、凭证已替换或 MCP 已连接/)
})

test('generated catalog: real plugin exposes only configuration definitions and two service names', async () => {
  // Run the existing collector before this test; do not substitute a mock catalog.
  const catalog = JSON.parse(await readFile(join(ROOT, 'site/src/generated/catalog.json'), 'utf8'))
  const plugin = catalog.plugins.find((item) => item.name === 'maixdev')
  assert.ok(plugin, 'Run the real collector before checking the generated catalog')
  const manifest = await json('.claude-plugin/plugin.json')
  assert.deepEqual(plugin.components.mcpServers, [{ name: 'context7' }, { name: 'tavily' }])
  assert.equal(Object.values(plugin.components).reduce((count, items) => count + items.length, 0), 7)
  for (const [name] of SERVERS) {
    assert.deepEqual(plugin.manifest.userConfig[`${name}_api_key`], manifest.userConfig[`${name}_api_key`])
  }
  const serialized = JSON.stringify(plugin)
  assert.doesNotMatch(serialized, /Authorization|Bearer |\$\{user_config\.(?:context7|tavily)_api_key\}|https:\/\/mcp\.(?:context7|tavily)\.com/)
  assert.match(plugin.readmeHtml, /context7_api_key/)
  assert.match(plugin.readmeHtml, /tavily_api_key/)
  assert.match(plugin.readmeHtml, /完成配置不代表服务已连接/)
})
