<script setup lang="ts">
import { onUnmounted, ref } from 'vue'

const props = defineProps<{
  command: string
  label: string
}>()

const emit = defineEmits<{ result: [status: 'success' | 'error'] }>()

const BOX_FEEDBACK_DURATION = 900

const state = ref<'idle' | 'copying' | 'success' | 'error'>('idle')
let resetTimer: ReturnType<typeof setTimeout> | undefined

function clearResetTimer(): void {
  if (resetTimer) {
    clearTimeout(resetTimer)
    resetTimer = undefined
  }
}

function scheduleReset(): void {
  clearResetTimer()
  resetTimer = setTimeout(() => { state.value = 'idle' }, BOX_FEEDBACK_DURATION)
}

async function copyCommand(): Promise<void> {
  if (state.value === 'copying') return
  clearResetTimer()
  state.value = 'copying'
  try {
    await navigator.clipboard.writeText(props.command)
    state.value = 'success'
    emit('result', 'success')
  } catch {
    // 非安全上下文或权限受限时，提示用户手动选择命令复制。
    state.value = 'error'
    emit('result', 'error')
  }
  scheduleReset()
}

onUnmounted(clearResetTimer)
</script>

<template>
  <div class="command-block">
    <div class="command-heading">
      <slot name="heading" />
    </div>
    <div
      class="command-input"
      :class="{ 'command-input--success': state === 'success', 'command-input--error': state === 'error' }"
    >
      <div class="command-code" tabindex="0" role="region" :aria-label="`${label}的内容，可横向滚动`">
        <span class="command-prompt" aria-hidden="true">$</span>
        <code>{{ command }}</code>
      </div>
      <button
        class="button copy-button"
        type="button"
        :aria-label="label"
        :title="label"
        :disabled="state === 'copying'"
        @click="copyCommand"
      >
        <svg class="icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
        </svg>
      </button>
    </div>
  </div>
</template>
