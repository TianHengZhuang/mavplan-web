<script setup lang="ts">
/**
 * Flight playback view.
 *
 * Two replay modes share one set of transport controls:
 *  - plan replay: the mission is flown leg by leg in simulated time, so the
 *    numbers in the plan can be demonstrated on a projector;
 *  - log replay: a recorded CSV flight log drives the timeline and the flown
 *    track is compared with the plan — the browser twin of
 *    `mavplan analyze replay` (same haversine maths, same 1200-frame budget).
 *
 * Geometry comes from `core/flight` and `core/replay`, the same modules the
 * timeline and the CLI use.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import MapCanvas from '../components/MapCanvas.vue'
import { buildFlightPlan, cruiseElapsedS, legIndexAt, sampleFlight } from '../core/flight'
import { formatCoord, formatDistance, formatDuration, type LatLon } from '../core/geo'
import { t } from '../core/i18n'
import {
  ReplayParseError,
  compareReplayToPlan,
  frameHeading,
  frameIndexAtTime,
  parseFlightLogCsv,
  type ReplayTrack
} from '../core/replay'
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

/* --- log replay state ---------------------------------------------- */

/** Which timeline the transport controls drive. */
const mode = ref<'plan' | 'log'>('plan')
/** Parsed flight log (null until a CSV is loaded). */
const logTrack = ref<ReplayTrack | null>(null)
/** Recorded-time cursor of the log replay, in seconds. */
const logTimeS = ref(0)
/** Human readable parse failure, shown inline in the log bar. */
const logError = ref('')

const activeIndex = computed(() => legIndexAt(plan.value, progressM.value))
const activeLeg = computed(() => plan.value.legs[activeIndex.value] ?? null)
const sample = computed(() => sampleFlight(plan.value, store.waypoints, progressM.value))
const elapsedS = computed(() => cruiseElapsedS(plan.value, progressM.value))
const remainingS = computed(() => Math.max(0, totalDurationS.value - elapsedS.value))
const progressPct = computed(() =>
  totalM.value > 0 ? Math.min(100, (progressM.value / totalM.value) * 100) : 0
)

/* --- log replay derived state -------------------------------------- */

const logIndex = computed(() =>
  logTrack.value ? frameIndexAtTime(logTrack.value, logTimeS.value) : 0
)

const activeFrame = computed(() => logTrack.value?.frames[logIndex.value] ?? null)

const logCursor = computed<LatLon | null>(() =>
  activeFrame.value ? { lat: activeFrame.value.lat, lon: activeFrame.value.lon } : null
)

const logHeadingDeg = computed(() => {
  const track = logTrack.value
  if (!track) return null
  return frameHeading(track, logIndex.value)
})

/** Plan-vs-log comparison; null until a log is loaded (or the plan is too short). */
const comparison = computed(() =>
  logTrack.value ? compareReplayToPlan(logTrack.value, store.waypoints) : null
)

const logProgressPct = computed(() => {
  const track = logTrack.value
  if (!track || track.durationS <= 0) return 0
  return Math.min(100, (logTimeS.value / track.durationS) * 100)
})

/** Evenly spaced marks on the log scrubber (recorded time). */
const logTicks = computed(() => {
  const track = logTrack.value
  if (!track) return []
  return [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    ratio,
    left: `${ratio * 100}%`,
    label: formatDuration(track.durationS * ratio)
  }))
})

function signedMetres(value: number): string {
  return `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(1)} m`
}

function signedSeconds(value: number): string {
  return `${value >= 0 ? '+' : '-'}${Math.abs(value).toFixed(1)} s`
}

/* --- transport (shared by both modes) ------------------------------- */

function stop(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
  playing.value = false
}

function step(): void {
  if (mode.value === 'log') {
    const track = logTrack.value
    if (!track) {
      stop()
      return
    }
    const advance = Math.max(0.05, track.durationS / 600) * speedScale.value
    if (logTimeS.value >= track.durationS) {
      logTimeS.value = track.durationS
      stop()
      return
    }
    logTimeS.value = Math.min(track.durationS, logTimeS.value + advance)
    return
  }
  const advance = Math.max(0.5, totalM.value / 600) * speedScale.value
  if (progressM.value >= totalM.value) {
    progressM.value = totalM.value
    stop()
    return
  }
  progressM.value = Math.min(totalM.value, progressM.value + advance)
}

function start(): void {
  if (timer !== null) return
  if (mode.value === 'log') {
    const track = logTrack.value
    if (!track) return
    if (logTimeS.value >= track.durationS) logTimeS.value = 0
  } else {
    if (!plan.value.legs.length) return
    if (progressM.value >= totalM.value) progressM.value = 0
  }
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
  logTimeS.value = 0
}

function jumpToLeg(index: number): void {
  const leg = plan.value.legs[index]
  if (!leg) return
  mode.value = 'plan'
  progressM.value = leg.endM - leg.distanceM
  store.selectedSeq = leg.toSeq
}

function scrub(event: Event): void {
  progressM.value = Number((event.target as HTMLInputElement).value)
}

function scrubLog(event: Event): void {
  logTimeS.value = Number((event.target as HTMLInputElement).value)
}

/* --- log loading ---------------------------------------------------- */

function setMode(next: 'plan' | 'log'): void {
  if (next === 'log' && !logTrack.value) return
  stop()
  mode.value = next
}

async function pickLog(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  stop()
  try {
    const track = parseFlightLogCsv(await file.text(), file.name)
    logTrack.value = track
    logTimeS.value = 0
    logError.value = ''
    mode.value = 'log'
  } catch (error) {
    logTrack.value = null
    logTimeS.value = 0
    mode.value = 'plan'
    logError.value = error instanceof ReplayParseError ? error.message : String(error)
  } finally {
    input.value = ''
  }
}

function clearLog(): void {
  stop()
  logTrack.value = null
  logTimeS.value = 0
  logError.value = ''
  mode.value = 'plan'
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
        <span v-if="mode === 'plan'" class="badge muted mono">{{ formatDistance(totalM) }}</span>
        <span v-if="mode === 'plan'" class="badge muted mono">{{ formatDuration(totalDurationS) }}</span>
        <template v-if="mode === 'log' && logTrack">
          <span class="badge muted mono">{{ formatDistance(logTrack.distanceM) }}</span>
          <span class="badge muted mono">{{ formatDuration(logTrack.durationS) }}</span>
          <span class="badge muted mono">{{ logTrack.sourceName }}</span>
        </template>
        <span class="badge" v-if="mode === 'log'" :class="'ok'">{{ t('replay.modeLog') }}</span>
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
          <span v-if="mode === 'plan'" class="badge muted mono">{{ t('playback.elapsed') }} {{ formatDuration(elapsedS) }}</span>
          <span v-if="mode === 'plan'" class="badge muted mono">{{ t('playback.remaining') }} {{ formatDuration(remainingS) }}</span>
          <span v-if="mode === 'log'" class="badge muted mono">
            {{ t('playback.elapsed') }} {{ formatDuration(logTimeS) }}
          </span>
        </div>

        <div class="log-bar">
          <button
            class="btn small"
            type="button"
            :class="{ primary: mode === 'plan' }"
            :disabled="!plan.legs.length"
            @click="setMode('plan')"
          >
            {{ t('replay.modePlan') }}
          </button>
          <button
            class="btn small"
            type="button"
            :class="{ primary: mode === 'log' }"
            :disabled="!logTrack"
            @click="setMode('log')"
          >
            {{ t('replay.modeLog') }}
          </button>
          <label class="btn small">
            {{ t('replay.load') }}
            <input type="file" accept=".csv,.txt,.log" hidden @change="pickLog" />
          </label>
          <template v-if="logTrack">
            <span class="badge muted mono">{{ logTrack.sourceName }}</span>
            <span class="badge muted mono">
              {{ t('replay.points') }} {{ logTrack.sourcePoints }}/{{ logTrack.frames.length }}
            </span>
            <span v-if="logTrack.downsampled" class="badge muted">{{ t('replay.downsampled') }}</span>
            <span class="badge muted">{{ t('replay.maxAlt') }} {{ logTrack.maxAltM.toFixed(0) }} m</span>
            <span class="badge muted">{{ t('replay.avgSpeed') }} {{ logTrack.avgSpeedMps.toFixed(1) }} m/s</span>
            <button class="btn small" type="button" @click="clearLog">{{ t('replay.clear') }}</button>
          </template>
          <span v-if="logError" class="badge">{{ t('replay.error') }}{{ logError }}</span>
        </div>

        <input
          v-if="mode === 'plan'"
          class="scrubber"
          type="range"
          min="0"
          :max="Math.max(1, totalM)"
          step="1"
          :value="progressM"
          :disabled="!plan.legs.length"
          @input="scrub"
        />

        <div v-if="mode === 'plan'" class="ticks">
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

        <template v-if="mode === 'log' && logTrack">
          <input
            class="scrubber"
            type="range"
            min="0"
            :max="Math.max(0.1, logTrack.durationS)"
            step="0.1"
            :value="logTimeS"
            @input="scrubLog"
          />
          <div class="log-ticks">
            <span v-for="tick in logTicks" :key="tick.ratio" class="log-tick" :style="{ left: tick.left }">
              {{ tick.label }}
            </span>
          </div>
        </template>

        <div v-if="mode === 'plan' && !sample" class="empty">{{ t('playback.noWaypoints') }}</div>
        <div v-if="mode === 'plan' && sample" class="stats" style="margin-top: 12px">
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

        <div v-if="mode === 'log' && !activeFrame" class="empty">{{ t('replay.noTrack') }}</div>
        <div v-if="mode === 'log' && activeFrame" class="stats" style="margin-top: 12px">
          <div class="stat">
            <div class="label">{{ t('field.lat') }}</div>
            <div class="value">{{ formatCoord(activeFrame?.lat ?? 0) }}</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('field.lon') }}</div>
            <div class="value">{{ formatCoord(activeFrame?.lon ?? 0) }}</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('playback.altitude') }}</div>
            <div class="value">{{ (activeFrame?.alt ?? 0).toFixed(1) }} m</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('playback.groundSpeed') }}</div>
            <div class="value">{{ (activeFrame?.speed ?? 0).toFixed(1) }} m/s</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('replay.heading') }}</div>
            <div class="value">{{ logHeadingDeg === null ? '—' : `${logHeadingDeg.toFixed(0)}°` }}</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('replay.logDuration') }}</div>
            <div class="value">{{ logTrack ? formatDuration(logTrack.durationS) : '—' }}</div>
          </div>
        </div>

        <div v-if="mode === 'log' && comparison" class="stats" style="margin-top: 12px">
          <div class="stat">
            <div class="label">{{ t('replay.maxCrossTrack') }}</div>
            <div class="value">{{ formatDistance(comparison.maxCrossTrackM) }}</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('replay.meanCrossTrack') }}</div>
            <div class="value">{{ formatDistance(comparison.meanCrossTrackM) }}</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('replay.p90CrossTrack') }}</div>
            <div class="value">{{ formatDistance(comparison.p90CrossTrackM) }}</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('replay.maxAltError') }}</div>
            <div class="value">{{ comparison.maxAltErrorM.toFixed(1) }} m</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('replay.meanAltError') }}</div>
            <div class="value">{{ signedMetres(comparison.meanAltErrorM) }}</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('replay.distanceDelta') }}</div>
            <div class="value">{{ signedMetres(comparison.distanceDeltaM) }}</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('replay.durationDelta') }}</div>
            <div class="value">{{ signedSeconds(comparison.durationDeltaS) }}</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('replay.endOffset') }}</div>
            <div class="value">{{ formatDistance(comparison.endOffsetM) }}</div>
          </div>
          <div class="stat">
            <div class="label">{{ t('replay.compare') }}</div>
            <div class="value">{{ comparison.sampleCount }}</div>
          </div>
        </div>

        <p v-if="mode === 'plan' && plan.legs.length" class="hint">{{ t('playback.hint') }}</p>
        <p v-if="mode === 'log'" class="hint">{{ t('replay.hintLog') }}</p>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h3>{{ t('editor.map') }}</h3>
        <span class="badge muted mono">
          {{ t('playback.progress') }} {{ (mode === 'log' ? logProgressPct : progressPct).toFixed(0) }}%
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
          :track="mode === 'log' && logTrack ? logTrack.frames : []"
          :track-cursor="mode === 'log' ? logCursor : null"
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

.log-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border);
}

.log-bar label.btn {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.log-ticks {
  position: relative;
  height: 14px;
  margin-top: 2px;
}

.log-tick {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-size: 10px;
  opacity: 0.65;
  white-space: nowrap;
}

@media (max-width: 1180px) {
  .playback-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
