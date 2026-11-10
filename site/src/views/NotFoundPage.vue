<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <section class="not-found" aria-labelledby="not-found-heading">
    <p class="eyebrow">404 / PAGE NOT FOUND</p>
    <h1 id="not-found-heading" class="page-title">这个页面不在目录中</h1>
    <p class="lead">你访问的地址没有对应的页面，返回市场继续发现插件。</p>
    <RouterLink class="button button--primary" to="/">返回插件列表 <span aria-hidden="true">→</span></RouterLink>
  </section>
</template>
