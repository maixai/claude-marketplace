<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'

const repository = 'maixai/claude-marketplace'
const route = useRoute()
const main = ref<HTMLElement | null>(null)

// 路由切换后将键盘焦点交给新页面，避免焦点留在已移除的卡片上。
watch(() => route.path, () => main.value?.focus(), { flush: 'post' })
</script>

<template>
  <div class="page">
    <a class="skip-link" href="#main">跳转到主要内容</a>
    <header class="site-header">
      <div class="container header-inner">
        <RouterLink class="brand" to="/" aria-label="Maixai 插件市场首页">
          <svg class="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="M6 24V8l10 10L26 8v16M6 16l10 10 10-10" />
          </svg>
          <span class="brand-name">maixai</span>
          <span class="brand-divider" aria-hidden="true">/</span>
          <span class="brand-context">插件市场</span>
        </RouterLink>
        <nav aria-label="站点导航">
          <a
            class="header-link"
            :href="`https://github.com/${repository}`"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub（在新标签页打开）"
            title="在新标签页打开 GitHub"
          >
            GitHub <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </div>
    </header>

    <main id="main" ref="main" class="container main-content" tabindex="-1">
      <RouterView />
    </main>
  </div>
</template>
