import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import MarkdownIt from 'markdown-it'
import { parseDocument } from 'yaml'

// ─── Paths ──────────────────────────────────────────────────────────────

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const SITE_DIR = resolve(SCRIPT_DIR, '..')
const REPO_ROOT = resolve(SITE_DIR, '..')
const MARKETPLACE_PATH = join(REPO_ROOT, '.claude-plugin', 'marketplace.json')
const OUTPUT_PATH = join(SITE_DIR, 'src', 'generated', 'catalog.json')

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

const markdown = new MarkdownIt({ html: false, linkify: true, breaks: false })

// ─── Types ──────────────────────────────────────────────────────────────

interface Owner {
  name: string
  email?: string
  url?: string
}

interface UserConfigField {
  type?: string
  title?: string
  description?: string
  required?: boolean
  sensitive?: boolean
}

interface PluginManifest {
  name?: string
  displayName?: string
  description?: string
  version?: string
  author?: Record<string, string>
  homepage?: string
  repository?: string
  license?: string
  keywords?: string[]
  userConfig?: Record<string, UserConfigField>
}

interface ComponentMeta {
  name: string
  description?: string
  events?: string[]
  model?: string
  effort?: string
}

interface DescribedComponentMeta extends ComponentMeta {
  description: string
}

interface Components {
  skills: DescribedComponentMeta[]
  commands: DescribedComponentMeta[]
  agents: DescribedComponentMeta[]
  hooks: ComponentMeta[]
  mcpServers: ComponentMeta[]
  lspServers: ComponentMeta[]
}

interface InstallStep {
  title: string
  command: string
}

interface CatalogPlugin {
  updatedAt: string | null
  name: string
  source: string
  description?: string
  displayName?: string
  version?: string
  category?: string
  tags?: string[]
  manifest: PluginManifest | null
  readmeHtml: string
  components: Components
  installation: InstallStep[]
}

interface Catalog {
  name: string
  description: string
  owner: Owner | null
  plugins: CatalogPlugin[]
}

// ─── Guards ─────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object`)
  return value
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === 'string')
}

function assertName(name: string, label: string): void {
  if (!NAME_PATTERN.test(name)) {
    throw new Error(`${label} "${name}" is not a valid marketplace identifier`)
  }
}

// ─── IO ─────────────────────────────────────────────────────────────────

async function readJson(path: string): Promise<unknown> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    throw new Error(`Cannot read ${relative(REPO_ROOT, path)}`)
  }
  try {
    return JSON.parse(raw) as unknown
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid JSON in ${relative(REPO_ROOT, path)}: ${reason}`)
  }
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

async function readDirectory(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true })
    return entries.map((entry) => entry.name).sort()
  } catch {
    return []
  }
}

// ─── Frontmatter ────────────────────────────────────────────────────────

export function parseFrontmatter(content: string, label: string): Record<string, unknown> {
  const normalized = content.replace(/\r\n/g, '\n')
  if (!/^---[ \t]*\n/.test(normalized)) return {}
  const lines = normalized.split('\n')
  const end = lines.findIndex((line, index) => index > 0 && /^---[ \t]*$/.test(line))
  if (end < 0) throw new Error(`Unclosed YAML frontmatter in ${label}`)
  const document = parseDocument(lines.slice(1, end).join('\n'))
  if (document.errors.length > 0) {
    throw new Error(`Invalid YAML frontmatter in ${label}: ${document.errors.map((error) => error.message).join('; ')}`)
  }
  const data: unknown = document.toJS()
  return data === null ? {} : requireRecord(data, `Frontmatter in ${label}`)
}

// ─── Component inventory ────────────────────────────────────────────────

function describedComponent(content: string, path: string, fallbackName: string, errors: string[], useDeclaredName = false): DescribedComponentMeta {
  const label = relative(REPO_ROOT, path)
  const data = parseFrontmatter(content, label)
  const description = optionalString(data.description)?.trim() ?? ''
  if (!description) {
    errors.push(`${label}: missing non-empty description; add a description to the component's YAML frontmatter`)
  }
  const model = optionalString(data.model)?.trim()
  const effort = optionalString(data.effort)?.trim()
  return {
    name: useDeclaredName ? optionalString(data.name)?.trim() || fallbackName : fallbackName,
    description,
    ...(model ? { model } : {}),
    ...(effort ? { effort } : {}),
  }
}

async function collectSkills(pluginRoot: string, pluginName: string, errors: string[]): Promise<DescribedComponentMeta[]> {
  const skillsDir = join(pluginRoot, 'skills')
  const skills: DescribedComponentMeta[] = []
  if (await isDirectory(skillsDir)) {
    for (const entry of await readDirectory(skillsDir)) {
      const path = join(skillsDir, entry, 'SKILL.md')
      const content = await readText(path)
      if (content !== null) skills.push(describedComponent(content, path, entry, errors, true))
    }
    return skills
  }
  // 保留根目录单技能插件的既有支持。
  const path = join(pluginRoot, 'SKILL.md')
  const content = await readText(path)
  if (content !== null) skills.push(describedComponent(content, path, pluginName, errors, true))
  return skills
}

async function collectMarkdownComponents(dir: string, recursive: boolean, errors: string[]): Promise<DescribedComponentMeta[]> {
  if (!(await isDirectory(dir))) return []
  const components: DescribedComponentMeta[] = []
  for (const entry of await readDirectory(dir)) {
    const path = join(dir, entry)
    if (await isDirectory(path)) {
      if (recursive) {
        const nested = await collectMarkdownComponents(path, true, errors)
        components.push(...nested.map((component) => ({ ...component, name: `${entry}/${component.name}` })))
      }
    } else if (entry.endsWith('.md')) {
      components.push(describedComponent(await readFile(path, 'utf8'), path, entry.slice(0, -3), errors))
    }
  }
  return components
}

async function collectJsonComponents(path: string, key?: string): Promise<ComponentMeta[]> {
  if ((await readText(path)) === null) return []
  const data = requireRecord(await readJson(path), relative(REPO_ROOT, path))
  const entries = key === undefined ? data : requireRecord(data[key], `${relative(REPO_ROOT, path)}.${key}`)
  return Object.keys(entries).sort().map((name) => ({ name }))
}

async function collectHooks(pluginRoot: string): Promise<ComponentMeta[]> {
  const path = join(pluginRoot, 'hooks', 'hooks.json')
  if ((await readText(path)) === null) return []
  const data = requireRecord(await readJson(path), relative(REPO_ROOT, path))
  const events = Object.keys(requireRecord(data.hooks, `${relative(REPO_ROOT, path)}.hooks`)).sort()
  if (events.length === 0) return []
  const description = optionalString(data.description)?.trim()
  // 顶层说明属于整份 Hooks 配置，不复制成每个事件的独立业务说明。
  return [{ name: 'hooks/hooks.json', events, ...(description ? { description } : {}) }]
}

export async function collectComponents(pluginRoot: string, pluginName: string): Promise<Components> {
  const errors: string[] = []
  const components: Components = {
    skills: await collectSkills(pluginRoot, pluginName, errors),
    commands: await collectMarkdownComponents(join(pluginRoot, 'commands'), false, errors),
    agents: await collectMarkdownComponents(join(pluginRoot, 'agents'), true, errors),
    hooks: await collectHooks(pluginRoot),
    mcpServers: await collectJsonComponents(join(pluginRoot, '.mcp.json'), 'mcpServers'),
    lspServers: await collectJsonComponents(join(pluginRoot, '.lsp.json')),
  }
  if (errors.length > 0) throw new Error(`Component descriptions are required for plugin "${pluginName}":\n${errors.join('\n')}`)
  return components
}

export function createInstallation(pluginName: string, marketplaceName: string): InstallStep[] {
  assertName(pluginName, 'Plugin name')
  assertName(marketplaceName, 'Marketplace name')
  return [
    { title: '添加插件市场', command: 'claude plugin marketplace add maixai/claude-marketplace' },
    { title: '安装此插件', command: `claude plugin install ${pluginName}@${marketplaceName}` },
  ]
}

// ─── Manifest ───────────────────────────────────────────────────────────

function normalizeManifest(raw: unknown, label: string): PluginManifest {
  const data = requireRecord(raw, label)
  const manifest: PluginManifest = {}

  const name = optionalString(data.name)
  if (name !== undefined) manifest.name = name

  const displayName = optionalString(data.displayName)
  if (displayName !== undefined) manifest.displayName = displayName

  const description = optionalString(data.description)
  if (description !== undefined) manifest.description = description

  const version = optionalString(data.version)
  if (version !== undefined) manifest.version = version

  const homepage = optionalString(data.homepage)
  if (homepage !== undefined) manifest.homepage = homepage

  const repository = optionalString(data.repository)
  if (repository !== undefined) manifest.repository = repository

  const license = optionalString(data.license)
  if (license !== undefined) manifest.license = license

  const keywords = optionalStringArray(data.keywords)
  if (keywords !== undefined) manifest.keywords = keywords

  const authorValue = data.author
  if (isRecord(authorValue) && typeof authorValue.name === 'string') {
    manifest.author = Object.fromEntries(
      Object.entries(authorValue).filter(
        (pair): pair is [string, string] => typeof pair[1] === 'string',
      ),
    )
  }

  const userConfigValue = data.userConfig
  if (isRecord(userConfigValue)) {
    const userConfig: Record<string, UserConfigField> = {}
    for (const [key, field] of Object.entries(userConfigValue)) {
      if (!isRecord(field)) continue

      const item: UserConfigField = {}
      const type = optionalString(field.type)
      if (type !== undefined) item.type = type
      const title = optionalString(field.title)
      if (title !== undefined) item.title = title
      const fieldDescription = optionalString(field.description)
      if (fieldDescription !== undefined) item.description = fieldDescription
      if (typeof field.required === 'boolean') item.required = field.required
      if (typeof field.sensitive === 'boolean') item.sensitive = field.sensitive

      userConfig[key] = item
    }
    if (Object.keys(userConfig).length > 0) manifest.userConfig = userConfig
  }

  return manifest
}

// ─── Marketplace ────────────────────────────────────────────────────────

interface MarketplaceEntry {
  name: string
  source: string
  description?: string
  displayName?: string
  version?: string
  category?: string
  tags?: string[]
}

function parseEntry(raw: unknown, index: number): MarketplaceEntry {
  const data = requireRecord(raw, `plugins[${index}]`)
  const name = optionalString(data.name)
  const source = data.source

  if (name === undefined) throw new Error(`plugins[${index}].name is required`)
  assertName(name, `plugins[${index}].name`)

  if (typeof source !== 'string') {
    throw new Error(
      `plugins[${index}].source must be a local path string; remote sources are not supported yet`,
    )
  }
  if (!source.startsWith('./')) {
    throw new Error(`plugins[${index}].source must start with "./" (got "${source}")`)
  }

  const entry: MarketplaceEntry = { name, source }

  const description = optionalString(data.description)
  if (description !== undefined) entry.description = description
  const displayName = optionalString(data.displayName)
  if (displayName !== undefined) entry.displayName = displayName
  const version = optionalString(data.version)
  if (version !== undefined) entry.version = version
  const category = optionalString(data.category)
  if (category !== undefined) entry.category = category
  const tags = optionalStringArray(data.tags)
  if (tags !== undefined) entry.tags = tags

  return entry
}

function resolveLocalSource(name: string, source: string): string {
  const absolute = resolve(REPO_ROOT, source)
  const relativePath = relative(REPO_ROOT, absolute)
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`Plugin "${name}" source escapes the repository: ${source}`)
  }
  return absolute
}

async function collectPlugin(entry: MarketplaceEntry, updatedAt: string | null, marketplaceName: string): Promise<CatalogPlugin> {
  const pluginRoot = resolveLocalSource(entry.name, entry.source)

  if (!(await isDirectory(pluginRoot))) {
    throw new Error(`Plugin "${entry.name}" source directory does not exist: ${entry.source}`)
  }
  if (relative(REPO_ROOT, pluginRoot).split(sep).includes('.claude-plugin')) {
    throw new Error(`Plugin "${entry.name}" must not live inside .claude-plugin/`)
  }

  const manifestRaw = await readText(join(pluginRoot, '.claude-plugin', 'plugin.json'))
  const manifest =
    manifestRaw === null
      ? null
      : normalizeManifest(
          (() => {
            try {
              return JSON.parse(manifestRaw) as unknown
            } catch (error) {
              const reason = error instanceof Error ? error.message : String(error)
              throw new Error(`Invalid plugin.json for "${entry.name}": ${reason}`)
            }
          })(),
          `plugins[${entry.name}].plugin.json`,
        )

  if (manifest?.name !== undefined && manifest.name !== entry.name) {
    throw new Error(
      `Plugin name mismatch: marketplace entry "${entry.name}" vs plugin.json "${manifest.name}"`,
    )
  }

  const readme = await readText(join(pluginRoot, 'README.md'))

  return {
    ...entry,
    updatedAt,
    manifest,
    readmeHtml: readme === null ? '' : markdown.render(readme),
    components: await collectComponents(pluginRoot, entry.name),
    installation: createInstallation(entry.name, marketplaceName),
  }
}

async function main(): Promise<void> {
  const marketplaceRaw = requireRecord(await readJson(MARKETPLACE_PATH), 'marketplace.json')

  const name = optionalString(marketplaceRaw.name)
  if (name === undefined) throw new Error('marketplace.json: name is required')
  assertName(name, 'marketplace.json: name')

  const ownerRaw = marketplaceRaw.owner
  if (!isRecord(ownerRaw)) throw new Error('marketplace.json: owner is required')
  const ownerName = optionalString(ownerRaw.name)
  if (ownerName === undefined) throw new Error('marketplace.json: owner.name is required')

  const owner: Owner = { name: ownerName }
  const ownerEmail = optionalString(ownerRaw.email)
  if (ownerEmail !== undefined) owner.email = ownerEmail
  const ownerUrl = optionalString(ownerRaw.url)
  if (ownerUrl !== undefined) owner.url = ownerUrl

  const pluginsRaw = marketplaceRaw.plugins
  if (!Array.isArray(pluginsRaw)) throw new Error('marketplace.json: plugins must be an array')

  const entries = pluginsRaw.map((entry, index) => parseEntry(entry, index))
  const seen = new Set<string>()
  for (const entry of entries) {
    if (seen.has(entry.name)) throw new Error(`Duplicate plugin name: ${entry.name}`)
    seen.add(entry.name)
  }

  const updateTimes: unknown = JSON.parse(execFileSync(
    process.execPath,
    [join(REPO_ROOT, 'scripts', 'plugin-update-times.mjs')],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  ))
  const timestamps = requireRecord(updateTimes, 'plugin update metadata')
  const plugins: CatalogPlugin[] = []
  for (const entry of entries) {
    const updatedAt = timestamps[entry.name]
    if (updatedAt !== null && typeof updatedAt !== 'string') {
      throw new Error(`Missing update metadata for ${entry.name}`)
    }
    plugins.push(await collectPlugin(entry, updatedAt, name))
  }

  const catalog: Catalog = {
    name,
    description: optionalString(marketplaceRaw.description) ?? '',
    owner,
    plugins,
  }

  await writeOutput(catalog)
}

async function writeOutput(catalog: Catalog): Promise<void> {
  await mkdir(dirname(OUTPUT_PATH), { recursive: true })
  await writeFile(OUTPUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`)
  console.log(`[catalog] wrote ${catalog.plugins.length} plugin(s) to site/src/generated/catalog.json`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[catalog] error: ${message}`)
    process.exitCode = 1
  })
}
