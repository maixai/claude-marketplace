<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

type PageTransitionName = 'page-forward' | 'page-back' | 'page-fade'

const repository = 'maixai/claude-marketplace'
const route = useRoute()
const router = useRouter()
const main = ref<HTMLElement | null>(null)
const transitionName = ref<PageTransitionName>('page-fade')

function routeDepth(path: string): number {
  return path.startsWith('/plugins/') ? 1 : 0
}

// 在路由确认前确定方向，RouterView 才能使用对应的进入 / 退出曲线。
router.beforeEach((to, from) => {
  const toDepth = routeDepth(to.path)
  const fromDepth = routeDepth(from.path)
  transitionName.value = toDepth > fromDepth
    ? 'page-forward'
    : toDepth < fromDepth
      ? 'page-back'
      : 'page-fade'
})

// 路由切换后将键盘焦点交给新页面，避免焦点留在已移除的卡片上。
watch(() => route.path, () => main.value?.focus(), { flush: 'post' })
</script>

<template>
  <div class="page">
    <a class="skip-link" href="#main">跳转到主要内容</a>
    <header class="site-header">
      <div class="container header-inner">
        <RouterLink class="brand" to="/" aria-label="Maixai Marketplace 首页">
          <svg class="brand-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <g fill="currentColor" stroke="none">
              <path d="M5 26C13 23 21 29 26.4 42C31 26 39 14 57 8.5C64 7 55 10 52 17C49 23 49 29 46.2 33C49 29.5 50 33.5 48 34C44 34.5 44 37 37.7 39.7C43 39 46 43 45 49C44 53 46 54 47.5 55.5C38 55 30 48 36.2 32.8C32 34 28 40 26.2 46.3C24 39 20 35 17.4 33C21 44 17 48 8.5 51.2C13 48 6 41 16.2 39.7C9 37 12 30 5 26Z" />
              <path d="M48.5 32C49.3 28.6 52 25 53.4 25.3C55 25.3 54 26.3 53 26.3C51 26.6 49 29 48.5 32Z" />
            </g>
          </svg>
          <span class="brand-name">Maixai Marketplace</span>
        </RouterLink>
        <div id="market-header-controls" class="header-controls"></div>
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
      <RouterView v-slot="{ Component, route: currentRoute }">
        <Transition :name="transitionName" mode="out-in">
          <div :key="currentRoute.path" class="route-view">
            <component :is="Component" />
          </div>
        </Transition>
      </RouterView>
    </main>
  </div>
</template>
