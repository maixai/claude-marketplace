<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <section aria-labelledby="not-found-heading">
    <h2 id="not-found-heading" class="section-title">页面不存在</h2>
    <p class="section-note">你访问的地址没有对应的页面。</p>
    <p>
      <RouterLink class="text-link" to="/">返回插件列表</RouterLink>
    </p>
  </section>
</template>
