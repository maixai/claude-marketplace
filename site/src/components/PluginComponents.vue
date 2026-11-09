<script setup lang="ts">
import { computed } from 'vue'

import type { PluginComponents } from '../types'

const props = defineProps<{ components: PluginComponents }>()
const entries = computed(() => [
  { key: 'skills', title: '技能', items: props.components.skills },
  { key: 'agents', title: '子代理', items: props.components.agents },
  { key: 'commands', title: '命令', items: props.components.commands },
  { key: 'hooks', title: 'Hooks', items: props.components.hooks },
  { key: 'mcp', title: 'MCP 服务器', items: props.components.mcpServers },
  { key: 'lsp', title: '语言服务器', items: props.components.lspServers },
].flatMap((group) => group.items.map((item) => ({
  ...item,
  key: `${group.key}:${item.name}`,
  kind: group.title,
}))))
</script>

<template>
  <section class="capabilities" aria-labelledby="components-heading">
    <h2 id="components-heading" class="plugin-section-title">
      <svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" /></svg>
      包含组件 <span class="count">{{ entries.length }}</span>
    </h2>
    <p v-if="entries.length === 0" class="section-note">该插件没有声明任何组件。</p>
    <ul v-else class="capability-list">
      <li v-for="item in entries" :key="item.key" class="capability-entry">
        <h3 class="capability-heading">
          <code class="capability-name">{{ item.name }}</code>
          <span class="capability-kind">{{ item.kind }}</span>
        </h3>
        <p v-if="item.description" class="capability-description">{{ item.description }}</p>
        <p v-if="item.events?.length" class="capability-events">触发事件：<span>{{ item.events.join(' · ') }}</span></p>
      </li>
    </ul>
  </section>
</template>
