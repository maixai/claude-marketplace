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

/**
 * 构建期取插件目录的最后提交时间；容器可接收宿主生成的同一份数据。
 * @param {string} root
 * @param {string | undefined} supplied
 * @returns {Record<string, string | null>}
 */
export function getPluginUpdateTimes(root = REPO_ROOT, supplied = process.env.MARKETPLACE_PLUGIN_UPDATED_AT) {
  const plugins = readPlugins(root)
  if (supplied) {
    const values = JSON.parse(supplied)
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      throw new Error('MARKETPLACE_PLUGIN_UPDATED_AT must be a JSON object')
    }
    return Object.fromEntries(plugins.map(({ name }) => {
      if (!Object.hasOwn(values, name)) throw new Error(`Missing update metadata for ${name}`)
      const value = values[name]
      if (value !== null && (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)) {
        throw new Error(`Invalid canonical UTC timestamp for ${name}`)
      }
      return [name, value]
    }))
  }

  // 不从父仓库取时间，也不将浅克隆的边界提交误认为插件更新。
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
    return Object.fromEntries(plugins.map(({ name }) => [name, null]))
  }

  return Object.fromEntries(plugins.map(({ name, path }) => {
    // 未提交的新插件没有历史记录，返回 null，而非文件 mtime 或构建时间。
    const timestamp = git(root, ['log', '-1', '--format=%cI', '--', path || '.'])
    return [name, timestamp ? new Date(timestamp).toISOString() : null]
  }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(getPluginUpdateTimes())}\n`)
  } catch (error) {
    console.error(`[catalog] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
