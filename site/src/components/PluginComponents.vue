<script setup lang="ts">
import { computed } from 'vue'

import type { ComponentMeta, PluginComponents } from '../types'

interface ComponentGroup {
  key: string
  title: string
  supportsModelEffort: boolean
  items: ComponentMeta[]
}

const props = defineProps<{ components: PluginComponents }>()

// 顺序即展示顺序：先 Skill、再 SubAgent，其余按用户使用频率从高到低排列。
const groups = computed<ComponentGroup[]>(() => [
  { key: 'skills', title: '技能', supportsModelEffort: true, items: props.components.skills },
  { key: 'agents', title: '子代理', supportsModelEffort: true, items: props.components.agents },
  { key: 'commands', title: '命令', supportsModelEffort: true, items: props.components.commands },
  { key: 'hooks', title: 'Hooks', supportsModelEffort: false, items: props.components.hooks },
  { key: 'mcpServers', title: 'MCP 服务器', supportsModelEffort: false, items: props.components.mcpServers },
  { key: 'lspServers', title: '语言服务器', supportsModelEffort: false, items: props.components.lspServers },
].filter((group) => group.items.length > 0))

const total = computed(() => groups.value.reduce((sum, group) => sum + group.items.length, 0))
</script>

<template>
  <section class="capabilities" aria-labelledby="components-heading">
    <h2 id="components-heading" class="plugin-section-title">
      <svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" /></svg>
      包含组件 <span class="count">{{ total }}</span>
    </h2>
    <p v-if="total === 0" class="section-note">该插件没有声明任何组件。</p>
    <div v-else class="component-groups">
      <div v-for="(group, index) in groups" :key="group.key" class="component-group">
        <header class="component-group-heading">
          <span class="component-group-index" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
          <h3 class="component-group-title">{{ group.title }}</h3>
          <span class="component-group-rule" aria-hidden="true"></span>
          <span class="component-group-count">{{ group.items.length }}<span class="sr-only"> 个</span></span>
        </header>
        <ul class="component-list">
          <li v-for="item in group.items" :key="`${group.key}:${item.name}`" class="component-entry">
            <h4 class="component-name"><code>{{ item.name }}</code></h4>
            <p v-if="item.description" class="component-description">{{ item.description }}</p>
            <p v-if="item.events?.length" class="component-events">触发事件：<span>{{ item.events.join(' · ') }}</span></p>
            <dl v-if="group.supportsModelEffort" class="component-model">
              <div class="component-model-row">
                <dt>模型</dt>
                <dd :class="{ 'component-model-unset': !item.model }">{{ item.model || '未指定' }}</dd>
              </div>
              <div class="component-model-row">
                <dt>思考强度</dt>
                <dd :class="{ 'component-model-unset': !item.effort }">{{ item.effort || '未指定' }}</dd>
              </div>
            </dl>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
