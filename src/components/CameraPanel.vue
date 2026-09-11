<script setup lang="ts">
/**
 * Camera / payload planning panel.
 *
 * Computes the ground footprint and GSD from altitude + field of view, then
 * turns the chosen trigger mode into the matching MAV_CMD insertion so the
 * aerial-photography lesson can be flown straight from the console.
 */
import { computed, ref } from 'vue'
import {
  DO_SET_CAM_TRIGG_DIST,
  DO_SET_CAM_TRIGG_INTERVAL,
  commandName
} from '../core/actions'
import {
  dataVolumeGb,
  estimatePhotoCount,
  footprintWidthM,
  forwardOverlapPct as overlapPct,
  groundSampleDistanceCm,
  spacingForOverlapM
} from '../core/camera'
import { formatDistance, formatDuration } from '../core/geo'
import { t } from '../core/i18n'
import { useMissionStore } from '../stores/mission'

const store = useMissionStore()

const mode = ref<'distance' | 'time'>('distance')
const triggerDistanceM = ref(30)
const triggerIntervalS = ref(5)
const altitudeM = ref(80)
const fovDeg = ref(84)
const sensorPx = ref(5472)
const coverageTargetPct = ref(70)

const footprintM = computed(() => footprintWidthM(altitudeM.value, fovDeg.value))
const gsdCm = computed(() => groundSampleDistanceCm(footprintM.value, sensorPx.value))
const photoCount = computed(() =>
  estimatePhotoCount(mode.value, store.stats.distanceM, store.stats.durationS,
    mode.value === 'distance' ? triggerDistanceM.value : triggerIntervalS.value)
)
const forwardOverlapPct = computed(() =>
  mode.value === 'distance' ? overlapPct(triggerDistanceM.value, footprintM.value) : 0
)
const spacingForTarget = computed(() =>
  spacingForOverlapM(footprintM.value, coverageTargetPct.value)
)
const dataVolumeMb = computed(() => dataVolumeGb(photoCount.value))

const existing = computed(() =>
  store.waypoints.filter(
    (wp) => wp.command === DO_SET_CAM_TRIGG_DIST || wp.command === DO_SET_CAM_TRIGG_INTERVAL
  )
)

function insert(): void {
  const seq = store.selectedSeq
  if (mode.value === 'distance') {
    store.insertCameraTrigger(seq, 'distance', triggerDistanceM.value)
  } else {
    store.insertCameraTrigger(seq, 'time', triggerIntervalS.value)
  }
}

function preset(distance: number, altitude: number): void {
  triggerDistanceM.value = distance
  altitudeM.value = altitude
  mode.value = 'distance'
}

function triggerValue(command: number): string {
  if (command === DO_SET_CAM_TRIGG_DIST) return formatDistance(triggerDistanceM.value)
  return formatDuration(triggerIntervalS.value)
}
</script>

<template>
  <div class="panel">
    <div class="panel-head">
      <h3>{{ t('camera.title') }}</h3>
      <span class="badge muted mono">{{ photoCount }} {{ t('camera.photos') }}</span>
      <span class="badge muted mono">GSD {{ gsdCm.toFixed(1) }} cm/px</span>
      <div class="header-spacer" style="flex: 1" />
      <span class="badge" :class="forwardOverlapPct >= coverageTargetPct ? 'ok' : 'warning'">
        {{ t('camera.overlap') }} {{ forwardOverlapPct.toFixed(0) }}%
      </span>
    </div>
    <div class="panel-body">
      <div class="field-row">
        <div class="field">
          <label>{{ t('camera.mode') }}</label>
          <select v-model="mode">
            <option value="distance">{{ t('camera.byDistance') }}</option>
            <option value="time">{{ t('camera.byTime') }}</option>
          </select>
        </div>
        <div class="field">
          <label>{{ mode === 'distance' ? t('camera.distance') : t('camera.interval') }}</label>
          <input
            v-if="mode === 'distance'"
            v-model.number="triggerDistanceM"
            type="number"
            min="1"
            step="1"
          />
          <input v-else v-model.number="triggerIntervalS" type="number" min="1" step="0.5" />
        </div>
        <div class="field">
          <label>{{ t('camera.altitude') }}</label>
          <input v-model.number="altitudeM" type="number" min="5" step="5" />
        </div>
      </div>

      <div class="field-row" style="margin-top: 10px">
        <div class="field">
          <label>{{ t('camera.fov') }}</label>
          <input v-model.number="fovDeg" type="number" min="10" max="170" step="1" />
        </div>
        <div class="field">
          <label>{{ t('camera.sensor') }}</label>
          <input v-model.number="sensorPx" type="number" min="640" step="1" />
        </div>
        <div class="field">
          <label>{{ t('camera.target') }}</label>
          <input v-model.number="coverageTargetPct" type="number" min="0" max="95" step="5" />
        </div>
      </div>

      <div class="stats" style="margin-top: 10px">
        <div class="stat">
          <div class="label">{{ t('camera.footprint') }}</div>
          <div class="value">{{ formatDistance(footprintM) }}</div>
        </div>
        <div class="stat">
          <div class="label">{{ t('camera.gsd') }}</div>
          <div class="value">{{ gsdCm.toFixed(1) }} cm</div>
        </div>
        <div class="stat">
          <div class="label">{{ t('camera.photos') }}</div>
          <div class="value">{{ photoCount }}</div>
        </div>
        <div class="stat">
          <div class="label">{{ t('camera.spacing') }}</div>
          <div class="value">{{ spacingForTarget.toFixed(1) }} m</div>
        </div>
        <div class="stat">
          <div class="label">{{ t('camera.volume') }}</div>
          <div class="value">{{ dataVolumeMb.toFixed(2) }} GB</div>
        </div>
      </div>

      <div class="toolbar" style="margin-top: 10px">
        <button class="btn small primary" type="button" @click="insert">
          {{ t('camera.insert') }} · #{{ store.selectedSeq }}
        </button>
        <button class="btn small ghost" type="button" @click="preset(20, 60)">
          {{ t('camera.presets') }} 20 m / 60 m
        </button>
        <button class="btn small ghost" type="button" @click="preset(30, 80)">
          {{ t('camera.presets') }} 30 m / 80 m
        </button>
        <button class="btn small ghost" type="button" @click="preset(50, 120)">
          {{ t('camera.presets') }} 50 m / 120 m
        </button>
      </div>

      <div v-if="existing.length" class="existing" style="margin-top: 10px">
        <div class="sub-title">{{ t('camera.existing') }}</div>
        <ul>
          <li v-for="wp in existing" :key="wp.seq" class="mono">
            #{{ wp.seq }} · {{ commandName(wp.command) }} ·
            {{ wp.command === DO_SET_CAM_TRIGG_DIST ? t('camera.byDistance') : t('camera.byTime') }}
            {{ triggerValue(wp.command) }}
          </li>
        </ul>
      </div>
      <p v-else class="hint">{{ t('camera.none') }}</p>
      <p class="hint">{{ t('camera.hint') }}</p>
    </div>
  </div>
</template>

<style scoped>
.sub-title {
  color: var(--muted);
  font-size: 11.5px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 4px;
}

.existing ul {
  margin: 0;
  padding-left: 16px;
  font-size: 12px;
  color: var(--text);
}

.existing li {
  line-height: 1.7;
}
</style>
