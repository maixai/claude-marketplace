import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { collectComponents, parseFrontmatter } from '../../../site/scripts/collect-plugins.ts'

const PLUGIN = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = resolve(PLUGIN, '../..')

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

test('real maixdev entry includes one skill, three inherited agents, one hook group and two MCP servers', async () => {
  const marketplace = await json(join(ROOT, '.claude-plugin/marketplace.json'))
  const entries = marketplace.plugins.filter((entry) => entry.name === 'maixdev')
  assert.equal(entries.length, 1)
  assert.equal(entries[0].source, './plugins/maixdev')
  const components = await collectComponents(PLUGIN, 'maixdev')
  assert.deepEqual(components.skills.map((item) => item.name), ['fastdev'])
  assert.deepEqual(components.agents.map((item) => [item.name, item.model]), [
    ['developer', 'inherit'], ['reviewer', 'inherit'], ['test-developer', 'inherit'],
  ])
  assert.equal(components.hooks.length, 1)
  assert.deepEqual(components.hooks[0].events, ['PreToolUse', 'SubagentStart'])
  assert.ok(components.hooks[0].description)
  assert.deepEqual(components.commands, [])
  assert.deepEqual(components.mcpServers, [{ name: 'context7' }, { name: 'tavily' }])
  assert.equal(Object.values(components).reduce((count, items) => count + items.length, 0), 7)
})

test('native configuration and explicit main-session entry retain the approved defaults', async () => {
  const manifest = await json(join(PLUGIN, '.claude-plugin/plugin.json'))
  assert.equal(manifest.name, 'maixdev')
  assert.equal(manifest.displayName, 'MaixDev')
  assert.equal(manifest.userConfig.docs_base_dir.type, 'string')
  assert.equal(manifest.userConfig.docs_base_dir.default, 'documents')
  assert.match(manifest.userConfig.docs_base_dir.description, /documents/)
  const skill = parseFrontmatter(await readFile(join(PLUGIN, 'skills/fastdev/SKILL.md'), 'utf8'), 'fastdev')
  assert.equal(skill['disable-model-invocation'], true)
  assert.equal(skill.context, undefined)
  assert.equal(skill.model, undefined)
  for (const name of ['developer', 'test-developer', 'reviewer']) {
    const agent = parseFrontmatter(await readFile(join(PLUGIN, `agents/${name}.md`), 'utf8'), name)
    assert.equal(agent.effort, undefined)
    assert.equal(agent.hooks, undefined)
    assert.equal(agent.mcpServers, undefined)
    assert.equal(agent.permissionMode, undefined)
    if (name === 'developer') assert.equal(agent.tools, undefined)
    else assert.match(agent.tools, /SendMessage/)
  }
})

test('hook declaration explicitly requests failure blocking without claiming host execution', async () => {
  const config = await json(join(PLUGIN, 'hooks/hooks.json'))
  const pre = config.hooks.PreToolUse[0]
  assert.equal(pre.matcher, 'Write|Edit')
  assert.equal(pre.hooks[0].type, 'command')
  assert.equal(pre.hooks[0].onFailure, 'block')
  assert.equal(pre.hooks[0].timeout, 10)
  assert.equal(pre.hooks[0].command, 'python3 -I "${CLAUDE_PLUGIN_ROOT}/scripts/guard.py" hook')
  assert.equal(config.hooks.SubagentStart[0].hooks[0].command, 'python3 -I "${CLAUDE_PLUGIN_ROOT}/scripts/guard.py" observe')
})

test('local Markdown links point to real plugin resources', async () => {
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.name.endsWith('.md')) {
        const content = await readFile(path, 'utf8')
        for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
          const target = match[1]
          if (target.startsWith('https://') || target.startsWith('#')) continue
          assert.ok((await stat(resolve(dirname(path), target.split('#')[0]))).isFile(), `${path}: ${target}`)
        }
      }
    }
  }
  await walk(PLUGIN)
})
