import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { getPluginUpdateTimes } from './plugin-update-times.mjs'

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
