import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { collectComponents, createInstallation, parseFrontmatter } from './collect-plugins.ts'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(SCRIPT_DIR, '../..')

async function fixture(files, run) {
  const root = await mkdtemp(join(tmpdir(), 'marketplace-components-'))
  try {
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true })
      await writeFile(join(root, path), content)
    }
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('reads native descriptions from skills, nested agents and flat commands', async () => {
  await fixture({
    'skills/review/SKILL.md': '---\nname: review\ndescription: 审查代码。\n---\nInstructions',
    'agents/team/reviewer.md': '---\ndescription: 独立复核。\n---\nInstructions',
    'commands/check.md': '---\ndescription: "校验配置: 输出结果"\n---\nInstructions',
  }, async (root) => {
    const result = await collectComponents(root, 'example')
    assert.deepEqual(result.skills, [{ name: 'review', description: '审查代码。' }])
    assert.deepEqual(result.agents, [{ name: 'team/reviewer', description: '独立复核。' }])
    assert.deepEqual(result.commands, [{ name: 'check', description: '校验配置: 输出结果' }])
  })
})

test('supports YAML folded, literal, quoted descriptions and CRLF', () => {
  assert.equal(parseFrontmatter('---\ndescription: >-\n  First line\n  second line\n---\nBody', 'folded').description, 'First line second line')
  assert.equal(parseFrontmatter('---\r\ndescription: |-\r\n  First line\r\n  second line\r\n---\r\nBody', 'literal').description, 'First line\nsecond line')
  assert.equal(parseFrontmatter('---\ndescription: "Use: a # literal"\n---\nBody', 'quoted').description, 'Use: a # literal')
  assert.deepEqual(parseFrontmatter('---\n---\nBody', 'empty'), {})
})

test('reports every missing native description with a component file path', async () => {
  await fixture({
    'skills/missing/SKILL.md': '# No metadata',
    'agents/missing.md': '---\ndescription: "   "\n---\nBody',
    'commands/missing.md': '---\ndescription: 42\n---\nBody',
  }, async (root) => {
    await assert.rejects(() => collectComponents(root, 'example'), (error) => {
      assert.match(error.message, /skills\/missing\/SKILL\.md/)
      assert.match(error.message, /agents\/missing\.md/)
      assert.match(error.message, /commands\/missing\.md/)
      assert.equal((error.message.match(/missing non-empty description/g) ?? []).length, 3)
      return true
    })
  })
})

test('rejects null, empty block and boolean descriptions', async () => {
  for (const value of ['null', '|\n  ', 'false']) {
    await fixture({ 'skills/missing/SKILL.md': `---\ndescription: ${value}\n---\nBody` }, async (root) => {
      await assert.rejects(() => collectComponents(root, 'example'), /missing non-empty description/)
    })
  }
})

test('does not confuse malformed YAML or duplicate keys with valid descriptions', () => {
  assert.throws(() => parseFrontmatter('---\ndescription: [broken\n---\nBody', 'broken.md'), /Invalid YAML.*broken.md/)
  assert.throws(() => parseFrontmatter('---\ndescription: one\ndescription: two\n---\nBody', 'duplicate.md'), /Invalid YAML.*duplicate.md/)
  assert.throws(() => parseFrontmatter('---\ndescription: valid', 'unclosed.md'), /Unclosed.*unclosed.md/)
})

test('supports and validates root-level single-skill plugins', async () => {
  await fixture({ 'SKILL.md': '---\ndescription: Root skill.\n---\nBody' }, async (root) => {
    assert.deepEqual((await collectComponents(root, 'single')).skills, [{ name: 'single', description: 'Root skill.' }])
  })
  await fixture({ 'SKILL.md': '# Missing description' }, async (root) => {
    await assert.rejects(() => collectComponents(root, 'single'), /SKILL.md: missing non-empty description/)
  })
})

test('uses hook-file description as a group and does not require server descriptions', async () => {
  await fixture({
    'hooks/hooks.json': JSON.stringify({ description: '格式化与校验。', hooks: { PostToolUse: [], PreToolUse: [] } }),
    '.mcp.json': JSON.stringify({ mcpServers: { docs: { command: 'docs-server' } } }),
    '.lsp.json': JSON.stringify({ gopls: { command: 'gopls', extensionToLanguage: { '.go': 'go' } } }),
  }, async (root) => {
    const result = await collectComponents(root, 'example')
    assert.deepEqual(result.hooks, [{ name: 'hooks/hooks.json', description: '格式化与校验。', events: ['PostToolUse', 'PreToolUse'] }])
    assert.deepEqual(result.mcpServers, [{ name: 'docs' }])
    assert.deepEqual(result.lspServers, [{ name: 'gopls' }])
  })
})

test('allows hook configuration without a top-level description', async () => {
  await fixture({ 'hooks/hooks.json': '{"hooks":{"PostToolUse":[]}}' }, async (root) => {
    assert.deepEqual((await collectComponents(root, 'example')).hooks, [{ name: 'hooks/hooks.json', events: ['PostToolUse'] }])
  })
})

test('empty component inventory remains valid', async () => {
  await fixture({}, async (root) => {
    assert.deepEqual(await collectComponents(root, 'empty'), { skills: [], commands: [], agents: [], hooks: [], mcpServers: [], lspServers: [] })
  })
})

test('generates shared installation steps from plugin and marketplace identifiers', () => {
  assert.deepEqual(createInstallation('example', 'example-market'), [
    { title: '添加插件市场', command: 'claude plugin marketplace add maixai/claude-marketplace' },
    { title: '安装此插件', command: 'claude plugin install example@example-market' },
  ])
  assert.throws(() => createInstallation('invalid;name', 'example-market'), /valid marketplace identifier/)
})

async function prepareCliFixture(root) {
  await mkdir(join(root, 'site/scripts'), { recursive: true })
  await mkdir(join(root, 'scripts'), { recursive: true })
  await copyFile(join(SCRIPT_DIR, 'collect-plugins.ts'), join(root, 'site/scripts/collect-plugins.ts'))
  await copyFile(join(ROOT, 'scripts/plugin-update-times.mjs'), join(root, 'scripts/plugin-update-times.mjs'))
  await writeFile(join(root, 'site/package.json'), '{"type":"module"}')
  await symlink(join(ROOT, 'node_modules'), join(root, 'node_modules'), 'dir')
}

const marketplace = JSON.stringify({ name: 'fixture-market', owner: { name: 'Fixture' }, plugins: [{ name: 'example', source: './plugins/example' }] })

function runCollector(root) {
  return spawnSync(process.execPath, [join(root, 'site/scripts/collect-plugins.ts')], {
    encoding: 'utf8',
    env: { ...process.env, MARKETPLACE_PLUGIN_UPDATED_AT: '{"example":null}' },
  })
}

test('CLI fails before writing the catalog when a description is missing', async () => {
  await fixture({
    '.claude-plugin/marketplace.json': marketplace,
    'plugins/example/agents/reviewer.md': '# Missing description',
    'site/src/generated/catalog.json': 'sentinel',
  }, async (root) => {
    await prepareCliFixture(root)
    const result = runCollector(root)
    assert.equal(result.status, 1, result.stderr)
    assert.match(result.stderr, /agents\/reviewer.md: missing non-empty description/)
    assert.equal(await readFile(join(root, 'site/src/generated/catalog.json'), 'utf8'), 'sentinel')
  })
})

test('CLI generates component descriptions and installation without README duplication', async () => {
  await fixture({
    '.claude-plugin/marketplace.json': marketplace,
    'plugins/example/skills/run/SKILL.md': '---\ndescription: Execute the task.\n---\nInstructions',
    'plugins/example/README.md': '# Usage\n\nRun the skill.',
  }, async (root) => {
    await prepareCliFixture(root)
    const result = runCollector(root)
    assert.equal(result.status, 0, result.stderr)
    const catalog = JSON.parse(await readFile(join(root, 'site/src/generated/catalog.json'), 'utf8'))
    const plugin = catalog.plugins[0]
    assert.equal(plugin.components.skills[0].description, 'Execute the task.')
    assert.equal(plugin.installation[1].command, 'claude plugin install example@fixture-market')
    assert.match(plugin.readmeHtml, /Run the skill/)
    assert.doesNotMatch(plugin.readmeHtml, /claude plugin install/)
  })
})
