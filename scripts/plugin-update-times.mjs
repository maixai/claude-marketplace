import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function git(root, args) {
  return execFileSync('git', ['--literal-pathspecs', '-C', root, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10000,
  }).trim()
}

function readPlugins(root) {
  const manifest = JSON.parse(readFileSync(join(root, '.claude-plugin/marketplace.json'), 'utf8'))
  if (!Array.isArray(manifest.plugins)) throw new Error('marketplace.json: plugins must be an array')
  return manifest.plugins.map((plugin) => {
    if (!plugin || typeof plugin.name !== 'string' || typeof plugin.source !== 'string' || !plugin.source.startsWith('./')) {
      throw new Error('Update metadata requires named plugins with local source paths')
    }
    const path = relative(root, resolve(root, plugin.source))
    if (path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) {
      throw new Error(`Plugin source escapes the repository: ${plugin.name}`)
    }
    return { name: plugin.name, path }
  })
}

function isCanonicalTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}

function parseMetadata(name, value) {
  // Retain compatibility with timestamp-only build arguments without inventing a reason for null.
  if (value === null) return { updatedAt: null, status: 'unavailable' }
  if (typeof value === 'string') {
    if (!isCanonicalTimestamp(value)) throw new Error(`Invalid canonical UTC timestamp for ${name}`)
    return { updatedAt: value, status: 'committed' }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid update metadata for ${name}`)
  }
  if (value.status === 'committed' && isCanonicalTimestamp(value.updatedAt)) {
    return { updatedAt: value.updatedAt, status: value.status }
  }
  if ((value.status === 'uncommitted' || value.status === 'unavailable') && value.updatedAt === null) {
    return { updatedAt: null, status: value.status }
  }
  throw new Error(`Invalid update status or timestamp for ${name}`)
}

/** Read directory commit times and preserve why a timestamp is absent across builds. */
export function getPluginUpdateMetadata(root = REPO_ROOT, supplied = process.env.MARKETPLACE_PLUGIN_UPDATED_AT) {
  const plugins = readPlugins(root)
  if (supplied) {
    const values = JSON.parse(supplied)
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      throw new Error('MARKETPLACE_PLUGIN_UPDATED_AT must be a JSON object')
    }
    return Object.fromEntries(plugins.map(({ name }) => {
      if (!Object.hasOwn(values, name)) throw new Error(`Missing update metadata for ${name}`)
      return [name, parseMetadata(name, values[name])]
    }))
  }

  // Never use a parent repository or mistake a shallow boundary for the last update.
  try {
    if (resolve(git(root, ['rev-parse', '--show-toplevel'])) !== resolve(root)) {
      throw new Error('Plugin repository has no independent Git history')
    }
    if (git(root, ['rev-parse', '--is-shallow-repository']) === 'true') {
      throw new Error('Complete Git history is required; use fetch-depth: 0')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[catalog] Update dates unavailable: ${message}`)
    return Object.fromEntries(plugins.map(({ name }) => [name, { updatedAt: null, status: 'unavailable' }]))
  }

  return Object.fromEntries(plugins.map(({ name, path }) => {
    const timestamp = git(root, ['log', '-1', '--format=%cI', '--', path || '.'])
    return [name, timestamp
      ? { updatedAt: new Date(timestamp).toISOString(), status: 'committed' }
      : { updatedAt: null, status: 'uncommitted' }]
  }))
}

/** Preserve the existing timestamp-only API for consumers that do not display status. */
export function getPluginUpdateTimes(root = REPO_ROOT, supplied = process.env.MARKETPLACE_PLUGIN_UPDATED_AT) {
  return Object.fromEntries(Object.entries(getPluginUpdateMetadata(root, supplied)).map(([name, value]) => [name, value.updatedAt]))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const metadata = getPluginUpdateMetadata()
    if (process.argv.includes('--require-committed') || process.argv.includes('--require-known')) {
      const missing = Object.entries(metadata).filter(([, value]) => process.argv.includes('--require-committed')
        ? value.status !== 'committed'
        : value.status === 'unavailable')
      if (missing.length) throw new Error(`Required Git update metadata is missing: ${missing.map(([name, value]) => `${name} (${value.status})`).join(', ')}`)
    }
    const output = process.argv.includes('--metadata')
      ? metadata
      : Object.fromEntries(Object.entries(metadata).map(([name, value]) => [name, value.updatedAt]))
    process.stdout.write(`${JSON.stringify(output)}\n`)
  } catch (error) {
    console.error(`[catalog] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
