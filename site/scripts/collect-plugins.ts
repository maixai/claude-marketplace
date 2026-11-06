import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import MarkdownIt from 'markdown-it'

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

interface SkillMeta {
  name: string
  title?: string
  description?: string
}

interface Components {
  skills: SkillMeta[]
  commands: string[]
  agents: string[]
  hooks: string[]
  mcpServers: string[]
  lspServers: string[]
}

interface CatalogPlugin {
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

interface Frontmatter {
  data: Record<string, string>
  body: string
}

function parseFrontmatter(content: string): Frontmatter {
  if (!content.startsWith('---')) return { data: {}, body: content }

  const end = content.indexOf('\n---', 3)
  if (end === -1) return { data: {}, body: content }

  const data: Record<string, string> = {}
  for (const line of content.slice(3, end).split('\n')) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim())
    if (!match?.[1] || match[2] === undefined) continue
    data[match[1]] = match[2].replace(/^["']|["']$/g, '').trim()
  }

  return { data, body: content.slice(end + 4) }
}

// ─── Component inventory ────────────────────────────────────────────────

async function collectSkills(pluginRoot: string, pluginName: string): Promise<SkillMeta[]> {
  const skillsDir = join(pluginRoot, 'skills')
  const skills: SkillMeta[] = []

  if (await isDirectory(skillsDir)) {
    for (const entry of await readDirectory(skillsDir)) {
      const skillPath = join(skillsDir, entry, 'SKILL.md')
      const content = await readText(skillPath)
      if (content === null) continue
      const { data } = parseFrontmatter(content)
      skills.push({
        name: data.name ?? entry,
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      })
    }
    return skills
  }

  // 插件根部只有 SKILL.md 时，整个插件按单技能加载
  const rootSkill = await readText(join(pluginRoot, 'SKILL.md'))
  if (rootSkill !== null) {
    const { data } = parseFrontmatter(rootSkill)
    skills.push({
      name: data.name ?? pluginName,
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
    })
  }

  return skills
}

async function collectMarkdownNames(dir: string, recursive: boolean): Promise<string[]> {
  if (!(await isDirectory(dir))) return []

  const names: string[] = []
  for (const entry of await readDirectory(dir)) {
    const fullPath = join(dir, entry)
    if (await isDirectory(fullPath)) {
      if (recursive) {
        const nested = await collectMarkdownNames(fullPath, true)
        names.push(...nested.map((name) => `${entry}/${name}`))
      }
      continue
    }
    if (entry.endsWith('.md')) names.push(entry.slice(0, -3))
  }
  return names
}

async function collectJsonKeys(path: string, key?: string): Promise<string[]> {
  if ((await readText(path)) === null) return []
  const data = requireRecord(await readJson(path), relative(REPO_ROOT, path))
  if (key === undefined) return Object.keys(data).sort()
  const nested = data[key]
  return isRecord(nested) ? Object.keys(nested).sort() : []
}

async function collectComponents(pluginRoot: string, pluginName: string): Promise<Components> {
  return {
    skills: await collectSkills(pluginRoot, pluginName),
    commands: await collectMarkdownNames(join(pluginRoot, 'commands'), false),
    agents: await collectMarkdownNames(join(pluginRoot, 'agents'), true),
    hooks: await collectJsonKeys(join(pluginRoot, 'hooks', 'hooks.json')),
    mcpServers: await collectJsonKeys(join(pluginRoot, '.mcp.json'), 'mcpServers'),
    lspServers: await collectJsonKeys(join(pluginRoot, '.lsp.json'), 'lspServers'),
  }
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

async function collectPlugin(entry: MarketplaceEntry): Promise<CatalogPlugin> {
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
    manifest,
    readmeHtml: readme === null ? '' : markdown.render(readme),
    components: await collectComponents(pluginRoot, entry.name),
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

  const plugins: CatalogPlugin[] = []
  for (const entry of entries) {
    plugins.push(await collectPlugin(entry))
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

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[catalog] error: ${message}`)
  process.exitCode = 1
})
