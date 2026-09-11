<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useMissionStore } from './stores/mission'
import { useSettingsStore } from './stores/settings'
import { t } from './core/i18n'

const missionStore = useMissionStore()
const settings = useSettingsStore()
const route = useRoute()
const theme = ref<'light' | 'dark'>('light')

function applyTheme(next: 'light' | 'dark'): void {
  theme.value = next
  document.documentElement.dataset.theme = next
  try {
    localStorage.setItem('mavplan-web.theme', next)
  } catch {
    /* ignore */
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
})
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand">
        <strong>{{ t('app.title') }}</strong>
        <span>{{ t('app.subtitle') }}</span>
      </div>

      <nav class="tabs">
        <RouterLink to="/" :class="{ active: route.name === 'editor' }">{{ t('nav.editor') }}</RouterLink>
        <RouterLink to="/preflight" :class="{ active: route.name === 'preflight' }">
          {{ t('nav.preflight') }}
        </RouterLink>
        <RouterLink to="/about" :class="{ active: route.name === 'about' }">{{ t('nav.about') }}</RouterLink>
      </nav>

      <div class="header-spacer" />

      <span class="badge muted mono">{{ missionStore.stats.count }} wp</span>
      <span class="badge muted mono">{{ (missionStore.stats.distanceM / 1000).toFixed(2) }} km</span>

      <label class="switch">
        <input
          type="checkbox"
          :checked="theme === 'dark'"
          @change="applyTheme(theme === 'dark' ? 'light' : 'dark')"
        />
        {{ theme === 'dark' ? 'Dark' : 'Light' }}
      </label>

      <button class="btn small" type="button" @click="settings.toggleLocale()">
        {{ settings.locale === 'zh-CN' ? 'EN' : '中文' }}
      </button>
    </header>

    <main class="content">
      <RouterView />
    </main>
  </div>
</template>
