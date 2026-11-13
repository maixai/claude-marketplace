import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { getPluginUpdateMetadata, getPluginUpdateTimes } from './plugin-update-times.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TIMESTAMP = '2026-11-06T05:28:03.000Z'

function fixture(callback, source = './plugins/example') {
  const root = mkdtempSync(join(tmpdir(), 'marketplace-dates-'))
  mkdirSync(join(root, '.claude-plugin'))
  writeFileSync(join(root, '.claude-plugin/marketplace.json'), JSON.stringify({
    plugins: [{ name: 'example', source }],
  }))
  try {
    callback(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('uses the plugin directory commit, not the repository HEAD or build clock', () => {
  const plugins = JSON.parse(readFileSync(join(ROOT, '.claude-plugin/marketplace.json'), 'utf8')).plugins
  const times = getPluginUpdateTimes(ROOT, '')
  for (const plugin of plugins) {
    const expected = execFileSync('git', ['-C', ROOT, 'log', '-1', '--format=%cI', '--', plugin.source], { encoding: 'utf8' }).trim()
    assert.equal(times[plugin.name], expected ? new Date(expected).toISOString() : null)
  }
})

test('accepts host-generated timestamps in a Git-free Docker build', () => {
  fixture((root) => {
    assert.deepEqual(getPluginUpdateTimes(root, JSON.stringify({ example: TIMESTAMP })), { example: TIMESTAMP })
  })
})

test('round-trips local Git timestamps through build metadata unchanged', () => {
  const local = getPluginUpdateTimes(ROOT, '')
  assert.deepEqual(getPluginUpdateTimes(ROOT, JSON.stringify(local)), local)
})

test('keeps an explicitly unknown date unknown', () => {
  fixture((root) => assert.deepEqual(getPluginUpdateTimes(root, '{"example":null}'), { example: null }))
})

test('does not manufacture dates when Git history is unavailable', () => {
  fixture((root) => assert.deepEqual(getPluginUpdateTimes(root, ''), { example: null }))
})

test('rejects missing, malformed, impossible or noncanonical supplied dates', () => {
  fixture((root) => {
    for (const supplied of ['{}', '[]', 'null', '{', '{"example":123}', '{"example":"invalid"}', '{"example":"2026-02-30T00:00:00.000Z"}', '{"example":"2026-11-06"}']) {
      assert.throws(() => getPluginUpdateTimes(root, supplied))
    }
  })
})

test('rejects a plugin path outside the repository', () => {
  fixture((root) => assert.throws(() => getPluginUpdateTimes(root, '{"example":null}'), /escapes/), './../outside')
})

test('preserves committed and uncommitted metadata in a Git-free build', () => {
  fixture((root) => {
    for (const metadata of [
      { updatedAt: TIMESTAMP, status: 'committed' },
      { updatedAt: null, status: 'uncommitted' },
      { updatedAt: null, status: 'unavailable' },
    ]) {
      const supplied = JSON.stringify({ example: metadata })
      assert.deepEqual(getPluginUpdateMetadata(root, supplied), { example: metadata })
      assert.deepEqual(getPluginUpdateTimes(root, supplied), { example: metadata.updatedAt })
    }
  })
})

test('does not label missing Git metadata as an uncommitted plugin', () => {
  fixture((root) => {
    assert.deepEqual(getPluginUpdateMetadata(root, ''), { example: { updatedAt: null, status: 'unavailable' } })
    assert.deepEqual(getPluginUpdateMetadata(root, '{"example":null}'), { example: { updatedAt: null, status: 'unavailable' } })
  })
})

test('rejects inconsistent status and timestamp pairs', () => {
  fixture((root) => {
    for (const metadata of [
      { updatedAt: null, status: 'committed' },
      { updatedAt: TIMESTAMP, status: 'uncommitted' },
      { updatedAt: TIMESTAMP, status: 'unavailable' },
      { updatedAt: null, status: 'invalid' },
      { updatedAt: '2026-02-30T00:00:00.000Z', status: 'committed' },
      {}, [],
    ]) {
      assert.throws(() => getPluginUpdateMetadata(root, JSON.stringify({ example: metadata })), /Invalid update/)
    }
  })
})

test('distinguishes new directories from committed files without using mtimes or HEAD time', () => {
  fixture((root) => {
    const runGit = (args, env = {}) => execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    runGit(['init', '--quiet'])
    runGit(['config', 'user.name', 'Fixture'])
    runGit(['config', 'user.email', 'fixture@example.invalid'])
    writeFileSync(join(root, 'unrelated.txt'), 'Initial commit\n')
    runGit(['add', '.'])
    runGit(['commit', '--quiet', '-m', 'Initialize fixture'], {
      GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-02T00:00:00Z',
    })
    mkdirSync(join(root, 'plugins/example'), { recursive: true })
    writeFileSync(join(root, 'plugins/example/README.md'), '# Example\n')
    assert.deepEqual(getPluginUpdateMetadata(root, ''), { example: { updatedAt: null, status: 'uncommitted' } })
    runGit(['add', 'plugins/example'])
    runGit(['commit', '--quiet', '-m', 'Add plugin'], {
      GIT_AUTHOR_DATE: '2026-01-03T00:00:00Z', GIT_COMMITTER_DATE: TIMESTAMP,
    })
    writeFileSync(join(root, 'unrelated.txt'), 'New repository HEAD\n')
    runGit(['add', 'unrelated.txt'])
    runGit(['commit', '--quiet', '-m', 'Update unrelated file'], {
      GIT_AUTHOR_DATE: '2026-11-07T00:00:00Z', GIT_COMMITTER_DATE: '2026-11-08T00:00:00Z',
    })
    writeFileSync(join(root, 'plugins/example/README.md'), '# Uncommitted modification\n')
    const metadata = getPluginUpdateMetadata(root, '')
    assert.deepEqual(metadata, { example: { updatedAt: TIMESTAMP, status: 'committed' } })
    assert.deepEqual(getPluginUpdateMetadata(root, JSON.stringify(metadata)), metadata)
  })
})

test('CLI rejects unknown image metadata and requires committed dates for publishing', () => {
  fixture((root) => {
    mkdirSync(join(root, 'scripts'))
    const script = join(root, 'scripts/plugin-update-times.mjs')
    writeFileSync(script, readFileSync(join(ROOT, 'scripts/plugin-update-times.mjs')))
    const invoke = (metadata, mode) => spawnSync(process.execPath, [script, '--metadata', mode], {
      encoding: 'utf8', env: { ...process.env, MARKETPLACE_PLUGIN_UPDATED_AT: JSON.stringify({ example: metadata }) },
    })
    const unknown = invoke(null, '--require-known')
    assert.equal(unknown.status, 1)
    assert.match(unknown.stderr, /Required Git update metadata is missing/)
    const uncommitted = { updatedAt: null, status: 'uncommitted' }
    assert.equal(invoke(uncommitted, '--require-known').status, 0)
    assert.equal(invoke(uncommitted, '--require-committed').status, 1)
    assert.equal(invoke({ updatedAt: TIMESTAMP, status: 'committed' }, '--require-committed').status, 0)
  })
})

test('does not report the shallow checkout boundary as a plugin update', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'marketplace-shallow-'))
  const shallow = join(temporary, 'repo')
  try {
    execFileSync('git', ['clone', '--quiet', '--depth=1', pathToFileURL(ROOT).href, shallow], { stdio: 'pipe' })
    const times = getPluginUpdateTimes(shallow, '')
    assert.ok(Object.keys(times).length > 0)
    assert.ok(Object.values(times).every((value) => value === null))
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})
