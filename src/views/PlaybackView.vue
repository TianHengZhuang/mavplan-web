<script setup lang="ts">
/**
 * Flight playback view.
 *
 * Replays the mission leg by leg in simulated time so the numbers in the
 * plan can be demonstrated on a projector: scrub the timeline, change the
 * replay rate and watch position, altitude and ground speed update. All the
 * geometry comes from `core/flight`, the same module the timeline uses.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import MapCanvas from '../components/MapCanvas.vue'
import { buildFlightPlan, cruiseElapsedS, legIndexAt, sampleFlight } from '../core/flight'
import { formatCoord, formatDistance, formatDuration } from '../core/geo'
import { t } from '../core/i18n'
import { useMissionStore } from '../stores/mission'
import { useSettingsStore } from '../stores/settings'
import { useFleetStore } from '../stores/fleet'

const store = useMissionStore()
const settings = useSettingsStore()
const fleetStore = useFleetStore()

const plan = computed(() => buildFlightPlan(store.waypoints))

const totalM = computed(() => plan.value.totalDistanceM)
const totalDurationS = computed(() => plan.value.totalDurationS)

const progressM = ref(0)
const speedScale = ref(1)
const playing = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

const activeIndex = computed(() => legIndexAt(plan.value, progressM.value))
const activeLeg = computed(() => plan.value.legs[activeIndex.value] ?? null)
const sample = computed(() => sampleFlight(plan.value, store.waypoints, progressM.value))
const elapsedS = computed(() => cruiseElapsedS(plan.value, progressM.value))
const remainingS = computed(() => Math.max(0, totalDurationS.value - elapsedS.value))
const progressPct = computed(() =>
  totalM.value > 0 ? Math.min(100, (progressM.value / totalM.value) * 100) : 0
)

function stop(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
  playing.value = false
}

function step(): void {
  const advance = Math.max(0.5, totalM.value / 600) * speedScale.value
  if (progressM.value >= totalM.value) {
    progressM.value = totalM.value
    stop()
    return
  }
  progressM.value = Math.min(totalM.value, progressM.value + advance)
}

function start(): void {
  if (timer !== null || !plan.value.legs.length) return
  if (progressM.value >= totalM.value) progressM.value = 0
  playing.value = true
  timer = setInterval(step, 100)
}

function toggle(): void {
  if (playing.value) stop()
  else start()
}

function reset(): void {
  stop()
  progressM.value = 0
}

function jumpToLeg(index: number): void {
  const leg = plan.value.legs[index]
  if (!leg) return
  progressM.value = leg.endM - leg.distanceM
  store.selectedSeq = leg.toSeq
}

function scrub(event: Event): void {
  progressM.value = Number((event.target as HTMLInputElement).value)
}

onBeforeUnmount(stop)
</script>

<template>
  <div class="view playback-grid">
    <section class="panel">
      <div class="panel-head">
        <h3>{{ t('playback.title') }}</h3>
        <span class="badge muted">{{ store.mission.name }}</span>
        <span class="badge muted">{{ t('fleet.drones') }} {{ fleetStore.count }}</span>
        <span v-if="fleetStore.lead" class="badge muted mono">
          {{ fleetStore.lead.name }} · {{ fleetStore.lead.model || '—' }}
        </span>
        <span class="badge muted mono">{{ formatDistance(totalM) }}</span>
        <span class="badge muted mono">{{ formatDuration(totalDurationS) }}</span>
        <span class="badge" :class="playing ? 'ok' : 'muted'">
          {{ playing ? t('playback.playing') : t('playback.paused') }}
        </span>
      </div>
      <div class="panel-body">
        <div class="toolbar">
          <button class="btn small primary" type="button" :disabled="!plan.legs.length" @click="toggle">
            {{ playing ? t('playback.pause') : t('playback.play') }}
          </button>
          <button class="btn small" type="button" :disabled="!plan.legs.length" @click="reset">
            {{ t('common.reset') }}
          </button>
          <div class="field inline">
            <label>{{ t('playback.speed') }}</label>
            <select v-model.number="speedScale">
              <option :value="1">1×</option>
              <option :value="2">2×</option>
              <option :value="4">4×</option>
              <option :value="8">8×</option>
            </select>
          </div>
          <span class="badge muted mono">{{ t('playback.activeDrone') }} {{ fleetStore.lead?.name ?? '—' }}</span>
        <span class="badge muted mono">{{ t('playback.elapsed') }} {{ formatDuration(elapsedS) }}</span>
          <span class="badge muted mono">{{ t('playback.remaining') }} {{ formatDuration(remainingS) }}</span>
        </div>

        <input
          class="scrubber"
          type="range"
          min="0"
          :max="Math.max(1, totalM)"
          step="1"
          :value="progressM"
          :disabled="!plan.legs.length"
          @input="scrub"
        />

        <div class="ticks">
          <button
            v-for="(leg, index) in plan.legs"
            :key="leg.toSeq"
            type="button"
            class="tick"
            :class="{ done: progressM >= leg.endM, active: index === activeIndex }"
            :style="{ left: `${totalM > 0 ? (leg.endM / totalM) * 100 : 0}%` }"
            :title="`#${leg.toSeq}`"
            @click="jumpToLeg(index)"
          />
        </div>

        <div v-if="!sample" class="empty">{{ t('playback.noWaypoints') }}</div>
        <div v-else class="stats" style="margin-top: 12px">
          <div class="stat">
            <div class="label">{{ t('playback.leg') }}</div>
            <div class="value">#{{ activeLeg?.fromSeq }} → #{{ activeLeg?.toSeq }}</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('field.lat') }}</div>
            <div class="value">{{ formatCoord(sample.lat) }}</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('field.lon') }}</div>
            <div class="value">{{ formatCoord(sample.lon) }}</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('playback.altitude') }}</div>
            <div class="value">{{ sample.alt.toFixed(1) }} m</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('playback.groundSpeed') }}</div>
            <div class="value">{{ sample.speed.toFixed(1) }} m/s</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('editor.bearingFromPrev') }}</div>
            <div class="value">{{ sample.bearing.toFixed(0) }}°</div>
          </div>
        </div>

        <p v-if="plan.legs.length" class="hint">{{ t('playback.hint') }}</p>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h3>{{ t('editor.map') }}</h3>
        <span class="badge muted mono">
          {{ t('playback.progress') }} {{ progressPct.toFixed(0) }}%
        </span>
      </div>
      <div class="panel-body tight">
        <MapCanvas
          :waypoints="store.waypoints"
          :home="store.home"
          :zones="settings.zones"
          :selected-seq="activeLeg ? activeLeg.toSeq : store.selectedSeq"
          :show-tiles="settings.showTiles"
          :show-grid="settings.showGrid"
          :show-labels="settings.showLabels"
          :show-zones="settings.showZones"
          :armed="false"
          @select="store.selectedSeq = $event"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.playback-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(360px, 0.9fr);
  gap: 12px;
  align-items: start;
}

.field.inline {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.field.inline select {
  width: auto;
}

.scrubber {
  width: 100%;
  margin: 12px 0 2px;
  accent-color: var(--accent);
}

.ticks {
  position: relative;
  height: 10px;
  border-top: 1px solid var(--border);
}

.tick {
  position: absolute;
  top: -4px;
  width: 2px;
  height: 8px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: var(--border);
  transform: translateX(-1px);
  cursor: pointer;
}

.tick.done {
  background: var(--ok);
}

.tick.active {
  background: var(--accent);
  height: 10px;
  top: -5px;
}

@media (max-width: 1180px) {
  .playback-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
