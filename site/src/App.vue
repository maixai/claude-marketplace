<script setup lang="ts">
import { RouterView } from 'vue-router'

import catalog from './generated/catalog.json'
import type { MarketplaceCatalog } from './types'

const data: MarketplaceCatalog = catalog
const repository = 'maixai/claude-marketplace'
</script>

<template>
  <div class="page">
    <header class="site-header">
      <div class="container header-inner">
        <div>
          <p class="eyebrow">Claude Code Plugin Marketplace</p>
          <h1 class="site-title">
            <RouterLink class="site-title-link" to="/">{{ data.name }}</RouterLink>
          </h1>
          <p class="lead">{{ data.description }}</p>
          <p class="install-hint">
            <code>claude plugin marketplace add {{ repository }}</code>
          </p>
        </div>
        <a class="repo-link" :href="`https://github.com/${repository}`">GitHub 仓库</a>
      </div>
    </header>

    <main class="container">
      <RouterView />
    </main>
  </div>
</template>
