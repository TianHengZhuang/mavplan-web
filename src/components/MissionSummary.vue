<script setup lang="ts">
/**
 * Compact mission readiness card for the editor left column — fills the
 * vertical gap under the timeline with the same numbers the dashboard uses.
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { formatDistance, formatDuration } from '../core/geo'
import { t } from '../core/i18n'
import { useMissionStore } from '../stores/mission'
import { useSettingsStore } from '../stores/settings'

const store = useMissionStore()
const settings = useSettingsStore()

const altitudeOk = computed(
  () => store.waypoints.filter((wp) => wp.alt > settings.params.maxAltitudeM).length
)
const zoneCount = computed(() => settings.zones.length)
const taskName = computed(() => settings.taskBrief?.name ?? '')
</script>

<template>
  <div class="panel">
    <div class="panel-head">
      <h3>{{ t('summary.title') }}</h3>
      <span class="badge" :class="store.issues.length ? 'warning' : 'ok'">
        {{ store.issues.length ? t('summary.needFix', { n: store.issues.length }) : t('summary.ready') }}
      </span>
      <div class="header-spacer" style="flex: 1" />
      <RouterLink class="btn small" to="/preflight">{{ t('summary.openPreflight') }}</RouterLink>
      <RouterLink class="btn small ghost" to="/report">{{ t('summary.openReport') }}</RouterLink>
    </div>
    <div class="panel-body">
      <div class="stats">
        <div class="stat">
          <div class="label">{{ t('editor.waypointCount') }}</div>
          <div class="value">{{ store.stats.count }}</div>
        </div>
        <div class="stat">
          <div class="label">{{ t('editor.totalDistance') }}</div>
          <div class="value">{{ formatDistance(store.stats.distanceM) }}</div>
        </div>
        <div class="stat">
          <div class="label">{{ t('editor.estimatedDuration') }}</div>
          <div class="value">{{ formatDuration(store.stats.durationS) }}</div>
        </div>
        <div class="stat">
          <div class="label">{{ t('editor.maxAltitude') }}</div>
          <div class="value">{{ store.stats.maxAltitudeM.toFixed(0) }} m</div>
        </div>
        <div class="stat">
          <div class="label">{{ t('nav.preflight') }}</div>
          <div class="value">{{ zoneCount }} · {{ altitudeOk }}</div>
        </div>
        <div class="stat">
          <div class="label">{{ t('task.brief') }}</div>
          <div class="value short">{{ taskName || '—' }}</div>
        </div>
      </div>
      <div v-if="store.issues.length" class="issues">
        <div v-for="(issue, index) in store.issues.slice(0, 4)" :key="index" class="finding warning">
          <span class="mono">#{{ index + 1 }}</span>
          <span>{{ issue }}</span>
        </div>
      </div>
      <p v-else class="hint">{{ t('dashboard.noIssues') }}</p>
    </div>
  </div>
</template>

<style scoped>
.issues {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.value.short {
  font-size: 12px;
  font-family: inherit;
  font-weight: 550;
}
</style>
