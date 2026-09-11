<script setup lang="ts">
/**
 * Altitude / distance profile of the mission, drawn as an inline SVG so it
 * stays readable in printouts and screen shots used by the training material.
 */
import { computed } from 'vue'
import { haversineDistance, formatDistance, formatDuration } from '../core/geo'
import { isNavigable } from '../core/actions'
import type { Waypoint } from '../core/mission'
import { t } from '../core/i18n'

const props = defineProps<{
  waypoints: Waypoint[]
  selectedSeq: number
}>()

const emit = defineEmits<{ (e: 'select', seq: number): void }>()

const WIDTH = 1000
const HEIGHT = 240
const PAD = { left: 46, right: 14, top: 14, bottom: 26 }

const profile = computed(() => {
  const points: { x: number; y: number; alt: number; seq: number; distance: number }[] = []
  let cumulative = 0
  props.waypoints.forEach((wp, index) => {
    if (index > 0) cumulative += haversineDistance(props.waypoints[index - 1], wp)
    points.push({ x: cumulative, y: wp.alt, alt: wp.alt, seq: wp.seq, distance: cumulative })
  })
  return points
})

const totalDistance = computed(() => profile.value[profile.value.length - 1]?.x ?? 0)

const scale = computed(() => {
  const maxAlt = Math.max(10, ...profile.value.map((p) => p.alt))
  const spanX = Math.max(1, totalDistance.value)
  const usableW = WIDTH - PAD.left - PAD.right
  const usableH = HEIGHT - PAD.top - PAD.bottom
  let maxY = Math.ceil((maxAlt * 1.2) / 10) * 10
  if (maxY <= 0) maxY = 10
  return {
    maxAlt: maxY,
    toX: (metres: number) => PAD.left + (metres / spanX) * usableW,
    toY: (altitude: number) => PAD.top + usableH - (Math.max(0, altitude) / maxY) * usableH,
    baseY: PAD.top + usableH
  }
})

const pathData = computed(() =>
  profile.value
    .map((p, index) => `${index === 0 ? 'M' : 'L'} ${scale.value.toX(p.x).toFixed(1)} ${scale.value.toY(p.y).toFixed(1)}`)
    .join(' ')
)

const areaData = computed(() => {
  if (!profile.value.length) return ''
  const first = profile.value[0]
  const last = profile.value[profile.value.length - 1]
  return `${pathData.value} L ${scale.value.toX(last.x).toFixed(1)} ${scale.value.baseY} L ${scale.value.toX(first.x).toFixed(1)} ${scale.value.baseY} Z`
})

const altTicks = computed(() => {
  const max = scale.value.maxAlt
  return [0, max / 4, max / 2, (max * 3) / 4, max].map((alt) => ({
    alt,
    y: scale.value.toY(alt)
  }))
})

/** Waypoints whose terrain-following/altitude changes deserve a marker. */
const markers = computed(() =>
  profile.value.map((p) => ({
    ...p,
    cx: scale.value.toX(p.x),
    cy: scale.value.toY(p.y)
  }))
)

const durationText = computed(() => formatDuration(totalDistance.value / 10 + props.waypoints.length * 5))

const climbExtremes = computed(() => {
  let max = 0
  for (let i = 1; i < props.waypoints.length; i += 1) {
    const previous = props.waypoints[i - 1]
    const current = props.waypoints[i]
    const distance = haversineDistance(previous, current)
    const speed = current.speed > 0 ? current.speed : 10
    const seconds = distance / speed
    if (seconds <= 0) continue
    max = Math.max(max, Math.abs(current.alt - previous.alt) / seconds)
  }
  return max
})
</script>

<template>
  <div class="panel">
    <div class="panel-head">
      <h3>{{ t('editor.panel.profile') }}</h3>
      <span class="badge muted mono">{{ formatDistance(totalDistance) }}</span>
      <span class="badge muted mono">{{ durationText }}</span>
      <span class="badge muted mono">max Δalt/s {{ climbExtremes.toFixed(1) }} m/s</span>
    </div>
    <div class="panel-body">
      <div v-if="!waypoints.length" class="empty">{{ t('editor.noWaypoints') }}</div>
      <svg v-else :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" class="profile">
        <g class="ticks">
          <g v-for="tick in altTicks" :key="tick.alt">
            <line :x1="PAD.left" :x2="WIDTH - PAD.right" :y1="tick.y" :y2="tick.y" />
            <text :x="PAD.left - 8" :y="tick.y + 4" text-anchor="end">{{ tick.alt.toFixed(0) }}</text>
          </g>
        </g>

        <path :d="areaData" class="area" />
        <path :d="pathData" class="line" />

        <g class="markers">
          <circle
            v-for="marker in markers"
            :key="marker.seq"
            :cx="marker.cx"
            :cy="marker.cy"
            :r="marker.seq === selectedSeq ? 7 : 4.6"
            :class="{ selected: marker.seq === selectedSeq, action: !isNavigable(waypoints[marker.seq].command) }"
            @click="emit('select', marker.seq)"
          >
            <title>WP{{ marker.seq }} · {{ marker.alt.toFixed(0) }} m @ {{ formatDistance(marker.distance) }}</title>
          </circle>
        </g>

        <g class="axis">
          <line :x1="PAD.left" :x2="WIDTH - PAD.right" :y1="scale.baseY" :y2="scale.baseY" />
          <text :x="PAD.left" :y="HEIGHT - 8">{{ formatDistance(0) }}</text>
          <text :x="WIDTH - PAD.right" :y="HEIGHT - 8" text-anchor="end">{{ formatDistance(totalDistance) }}</text>
        </g>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.profile {
  display: block;
  width: 100%;
  height: auto;
}

.ticks line {
  stroke: var(--border);
  stroke-dasharray: 4 4;
}

.ticks text,
.axis text {
  fill: var(--muted);
  font-size: 13px;
  font-family: var(--mono);
}

.area {
  fill: var(--accent-soft);
}

.line {
  fill: none;
  stroke: var(--accent);
  stroke-width: 2.4;
  stroke-linejoin: round;
}

.markers circle {
  fill: var(--panel);
  stroke: var(--accent);
  stroke-width: 2.4;
  cursor: pointer;
}

.markers circle.selected {
  fill: var(--accent);
  stroke: #fff;
}

.markers circle.action {
  stroke: var(--warn);
  stroke-dasharray: 2 2;
}

.axis line {
  stroke: var(--border);
}
</style>
