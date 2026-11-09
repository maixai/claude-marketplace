<script setup lang="ts">
import { onUnmounted, ref } from 'vue'

import CopyCommand from './CopyCommand.vue'
import type { InstallStep } from '../types'

defineProps<{ steps: InstallStep[] }>()

const TOAST_DURATION = 2400

const feedback = ref<'success' | 'error' | null>(null)
let feedbackTimer: ReturnType<typeof setTimeout> | undefined

function handleResult(status: 'success' | 'error'): void {
  feedback.value = status
  if (feedbackTimer) clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => { feedback.value = null }, TOAST_DURATION)
}

onUnmounted(() => {
  if (feedbackTimer) clearTimeout(feedbackTimer)
})
</script>

<template>
  <section class="installation" aria-labelledby="install-heading">
    <h2 id="install-heading" class="plugin-section-title">
      <svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 6 5 6-5 6M13 18h6" /></svg>
      安装插件
    </h2>
    <p class="installation-note">在终端依次运行以下命令。</p>
    <ol class="installation-steps">
      <li v-for="(step, index) in steps" :key="step.command" class="installation-step">
        <CopyCommand :command="step.command" :label="`复制${step.title}命令`" @result="handleResult">
          <template #heading>
            <h3 class="installation-step-heading">
              <span class="installation-step-index" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
              {{ step.title }}
            </h3>
          </template>
        </CopyCommand>
      </li>
    </ol>
    <p class="installation-hint">已添加此市场？直接运行第二条命令即可。</p>

    <Teleport to="body">
      <Transition name="copy-toast">
        <div v-if="feedback" class="copy-toast" :class="`copy-toast--${feedback}`" role="status" aria-live="polite">
          <svg v-if="feedback === 'success'" class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
          <svg v-else class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 2 21h20L12 3Zm0 6v6m0 3v.01" /></svg>
          <span>{{ feedback === 'success' ? '命令已复制，粘贴到终端运行。' : '无法自动复制，请选择命令手动复制。' }}</span>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>
