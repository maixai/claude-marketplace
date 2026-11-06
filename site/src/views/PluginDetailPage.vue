<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import catalog from '../generated/catalog.json'
import type { MarketplaceCatalog, MarketplacePluginEntry } from '../types'

const props = defineProps<{ name: string }>()

const data: MarketplaceCatalog = catalog
const repository = 'maixai/claude-marketplace'

const plugin = computed<MarketplacePluginEntry | null>(
  () => data.plugins.find((item) => item.name === props.name) ?? null,
)

function displayName(entry: MarketplacePluginEntry): string {
  return entry.displayName ?? entry.manifest?.displayName ?? entry.name
}

function description(entry: MarketplacePluginEntry): string {
  return entry.description ?? entry.manifest?.description ?? '暂无描述。'
}

function version(entry: MarketplacePluginEntry): string | null {
  return entry.version ?? entry.manifest?.version ?? null
}

function authorName(entry: MarketplacePluginEntry): string | null {
  return entry.manifest?.author?.name ?? null
}

function sourceUrl(entry: MarketplacePluginEntry): string {
  return `https://github.com/${repository}/tree/main/plugins/${entry.name}`
}

function userConfigEntries(entry: MarketplacePluginEntry) {
  return Object.entries(entry.manifest?.userConfig ?? {})
}

function componentCount(entry: MarketplacePluginEntry): number {
  const { skills, commands, agents, hooks, mcpServers, lspServers } = entry.components
  return (
    skills.length +
    commands.length +
    agents.length +
    hooks.length +
    mcpServers.length +
    lspServers.length
  )
}
</script>

<template>
  <article v-if="plugin" class="plugin-detail">
    <p class="back-link">
      <RouterLink class="text-link" to="/">← 返回插件列表</RouterLink>
    </p>

    <header class="plugin-header">
      <div class="row row--between">
        <h2 class="section-title">{{ displayName(plugin) }}</h2>
        <span v-if="version(plugin)" class="tag">v{{ version(plugin) }}</span>
      </div>
      <p class="lead">{{ description(plugin) }}</p>
      <ul v-if="plugin.tags?.length || plugin.category" class="card-meta">
        <li v-if="plugin.category" class="tag">{{ plugin.category }}</li>
        <li v-for="tag in plugin.tags ?? []" :key="tag" class="tag">{{ tag }}</li>
      </ul>
      <p v-if="authorName(plugin)" class="plugin-author">作者：{{ authorName(plugin) }}</p>
    </header>

    <section class="detail-section" aria-labelledby="install-heading">
      <h3 id="install-heading" class="subsection-title">安装</h3>
      <p class="card-command">
        <code class="plugin-command">
          claude plugin install {{ plugin.name }}@{{ data.name }}
        </code>
      </p>
    </section>

    <section class="detail-section" aria-labelledby="components-heading">
      <h3 id="components-heading" class="subsection-title">组件</h3>
      <p v-if="componentCount(plugin) === 0" class="section-note">该插件没有声明任何组件。</p>
      <dl v-else class="component-list">
        <div v-if="plugin.components.skills.length > 0" class="component-item">
          <dt>技能</dt>
          <dd>
            <ul class="item-list">
              <li v-for="skill in plugin.components.skills" :key="skill.name">
                <code>{{ skill.name }}</code>
                <span v-if="skill.description" class="item-note">{{ skill.description }}</span>
              </li>
            </ul>
          </dd>
        </div>
        <div v-if="plugin.components.agents.length > 0" class="component-item">
          <dt>子代理</dt>
          <dd>
            <ul class="item-list">
              <li v-for="agent in plugin.components.agents" :key="agent">
                <code>{{ agent }}</code>
              </li>
            </ul>
          </dd>
        </div>
        <div v-if="plugin.components.commands.length > 0" class="component-item">
          <dt>命令</dt>
          <dd>
            <ul class="item-list">
              <li v-for="command in plugin.components.commands" :key="command">
                <code>{{ command }}</code>
              </li>
            </ul>
          </dd>
        </div>
        <div v-if="plugin.components.hooks.length > 0" class="component-item">
          <dt>Hooks</dt>
          <dd>
            <ul class="item-list">
              <li v-for="hook in plugin.components.hooks" :key="hook">
                <code>{{ hook }}</code>
              </li>
            </ul>
          </dd>
        </div>
        <div v-if="plugin.components.mcpServers.length > 0" class="component-item">
          <dt>MCP Servers</dt>
          <dd>
            <ul class="item-list">
              <li v-for="server in plugin.components.mcpServers" :key="server">
                <code>{{ server }}</code>
              </li>
            </ul>
          </dd>
        </div>
        <div v-if="plugin.components.lspServers.length > 0" class="component-item">
          <dt>LSP Servers</dt>
          <dd>
            <ul class="item-list">
              <li v-for="server in plugin.components.lspServers" :key="server">
                <code>{{ server }}</code>
              </li>
            </ul>
          </dd>
        </div>
      </dl>
    </section>

    <section v-if="userConfigEntries(plugin).length > 0" class="detail-section" aria-labelledby="config-heading">
      <h3 id="config-heading" class="subsection-title">配置项</h3>
      <div class="table-wrap">
        <table class="config-table">
          <thead>
            <tr>
              <th scope="col">名称</th>
              <th scope="col">类型</th>
              <th scope="col">必填</th>
              <th scope="col">说明</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="[key, field] in userConfigEntries(plugin)" :key="key">
              <td><code>{{ key }}</code></td>
              <td>{{ field.type ?? 'string' }}</td>
              <td>{{ field.required ? '是' : '否' }}</td>
              <td>{{ field.description ?? field.title ?? '' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="plugin.readmeHtml" class="detail-section" aria-labelledby="readme-heading">
      <h3 id="readme-heading" class="subsection-title">说明</h3>
      <!-- README 由本地仓库内容在构建期渲染，来源可信 -->
      <div class="prose" v-html="plugin.readmeHtml"></div>
    </section>

    <p class="detail-section">
      <a class="text-link" :href="sourceUrl(plugin)">查看源文件</a>
    </p>
  </article>

  <section v-else aria-labelledby="plugin-missing-heading">
    <h2 id="plugin-missing-heading" class="section-title">插件未找到</h2>
    <p class="section-note">市场中没有名为 <code>{{ props.name }}</code> 的插件。</p>
    <p>
      <RouterLink class="text-link" to="/">返回插件列表</RouterLink>
    </p>
  </section>
</template>
