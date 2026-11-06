import { createRouter, createWebHistory } from 'vue-router'

import HomePage from './views/HomePage.vue'
import NotFoundPage from './views/NotFoundPage.vue'
import PluginDetailPage from './views/PluginDetailPage.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/plugins/:name', name: 'plugin', component: PluginDetailPage, props: true },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundPage },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
