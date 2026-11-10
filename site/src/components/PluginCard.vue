<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import PluginKeywords from './PluginKeywords.vue'
import { isRecentlyUpdated } from '../plugin-updates'
import type { MarketplacePluginEntry } from '../types'

const props = withDefaults(defineProps<{
  plugin: MarketplacePluginEntry
  selectedCategories?: string[]
}>(), {
  selectedCategories: () => [],
})

const emit = defineEmits<{
  'toggle-category': [category: string]
}>()

const displayName = computed(() => props.plugin.displayName?.trim() || props.plugin.manifest?.displayName?.trim() || '未命名插件')
const description = computed(() => props.plugin.description ?? props.plugin.manifest?.description ?? '暂无描述。')
const category = computed(() => props.plugin.category?.trim() || '未分类')
const isCategorySelected = computed(() => props.selectedCategories.includes(category.value))
const version = computed(() => props.plugin.version ?? props.plugin.manifest?.version)
const isRecent = computed(() => isRecentlyUpdated(props.plugin.updatedAt))
const dateFormat = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
const timestampFormat = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short', hourCycle: 'h23',
})
const updatedDate = computed(() => {
  if (!props.plugin.updatedAt) return null
  const date = new Date(props.plugin.updatedAt)
  return Number.isFinite(date.getTime()) ? date : null
})
</script>

<template>
  <article class="plugin-card">
    <div class="card-heading">
      <h2 class="card-title">
        <RouterLink class="card-link" :to="{ name: 'plugin', params: { name: plugin.name } }">{{ displayName }}</RouterLink>
      </h2>
      <span v-if="version" class="version">v{{ version }}</span>
      <span class="card-arrow" aria-hidden="true">
        <svg class="icon" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
      </span>
    </div>
    <p class="card-description">{{ description }}</p>
    <PluginKeywords :keywords="plugin.manifest?.keywords ?? []" />
    <p class="card-updated">
      <span class="card-date" :class="{ 'is-recent': isRecent }">
        <template v-if="updatedDate">
          更新于
          <time :datetime="updatedDate.toISOString()" :title="`插件目录最后一次 Git 提交：${timestampFormat.format(updatedDate)}`">
            {{ dateFormat.format(updatedDate) }}
          </time>
        </template>
        <template v-else>更新时间不可用</template>
      </span>
      <span class="card-flags">
        <button
          class="card-category"
          :class="{ 'is-active': isCategorySelected }"
          type="button"
          :aria-pressed="isCategorySelected"
          :aria-label="`按分类 ${category} 筛选`"
          :title="isCategorySelected ? `取消 ${category} 分类筛选` : `只看 ${category} 分类`"
          @click="emit('toggle-category', category)"
        >
          <svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h6l2 2h8v12H4V5Z" /></svg>
          {{ category }}
        </button>
      </span>
    </p>
  </article>
</template>
