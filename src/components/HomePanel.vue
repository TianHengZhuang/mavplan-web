<script setup lang="ts">
/**
 * HOME (launch point) panel.
 *
 * HOME drives two safety numbers — the distance limit checked during
 * preflight and the leg flown by RTL — so it gets its own panel with an
 * editable coordinate pair and a live range table.
 */
import { computed, ref, watch } from 'vue'
import { bearingDeg, formatDistance, haversineDistance } from '../core/geo'
import { t } from '../core/i18n'
import { useMissionStore } from '../stores/mission'
import { useSettingsStore } from '../stores/settings'

const store = useMissionStore()
const settings = useSettingsStore()

const lat = ref(0)
const lon = ref(0)
const alt = ref(0)

watch(
  () => store.home,
  (home) => {
    lat.value = home ? home[0] : 0
    lon.value = home ? home[1] : 0
    alt.value = home ? home[2] : 0
  },
  { immediate: true, deep: true }
)

const limitM = computed(() => settings.params.maxDistanceM)

const rows = computed(() => {
  const home = store.home
  return store.waypoints.map((wp) => {
    if (!home) return { seq: wp.seq, distanceM: 0, bearing: 0, exceeds: false }
    const distanceM = haversineDistance({ lat: home[0], lon: home[1] }, wp)
    return {
      seq: wp.seq,
      distanceM,
      bearing: bearingDeg({ lat: home[0], lon: home[1] }, wp),
      exceeds: distanceM > limitM.value
    }
  })
})

const farthest = computed(() => rows.value.reduce((max, row) => Math.max(max, row.distanceM), 0))
const outOfRange = computed(() => rows.value.filter((row) => row.exceeds).length)

function compass(bearing: number): string {
  const sectors = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return sectors[Math.round(bearing / 45) % 8]
}

function apply(): void {
  store.setHome(lat.value, lon.value, alt.value)
}

function fromSelected(): void {
  if (!store.waypoints.length) return
  store.setHomeFrom(store.selectedSeq)
}

function clear(): void {
  store.mission.home = null
}

function rtl(): void {
  store.addReturnToLaunch()
}
</script>

<template>
  <div class="panel">
    <div class="panel-head">
      <h3>{{ t('home.title') }}</h3>
      <span class="badge" :class="store.home ? 'ok' : 'muted'">
        {{ store.home ? t('editor.home') : t('home.missing') }}
      </span>
      <span v-if="store.home" class="badge muted mono">
        {{ store.home[0].toFixed(5) }}, {{ store.home[1].toFixed(5) }} · {{ store.home[2].toFixed(0) }} m
      </span>
      <div class="header-spacer" style="flex: 1" />
      <span v-if="outOfRange" class="badge warning">{{ outOfRange }} × {{ t('home.exceeds') }}</span>
    </div>
    <div class="panel-body">
      <div class="field-row">
        <div class="field">
          <label>Latitude</label>
          <input v-model.number="lat" type="number" step="0.000001" />
        </div>
        <div class="field">
          <label>Longitude</label>
          <input v-model.number="lon" type="number" step="0.000001" />
        </div>
        <div class="field">
          <label>{{ t('home.altitude') }}</label>
          <input v-model.number="alt" type="number" step="1" min="0" />
        </div>
      </div>

      <div class="toolbar" style="margin-top: 10px">
        <button class="btn small primary" type="button" @click="apply">{{ t('home.apply') }}</button>
        <button class="btn small" type="button" :disabled="!store.waypoints.length" @click="fromSelected">
          {{ t('home.useSelected') }} · #{{ store.selectedSeq }}
        </button>
        <button class="btn small" type="button" :disabled="!store.waypoints.length" @click="rtl">
          {{ t('home.rtl') }}
        </button>
        <button class="btn small danger" type="button" :disabled="!store.home" @click="clear">
          {{ t('home.clear') }}
        </button>
      </div>

      <div v-if="!store.home" class="empty">{{ t('home.hint') }}</div>
      <div v-else class="table-wrap range" style="margin-top: 10px">
        <table>
          <thead>
            <tr>
              <th>{{ t('editor.seq') }}</th>
              <th>{{ t('home.distance') }}</th>
              <th>{{ t('home.bearing') }}</th>
              <th>{{ t('editor.maxAltitude') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.seq"
              :class="{ selected: row.seq === store.selectedSeq }"
              @click="store.selectedSeq = row.seq"
            >
              <td class="mono">#{{ row.seq }}</td>
              <td class="mono" :class="{ over: row.exceeds }">{{ formatDistance(row.distanceM) }}</td>
              <td class="mono">{{ compass(row.bearing) }} {{ row.bearing.toFixed(0) }}°</td>
              <td class="mono">{{ store.waypoints[row.seq].alt.toFixed(0) }} m</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="store.home" class="hint">
        {{ t('home.farthest') }} {{ formatDistance(farthest) }} · {{ t('home.limit') }}
        {{ formatDistance(limitM) }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.range {
  max-height: 240px;
}

td.over {
  color: var(--warn);
  font-weight: 600;
}
</style>
