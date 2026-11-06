<script setup lang="ts">
import { RouterLink } from 'vue-router'

import catalog from '../generated/catalog.json'
import type { MarketplaceCatalog, MarketplacePluginEntry } from '../types'

const data: MarketplaceCatalog = catalog

function displayName(plugin: MarketplacePluginEntry): string {
  return plugin.displayName ?? plugin.manifest?.displayName ?? plugin.name
}

function description(plugin: MarketplacePluginEntry): string {
  return plugin.description ?? plugin.manifest?.description ?? '暂无描述。'
}

function version(plugin: MarketplacePluginEntry): string | null {
  return plugin.version ?? plugin.manifest?.version ?? null
}

function componentSummary(plugin: MarketplacePluginEntry): string {
  const parts: string[] = []
  if (plugin.components.skills.length > 0) parts.push(`${plugin.components.skills.length} 个技能`)
  if (plugin.components.agents.length > 0) parts.push(`${plugin.components.agents.length} 个子代理`)
  if (plugin.components.commands.length > 0) parts.push(`${plugin.components.commands.length} 个命令`)
  if (plugin.components.hooks.length > 0) parts.push(`${plugin.components.hooks.length} 个 Hook`)
  return parts.join(' · ')
}
</script>

<template>
  <section aria-labelledby="plugins-heading">
    <h2 id="plugins-heading" class="section-title">插件</h2>
    <p class="section-note">共 {{ data.plugins.length }} 个插件，通过 Claude Code 安装。</p>

    <div v-if="data.plugins.length === 0" class="empty-state">
      <p class="empty-title">该市场还没有发布插件</p>
      <p class="empty-text">
        在仓库的 <code>plugins/</code> 目录下新增插件，并在
        <code>.claude-plugin/marketplace.json</code> 中登记后即可显示在这里。
      </p>
    </div>

    <ul v-else class="grid">
      <li v-for="plugin in data.plugins" :key="plugin.name">
        <RouterLink class="card" :to="{ name: 'plugin', params: { name: plugin.name } }">
          <div>
            <h3 class="card-title">{{ displayName(plugin) }}</h3>
            <p class="card-description">{{ description(plugin) }}</p>
          </div>

          <ul v-if="plugin.tags?.length || plugin.category" class="card-meta">
            <li v-if="plugin.category" class="tag">{{ plugin.category }}</li>
            <li v-for="tag in plugin.tags ?? []" :key="tag" class="tag">{{ tag }}</li>
          </ul>

          <p v-if="componentSummary(plugin)" class="card-components">
            {{ componentSummary(plugin) }}
          </p>

          <p v-if="version(plugin)" class="card-description">版本 {{ version(plugin) }}</p>

          <p class="card-command">
            <code class="plugin-command">
              claude plugin install {{ plugin.name }}@{{ data.name }}
            </code>
          </p>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>
