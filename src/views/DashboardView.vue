<script setup lang="ts">
/**
 * Mission dashboard.
 *
 * One screen that answers "is this mission ready to brief?" — KPI tiles,
 * validation findings, the longest legs and the altitude band, all derived
 * from the current store state (no extra data entry).
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { isNavigable } from '../core/actions'
import { bearingDeg, formatDistance, formatDuration, haversineDistance } from '../core/geo'
import { t } from '../core/i18n'
import { useMissionStore } from '../stores/mission'
import { useSettingsStore } from '../stores/settings'
import { useFleetStore } from '../stores/fleet'
import FleetPanel from '../components/FleetPanel.vue'

const store = useMissionStore()
const settings = useSettingsStore()
const fleetStore = useFleetStore()

const stats = computed(() => store.stats)

const averageSpeed = computed(() => {
  const list = store.waypoints.filter((wp) => isNavigable(wp.command) && wp.speed > 0)
  if (!list.length) return settings.params.cruiseSpeed
  return list.reduce((total, wp) => total + wp.speed, 0) / list.length
})

const altitudeBand = computed(() => {
  const list = store.waypoints
  if (!list.length) return { min: 0, max: 0, spread: 0 }
  return {
    min: stats.value.minAltitudeM,
    max: stats.value.maxAltitudeM,
    spread: stats.value.maxAltitudeM - stats.value.minAltitudeM
  }
})

const longestLegs = computed(() => {
  const list = store.waypoints
  const legs: { seq: number; distanceM: number; bearing: number }[] = []
  for (let i = 1; i < list.length; i += 1) {
    legs.push({
      seq: list[i].seq,
      distanceM: haversineDistance(list[i - 1], list[i]),
      bearing: bearingDeg(list[i - 1], list[i])
    })
  }
  return legs.sort((a, b) => b.distanceM - a.distanceM).slice(0, 5)
})

const altitudeWarnings = computed(() => {
  const limit = settings.params.maxAltitudeM
  return store.waypoints.filter((wp) => wp.alt > limit).length
})

const distanceWarnings = computed(() => {
  if (!store.home) return 0
  const home = { lat: store.home[0], lon: store.home[1] }
  const limit = settings.params.maxDistanceM
  return store.waypoints.filter((wp) => haversineDistance(home, wp) > limit).length
})

const issues = computed(() => store.issues)
</script>

<template>
  <div class="view dashboard">
    <section class="panel">
      <div class="panel-head">
        <h3>{{ t('dashboard.title') }}</h3>
        <span class="badge muted mono">{{ store.mission.name }}</span>
        <div class="header-spacer" style="flex: 1" />
        <RouterLink class="btn small" to="/">{{ t('dashboard.openEditor') }}</RouterLink>
        <RouterLink class="btn small" to="/preflight">{{ t('nav.preflight') }}</RouterLink>
      </div>
      <div class="panel-body">
        <div class="stats tiles">
          <div class="stat">
            <div class="label">{{ t('dashboard.kpi.waypoints') }}</div>
            <div class="value">{{ stats.count }}</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('dashboard.kpi.navigable') }}</div>
            <div class="value">{{ stats.navigable }}</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('dashboard.kpi.actions') }}</div>
            <div class="value">{{ stats.actions }}</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('dashboard.kpi.distance') }}</div>
            <div class="value">{{ formatDistance(stats.distanceM) }}</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('dashboard.kpi.duration') }}</div>
            <div class="value">{{ formatDuration(stats.durationS) }}</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('fleet.drones') }}</div>
            <div class="value">{{ fleetStore.count }}</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('dashboard.kpi.avgSpeed') }}</div>
            <div class="value">{{ averageSpeed.toFixed(1) }} m/s</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('dashboard.kpi.altitude') }}</div>
            <div class="value">{{ altitudeBand.min.toFixed(0) }}–{{ altitudeBand.max.toFixed(0) }} m</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('dashboard.kpi.spread') }}</div>
            <div class="value">{{ altitudeBand.spread.toFixed(0) }} m</div>
          </div>
        </div>

        <div class="readiness">
          <span class="badge" :class="issues.length ? 'warning' : 'ok'">
            {{ issues.length ? `${t('io.validationErrors')} · ${issues.length}` : t('dashboard.noIssues') }}
          </span>
          <span class="badge" :class="altitudeWarnings ? 'error' : 'muted'">
            {{ t('dashboard.altitudeLimit') }} {{ altitudeWarnings }}
          </span>
          <span class="badge" :class="distanceWarnings ? 'error' : 'muted'">
            {{ t('dashboard.distanceLimit') }} {{ distanceWarnings }}
          </span>
          <span class="badge muted mono">
            {{ t('dashboard.cruiseSpeed') }} {{ settings.params.cruiseSpeed.toFixed(1) }} m/s
          </span>
        </div>

        <div v-if="issues.length" class="findings" style="margin-top: 10px">
          <div v-for="(issue, index) in issues" :key="index" class="finding warning">
            <span class="seq mono">#{{ index + 1 }}</span>
            <span>{{ issue }}</span>
          </div>
        </div>
      </div>
    </section>

    <FleetPanel />

    <section class="panel">
      <div class="panel-head">
        <h3>{{ t('dashboard.longestLegs') }}</h3>
        <span class="badge muted mono">{{ t('editor.legDistance') }}</span>
      </div>
      <div class="panel-body">
        <div v-if="!longestLegs.length" class="empty">{{ t('dashboard.empty') }}</div>
        <div v-else class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{{ t('dashboard.leg') }}</th>
                <th>{{ t('editor.legDistance') }}</th>
                <th>{{ t('editor.bearingFromPrev') }}</th>
                <th>{{ t('editor.maxAltitude') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="leg in longestLegs"
                :key="leg.seq"
                :class="{ selected: leg.seq === store.selectedSeq }"
                @click="store.selectedSeq = leg.seq"
              >
                <td class="mono">#{{ leg.seq - 1 }} → #{{ leg.seq }}</td>
                <td class="mono">{{ formatDistance(leg.distanceM) }}</td>
                <td class="mono">{{ leg.bearing.toFixed(0) }}°</td>
                <td class="mono">{{ store.waypoints[leg.seq].alt.toFixed(0) }} m</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dashboard {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(340px, 0.9fr);
  gap: 12px;
  align-items: start;
}

.dashboard > .fleet-panel {
  grid-column: 1 / -1;
}

.tiles {
  grid-template-columns: repeat(auto-fit, minmax(136px, 1fr));
}

.readiness {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

@media (max-width: 1180px) {
  .dashboard {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
