export interface MarketplaceOwner {
  name: string
  email?: string
  url?: string
}

export interface UserConfigField {
  type?: string
  title?: string
  description?: string
  required?: boolean
  sensitive?: boolean
}

export interface PluginManifest {
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

export interface SkillMeta {
  name: string
  title?: string
  description?: string
}

export interface PluginComponents {
  skills: SkillMeta[]
  commands: string[]
  agents: string[]
  hooks: string[]
  mcpServers: string[]
  lspServers: string[]
}

export type PluginSource = string | { source: string; [key: string]: unknown }

export interface MarketplacePluginEntry {
  name: string
  source: PluginSource
  description?: string
  displayName?: string
  version?: string
  category?: string
  tags?: string[]
  manifest: PluginManifest | null
  readmeHtml: string
  components: PluginComponents
}

export interface MarketplaceCatalog {
  name: string
  description: string
  owner: MarketplaceOwner | null
  plugins: MarketplacePluginEntry[]
}
