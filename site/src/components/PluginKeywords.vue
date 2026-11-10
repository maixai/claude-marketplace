<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ keywords: string[] }>()
const keywords = computed(() => [...new Set(props.keywords.map((keyword) => keyword.trim()).filter(Boolean))])
</script>

<template>
  <ul v-if="keywords.length" class="keyword-list" aria-label="插件关键词">
    <li v-for="keyword in keywords" :key="keyword" class="keyword-tag">{{ keyword }}</li>
  </ul>
</template>
