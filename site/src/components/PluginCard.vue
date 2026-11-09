<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

import PluginKeywords from './PluginKeywords.vue'
import type { MarketplacePluginEntry } from '../types'

const props = defineProps<{ plugin: MarketplacePluginEntry }>()
const displayName = computed(() => props.plugin.displayName?.trim() || props.plugin.manifest?.displayName?.trim() || '未命名插件')
const description = computed(() => props.plugin.description ?? props.plugin.manifest?.description ?? '暂无描述。')
const version = computed(() => props.plugin.version ?? props.plugin.manifest?.version)
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
  <RouterLink class="plugin-card" :to="{ name: 'plugin', params: { name: plugin.name } }">
    <div class="card-heading">
      <h2 class="card-title">{{ displayName }}</h2>
      <span v-if="version" class="version">v{{ version }}</span>
      <span class="card-arrow" aria-hidden="true">
        <svg class="icon" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
      </span>
    </div>
    <p class="card-description">{{ description }}</p>
    <PluginKeywords :keywords="plugin.manifest?.keywords ?? []" />
    <p class="card-updated">
      <template v-if="updatedDate">
        更新于
        <time :datetime="updatedDate.toISOString()" :title="`插件目录最后一次 Git 提交：${timestampFormat.format(updatedDate)}`">
          {{ dateFormat.format(updatedDate) }}
        </time>
      </template>
      <template v-else>更新时间不可用</template>
    </p>
  </RouterLink>
</template>
