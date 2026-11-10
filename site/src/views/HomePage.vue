<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import PluginCard from '../components/PluginCard.vue'
import catalog from '../generated/catalog.json'
import { isRecentlyUpdated } from '../plugin-updates'
import type { MarketplaceCatalog, MarketplacePluginEntry } from '../types'

interface CategoryOption {
  name: string
  count: number
}

const UNCATEGORIZED = '未分类'

const data: MarketplaceCatalog = catalog
const searchQuery = ref('')
const selectedCategories = ref<string[]>([])
const categoryDropdown = ref<HTMLDetailsElement | null>(null)
const recentUpdateCount = data.plugins.filter((plugin) => isRecentlyUpdated(plugin.updatedAt)).length

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN')
}

function categoryName(plugin: MarketplacePluginEntry): string {
  return plugin.category?.trim() || UNCATEGORIZED
}

const searchTerms = computed(() => normalize(searchQuery.value).split(/\s+/).filter(Boolean))
const hasActiveFilters = computed(() => searchTerms.value.length > 0 || selectedCategories.value.length > 0)

const searchedPlugins = computed(() => {
  if (searchTerms.value.length === 0) return data.plugins

  return data.plugins.filter((plugin) => {
    const searchableText = normalize([
      plugin.name,
      plugin.displayName,
      plugin.manifest?.displayName,
      plugin.description,
      plugin.manifest?.description,
      categoryName(plugin),
      ...(plugin.tags ?? []),
      ...(plugin.manifest?.keywords ?? []),
    ].filter((value): value is string => Boolean(value)).join(' '))

    return searchTerms.value.every((term) => searchableText.includes(term))
  })
})

const categories = computed<CategoryOption[]>(() => {
  const counts = new Map<string, number>()
  for (const plugin of searchedPlugins.value) {
    const name = categoryName(plugin)
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }

  return [...new Set(data.plugins.map(categoryName))]
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))
    .map((name) => ({ name, count: counts.get(name) ?? 0 }))
})

const filteredPlugins = computed(() => {
  if (selectedCategories.value.length === 0) return searchedPlugins.value

  const selected = new Set(selectedCategories.value)
  return searchedPlugins.value.filter((plugin) => selected.has(categoryName(plugin)))
})

function clearSearch(): void {
  searchQuery.value = ''
}

function removeCategory(category: string): void {
  selectedCategories.value = selectedCategories.value.filter((selected) => selected !== category)
}

function clearCategories(): void {
  selectedCategories.value = []
}

function resetFilters(): void {
  clearSearch()
  clearCategories()
}

function closeCategoryDropdown(): void {
  if (categoryDropdown.value) categoryDropdown.value.open = false
}

function handleDropdownKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !categoryDropdown.value?.open) return

  event.preventDefault()
  event.stopPropagation()
  closeCategoryDropdown()
  categoryDropdown.value?.querySelector<HTMLElement>('summary')?.focus()
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!categoryDropdown.value?.open || !(event.target instanceof Node)) return
  if (!categoryDropdown.value.contains(event.target)) closeCategoryDropdown()
}

onMounted(() => document.addEventListener('pointerdown', handleDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', handleDocumentPointerDown))
</script>

<template>
  <Teleport v-if="data.plugins.length > 0" to="#market-header-controls">
    <div class="header-search-tools">
      <div class="search-field">
        <svg class="icon search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
        <label class="sr-only" for="plugin-search">搜索插件</label>
        <input
          id="plugin-search"
          v-model="searchQuery"
          class="search-input"
          type="search"
          placeholder="搜索插件"
          autocomplete="off"
          spellcheck="false"
        >
        <button v-if="searchQuery" class="search-clear" type="button" aria-label="清空搜索" @click="clearSearch">
          <svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
        </button>
      </div>

      <details ref="categoryDropdown" class="category-dropdown" @keydown="handleDropdownKeydown">
        <summary class="category-trigger" :class="{ 'is-active': selectedCategories.length > 0 }">
          <svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h6l2 2h8v12H4V5Z" /></svg>
          <span>分类</span>
          <span v-if="selectedCategories.length > 0" class="category-selected-count" :aria-label="`已选 ${selectedCategories.length} 个分类`">{{ selectedCategories.length }}</span>
          <svg class="icon category-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m8 10 4 4 4-4" /></svg>
        </summary>
        <div class="category-menu">
          <div class="category-menu-heading"><span>选择分类</span><span>可多选</span></div>
          <div class="category-options" role="group" aria-label="分类选项">
            <label
              v-for="category in categories"
              :key="category.name"
              class="category-option"
              :class="{ 'is-selected': selectedCategories.includes(category.name) }"
            >
              <input v-model="selectedCategories" class="category-checkbox" type="checkbox" :value="category.name">
              <span class="category-name">{{ category.name }}</span>
              <span class="category-count" :aria-label="`${category.count} 个插件`">{{ category.count }}</span>
            </label>
          </div>
          <p class="category-menu-hint">未选择时显示全部</p>
          <button v-if="selectedCategories.length > 0" class="category-clear" type="button" @click="clearCategories">清除分类</button>
        </div>
      </details>
    </div>
  </Teleport>

  <section aria-labelledby="plugins-heading" class="catalog-section">
    <header class="market-hero">
      <p class="eyebrow">MAIXAI · CLAUDE MARKETPLACE</p>
      <h1 id="plugins-heading" class="market-title">Maixai 插件市场</h1>
      <p class="market-lead">Maixai 产品相关，以及 Maixai 用于创造的 Claude 插件</p>
    </header>

    <div v-if="data.plugins.length > 0" class="results-region">
      <div class="results-toolbar">
        <div class="results-summary">
          <p class="results-count" role="status" aria-live="polite" aria-atomic="true">
            {{ hasActiveFilters ? `找到 ${filteredPlugins.length} 个插件` : `全部插件 · ${filteredPlugins.length}` }}
          </p>
          <span class="recent-summary" :class="{ 'is-empty': recentUpdateCount === 0 }" :aria-label="`最近 7 天更新 ${recentUpdateCount} 个插件`" title="最近 7 天内有更新的插件数量">
            <span class="recent-summary-dot" aria-hidden="true"></span>
            最近更新 <span class="recent-summary-count">{{ recentUpdateCount }}</span>
          </span>
        </div>
        <div v-if="selectedCategories.length > 0" class="active-filters">
          <span class="active-filters-label">已选</span>
          <TransitionGroup tag="ul" name="filter-chip" class="active-filter-list">
            <li v-for="category in selectedCategories" :key="category">
              <button class="active-filter-chip" type="button" :aria-label="`移除分类 ${category}`" @click="removeCategory(category)">
                {{ category }}
                <svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
              </button>
            </li>
          </TransitionGroup>
          <button class="clear-categories" type="button" @click="clearCategories">清除分类</button>
        </div>
      </div>

      <div v-if="filteredPlugins.length === 0" class="empty-state">
        <span class="empty-icon" aria-hidden="true">
          <svg class="icon icon--large" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4M8.5 11h5" /></svg>
        </span>
        <h2 class="empty-title">没有匹配的插件</h2>
        <p class="empty-text">试试更短的关键词，或移除部分分类条件。</p>
        <button class="button button--primary" type="button" @click="resetFilters">清除搜索与分类</button>
      </div>
      <TransitionGroup v-else tag="ul" name="plugin-list" class="plugin-grid" appear>
        <li v-for="plugin in filteredPlugins" :key="plugin.name"><PluginCard :plugin="plugin" /></li>
      </TransitionGroup>
    </div>

    <div v-else class="empty-state">
      <p class="empty-title">暂无插件</p>
      <p class="empty-text">此市场尚未发布插件。</p>
    </div>
  </section>
</template>
