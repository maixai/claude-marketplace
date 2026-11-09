<script setup lang="ts">
import PluginCard from '../components/PluginCard.vue'
import catalog from '../generated/catalog.json'
import type { MarketplaceCatalog } from '../types'

const data: MarketplaceCatalog = catalog
</script>

<template>
  <section aria-labelledby="plugins-heading" class="catalog-section">
    <header class="section-heading">
      <h1 id="plugins-heading" class="section-title">插件 <span class="count">{{ data.plugins.length }}</span></h1>
      <code class="catalog-id">{{ data.name }}</code>
    </header>

    <div v-if="data.plugins.length === 0" class="empty-state">
      <p class="empty-title">暂无插件</p>
      <p class="empty-text">此市场尚未发布插件。</p>
    </div>
    <ul v-else class="plugin-grid">
      <li v-for="plugin in data.plugins" :key="plugin.name"><PluginCard :plugin="plugin" /></li>
    </ul>
  </section>
</template>
