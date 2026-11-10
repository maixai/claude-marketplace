<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'

import PluginComponents from '../components/PluginComponents.vue'
import PluginInstallation from '../components/PluginInstallation.vue'
import PluginKeywords from '../components/PluginKeywords.vue'
import catalog from '../generated/catalog.json'
import type { MarketplaceCatalog, MarketplacePluginEntry } from '../types'

const props = defineProps<{ name: string }>()
const data: MarketplaceCatalog = catalog
const repository = 'maixai/claude-marketplace'
const componentsCollapsed = ref(false)
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

const dateFormat = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })

const updatedDate = computed(() => {
  const value = plugin.value?.updatedAt
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
})

const updatedLabel = computed(() => (updatedDate.value ? dateFormat.format(updatedDate.value) : '不可用'))

const componentSummary = computed(() => {
  const components = plugin.value?.components
  if (!components) return '—'
  const groups = [
    { label: '技能', count: components.skills.length },
    { label: '命令', count: components.commands.length },
    { label: '子代理', count: components.agents.length },
    { label: 'Hooks', count: components.hooks.length },
    { label: 'MCP', count: components.mcpServers.length },
    { label: 'LSP', count: components.lspServers.length },
  ].filter((group) => group.count > 0)
  const total = groups.reduce((sum, group) => sum + group.count, 0)
  return total === 0 ? '0' : `${total}（${groups.map((group) => `${group.label} ${group.count}`).join(' · ')}）`
})

const componentTotal = computed(() => {
  const components = plugin.value?.components
  if (!components) return 0
  return components.skills.length
    + components.commands.length
    + components.agents.length
    + components.hooks.length
    + components.mcpServers.length
    + components.lspServers.length
})

function toggleComponents(): void {
  componentsCollapsed.value = !componentsCollapsed.value
}

const readmeHtml = computed(() => {
  const entry = plugin.value
  if (!entry?.readmeHtml) return ''
  const document = new DOMParser().parseFromString(entry.readmeHtml, 'text/html')
  const first = document.body.firstElementChild
  // 只在展示层去掉与页面身份区重复的首标题，不修改 README 源文件。
  if (first?.tagName === 'H1' && [displayName(entry), entry.name].includes(first.textContent?.trim() ?? '')) {
    first.remove()
  }
  const introduction = document.body.firstElementChild
  if (introduction && /^H[1-6]$/.test(introduction.tagName) && /^(使用|使用说明|使用方式|usage|how to use)$/i.test(introduction.textContent?.trim() ?? '')) {
    introduction.remove()
  }
  // 保留其余章节内容，并使 README 的最外层标题接续“使用说明”层级。
  const headings = [...document.body.querySelectorAll('h1,h2,h3,h4,h5,h6')]
  const firstLevel = Math.min(...headings.map((heading) => Number(heading.tagName.slice(1))))
  for (const heading of headings) {
    const level = Math.min(Number(heading.tagName.slice(1)) + 3 - firstLevel, 6)
    const replacement = document.createElement(`h${level}`)
    for (const attribute of heading.attributes) replacement.setAttribute(attribute.name, attribute.value)
    replacement.innerHTML = heading.innerHTML
    heading.replaceWith(replacement)
  }
  return document.body.innerHTML.trim()
})
</script>

<template>
  <article v-if="plugin" class="plugin-detail">
    <nav class="plugin-back" aria-label="返回市场">
      <RouterLink to="/">
        <svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" /></svg>
        插件市场
      </RouterLink>
    </nav>

    <section class="plugin-hero" aria-label="插件概览与安装">
      <header class="plugin-identity">
        <div class="plugin-meta">
          <span class="plugin-meta-id">PLUGIN <span aria-hidden="true">/</span> {{ plugin.name }}</span>
          <span v-if="version(plugin)" class="version">v{{ version(plugin) }}</span>
        </div>
        <h1 class="plugin-title">{{ displayName(plugin) }}</h1>
        <p class="plugin-summary">{{ description(plugin) }}</p>
        <div class="plugin-attribution">
          <span v-if="authorName(plugin)" class="plugin-author"><span>作者</span>{{ authorName(plugin) }}</span>
          <a class="plugin-source" :href="sourceUrl(plugin)" target="_blank" rel="noopener noreferrer" aria-label="查看插件源码（在新标签页打开）">
            查看源码 <span aria-hidden="true">↗</span>
          </a>
        </div>
        <dl class="plugin-spec">
          <div class="plugin-spec-row">
            <dt>分类</dt>
            <dd>{{ plugin.category || '—' }}</dd>
          </div>
          <div class="plugin-spec-row">
            <dt>组件</dt>
            <dd>{{ componentSummary }}</dd>
          </div>
          <div class="plugin-spec-row">
            <dt>更新</dt>
            <dd>
              <time v-if="updatedDate" :datetime="updatedDate.toISOString()">{{ updatedLabel }}</time>
              <span v-else>{{ updatedLabel }}</span>
            </dd>
          </div>
        </dl>
        <PluginKeywords :keywords="plugin.manifest?.keywords ?? []" />
      </header>

      <aside class="plugin-installation" aria-label="插件安装引导">
        <PluginInstallation :steps="plugin.installation" />
      </aside>
    </section>

    <div class="plugin-body" :class="{ 'is-components-collapsed': componentsCollapsed }">
      <section class="plugin-document" aria-labelledby="readme-heading">
        <h2 id="readme-heading" class="plugin-section-title">
          <svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6M9 16h6" /></svg>
          使用说明
        </h2>
        <!-- 内容已经在构建期禁用原始 HTML，此处仅呈现去重后的阅读层级。 -->
        <div v-if="readmeHtml" class="prose" v-html="readmeHtml"></div>
        <p v-else class="section-note">暂无额外使用说明，请参考下方组件介绍。</p>

        <section v-if="userConfigEntries(plugin).length > 0" class="plugin-configuration" aria-labelledby="config-heading">
          <h3 id="config-heading" class="plugin-subheading">配置项</h3>
          <div class="table-wrap" tabindex="0" role="region" aria-label="插件配置项，可横向滚动">
            <table class="config-table">
              <thead><tr><th scope="col">名称</th><th scope="col">类型</th><th scope="col">必填</th><th scope="col">说明</th></tr></thead>
              <tbody>
                <tr v-for="[key, field] in userConfigEntries(plugin)" :key="key">
                  <td><code>{{ key }}</code></td>
                  <td>{{ field.type ?? 'string' }}</td>
                  <td><span :class="{ 'required-label': field.required }">{{ field.required ? '必填' : '可选' }}</span></td>
                  <td>{{ field.description ?? field.title ?? '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <aside class="plugin-sidebar" :class="{ 'is-collapsed': componentsCollapsed }" aria-label="插件组件">
        <button
          class="components-rail"
          type="button"
          :aria-expanded="!componentsCollapsed"
          aria-controls="plugin-components-content"
          :aria-label="componentsCollapsed ? `展开包含组件（${componentTotal} 个）` : `折叠包含组件（${componentTotal} 个）`"
          :title="componentsCollapsed ? '展开包含组件' : '折叠包含组件'"
          @click="toggleComponents"
        >
          <svg class="icon components-rail-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
        </button>
        <Transition name="components-fade">
          <div v-show="!componentsCollapsed" id="plugin-components-content" class="plugin-sidebar-content">
            <PluginComponents :components="plugin.components" />
          </div>
        </Transition>
      </aside>
    </div>
  </article>

  <section v-else class="not-found" aria-labelledby="plugin-missing-heading">
    <p class="eyebrow">PLUGIN NOT FOUND</p>
    <h1 id="plugin-missing-heading" class="page-title">没有找到这个插件</h1>
    <p class="lead">市场中没有名为 <code>{{ props.name }}</code> 的插件，请返回列表重新选择。</p>
    <RouterLink class="button button--primary" to="/">返回插件列表 <span aria-hidden="true">→</span></RouterLink>
  </section>
</template>
