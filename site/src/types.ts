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

export interface ComponentMeta {
  name: string
  description?: string
  events?: string[]
  model?: string
  effort?: string
}

export interface DescribedComponentMeta extends ComponentMeta {
  description: string
}

export interface PluginComponents {
  skills: DescribedComponentMeta[]
  commands: DescribedComponentMeta[]
  agents: DescribedComponentMeta[]
  hooks: ComponentMeta[]
  mcpServers: ComponentMeta[]
  lspServers: ComponentMeta[]
}

export interface InstallStep {
  title: string
  command: string
}

export type PluginSource = string | { source: string; [key: string]: unknown }

export interface MarketplacePluginEntry {
  updatedAt: string | null
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
  installation: InstallStep[]
}

export interface MarketplaceCatalog {
  name: string
  description: string
  owner: MarketplaceOwner | null
  plugins: MarketplacePluginEntry[]
}
