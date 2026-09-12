<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import ShortcutHelp from './components/ShortcutHelp.vue'
import { useMissionStore } from './stores/mission'
import { useSettingsStore } from './stores/settings'
import { formatDistance } from './core/geo'
import { t } from './core/i18n'

const missionStore = useMissionStore()
const settings = useSettingsStore()
const route = useRoute()
const theme = ref<'light' | 'dark'>('light')
const helpOpen = ref(false)

function applyTheme(next: 'light' | 'dark'): void {
  theme.value = next
  document.documentElement.dataset.theme = next
  try {
    localStorage.setItem('mavplan-web.theme', next)
  } catch {
    /* ignore */
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || target.isContentEditable
}

function onGlobalKeydown(event: KeyboardEvent): void {
  const typing = isTypingTarget(event.target)
  if (event.key === '?' && !typing) {
    event.preventDefault()
    helpOpen.value = !helpOpen.value
    return
  }
  if (event.key === 'Escape' && helpOpen.value) {
    event.preventDefault()
    helpOpen.value = false
    return
  }
  const mod = event.ctrlKey || event.metaKey
  if (!mod || typing) return
  const key = event.key.toLowerCase()
  if (key === 'z' && !event.shiftKey) {
    event.preventDefault()
    missionStore.undo()
    return
  }
  if ((key === 'z' && event.shiftKey) || key === 'y') {
    event.preventDefault()
    missionStore.redo()
  }
}

onMounted(() => {
  const stored = (() => {
    try {
      return localStorage.getItem('mavplan-web.theme') as 'light' | 'dark' | null
    } catch {
      return null
    }
  })()
  const preferred =
    stored ?? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  applyTheme(preferred)
  window.addEventListener('keydown', onGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand">
        <strong>mavplan</strong>
        <span>{{ t('app.subtitle') }}</span>
      </div>

      <nav class="tabs">
        <RouterLink to="/" :class="{ active: route.name === 'editor' }">{{ t('nav.editor') }}</RouterLink>
        <RouterLink to="/dashboard" :class="{ active: route.name === 'dashboard' }">
          {{ t('nav.dashboard') }}
        </RouterLink>
        <RouterLink to="/playback" :class="{ active: route.name === 'playback' }">
          {{ t('nav.playback') }}
        </RouterLink>
        <RouterLink to="/preflight" :class="{ active: route.name === 'preflight' }">
          {{ t('nav.preflight') }}
        </RouterLink>
        <RouterLink to="/report" :class="{ active: route.name === 'report' }">
          {{ t('nav.report') }}
        </RouterLink>
        <RouterLink to="/about" :class="{ active: route.name === 'about' }">{{ t('nav.about') }}</RouterLink>
      </nav>

      <div class="header-spacer" />

      <div class="header-meta">
        <span class="badge muted mono">{{ missionStore.stats.count }} wp</span>
        <span class="badge muted mono">{{ formatDistance(missionStore.stats.distanceM) }}</span>

        <label class="switch" :title="theme === 'dark' ? 'Light' : 'Dark'">
          <input
            type="checkbox"
            :checked="theme === 'dark'"
            @change="applyTheme(theme === 'dark' ? 'light' : 'dark')"
          />
          <span aria-hidden="true">{{ theme === 'dark' ? '☾' : '☀' }}</span>
        </label>

        <button class="btn small ghost" type="button" :title="t('shortcuts.title')" @click="helpOpen = true">
          ?
        </button>

        <button class="btn small ghost" type="button" @click="settings.toggleLocale()">
          {{ settings.locale === 'zh-CN' ? 'EN' : '中文' }}
        </button>
      </div>
    </header>

    <main class="content">
      <RouterView />
    </main>

    <ShortcutHelp :open="helpOpen" @close="helpOpen = false" />
  </div>
</template>
