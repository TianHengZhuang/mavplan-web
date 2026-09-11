<script setup lang="ts">
/**
 * Vector map canvas.
 *
 * Everything is drawn as SVG in a local east/north metre frame centred on
 * `center`, so the console renders crisply and fully offline.  An optional
 * OpenStreetMap raster layer can be switched on when a network is available.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  type LatLon,
  clamp,
  fromLocalXY,
  latToTileY,
  lonToTileX,
  metersPerDegLon,
  tileXToLon,
  tileYToLat,
  toLocalXY,
  toRad
} from '../core/geo'
import { isNavigable } from '../core/actions'
import type { Waypoint } from '../core/mission'
import type { Zone } from '../core/preflight'

const props = defineProps<{
  waypoints: Waypoint[]
  home: [number, number, number] | null
  zones: Zone[]
  selectedSeq: number
  showTiles: boolean
  showGrid: boolean
  showLabels: boolean
  showZones: boolean
  /** When true a click on the map adds a waypoint. */
  armed: boolean
}>()

const emit = defineEmits<{
  (e: 'add-waypoint', lat: number, lon: number): void
  (e: 'select', seq: number): void
  (e: 'move-waypoint', seq: number, lat: number, lon: number): void
}>()

const container = ref<HTMLElement | null>(null)
const size = ref({ w: 900, h: 520 })
const pxPerMeter = ref(0.35)
const center = ref<LatLon>({ lat: 22.8175, lon: 108.3165 })
const cursor = ref<LatLon | null>(null)
const dragging = ref(false)

interface DragState {
  mode: 'none' | 'pan' | 'marker'
  seq: number
  startClientX: number
  startClientY: number
  startCenter: LatLon
  moved: boolean
}

const drag: DragState = {
  mode: 'none',
  seq: -1,
  startClientX: 0,
  startClientY: 0,
  startCenter: center.value,
  moved: false
}

let resizeObserver: ResizeObserver | null = null

/* --- projection ---------------------------------------------------- */

const halfW = computed(() => size.value.w / (2 * pxPerMeter.value))
const halfH = computed(() => size.value.h / (2 * pxPerMeter.value))
const viewBox = computed(() => `${-halfW.value} ${-halfH.value} ${halfW.value * 2} ${halfH.value * 2}`)

/** Screen/view units for a geographic point (y is flipped: north is up). */
function project(point: LatLon): { x: number; y: number } {
  const local = toLocalXY(center.value, point)
  return { x: local.x, y: -local.y }
}

function unproject(x: number, y: number): LatLon {
  return fromLocalXY(center.value, { x, y: -y })
}

/** Convert a screen-pixel length into view units. */
function px(pixels: number): number {
  return pixels / pxPerMeter.value
}

/* --- rendering helpers --------------------------------------------- */

const pathPoints = computed(() =>
  props.waypoints.map((wp) => {
    const p = project(wp)
    return `${p.x.toFixed(2)},${p.y.toFixed(2)}`
  })
)

const legs = computed(() => {
  const result: { x: number; y: number; bearing: number }[] = []
  for (let i = 0; i + 1 < props.waypoints.length; i += 1) {
    const a = project(props.waypoints[i])
    const b = project(props.waypoints[i + 1])
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const bearing = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI
    result.push({ x: mid.x, y: mid.y, bearing })
  }
  return result
})

const gridLines = computed(() => {
  if (!props.showGrid) return { vertical: [] as number[], horizontal: [] as number[], spacing: 0 }
  const spacing = niceSpacing(pxPerMeter.value, 90)
  const vertical: number[] = []
  const horizontal: number[] = []
  const start = Math.ceil(-halfW.value / spacing) * spacing
  for (let x = start; x <= halfW.value; x += spacing) vertical.push(x)
  const startY = Math.ceil(-halfH.value / spacing) * spacing
  for (let y = startY; y <= halfH.value; y += spacing) horizontal.push(y)
  return { vertical, horizontal, spacing }
})

const scaleBar = computed(() => {
  const candidates = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
  let chosen = candidates[0]
  for (const candidate of candidates) {
    if (candidate * pxPerMeter.value <= 150) chosen = candidate
  }
  return { metres: chosen, width: chosen * pxPerMeter.value }
})

const zoneShapes = computed(() => {
  if (!props.showZones) return []
  return props.zones.map((zone) => {
    if (zone.kind === 'circle') {
      const p = project({ lat: zone.lat, lon: zone.lon })
      return {
        id: zone.id,
        name: zone.name,
        kind: 'circle' as const,
        cx: p.x,
        cy: p.y,
        r: zone.radiusM
      }
    }
    return {
      id: zone.id,
      name: zone.name,
      kind: 'polygon' as const,
      points: zone.vertices
        .map((vertex) => {
          const p = project(vertex)
          return `${p.x.toFixed(2)},${p.y.toFixed(2)}`
        })
        .join(' ')
    }
  })
})

const homeMarker = computed(() => {
  if (props.home) {
    const p = project({ lat: props.home[0], lon: props.home[1] })
    return { x: p.x, y: p.y, label: 'H' }
  }
  const first = props.waypoints[0]
  if (!first) return null
  const p = project(first)
  return { x: p.x, y: p.y, label: 'H' }
})

function niceSpacing(scale: number, targetPixels: number): number {
  const raw = targetPixels / scale
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-6)))
  for (const factor of [1, 2, 5, 10]) {
    if (raw <= magnitude * factor) return magnitude * factor
  }
  return magnitude * 10
}

/* --- OpenStreetMap raster layer ------------------------------------ */

const tiles = computed(() => {
  if (!props.showTiles || !props.waypoints.length) return []
  const metresPerPixel = 1 / pxPerMeter.value
  const resolution = (156543.03392 * Math.cos(toRad(center.value.lat))) / metresPerPixel
  const zoom = clamp(Math.round(Math.log2(resolution)), 2, 18)
  const northWest = unproject(-halfW.value, -halfH.value)
  const southEast = unproject(halfW.value, halfH.value)
  const x0 = Math.floor(lonToTileX(northWest.lon, zoom))
  const x1 = Math.floor(lonToTileX(southEast.lon, zoom))
  const y0 = Math.floor(latToTileY(northWest.lat, zoom))
  const y1 = Math.floor(latToTileY(southEast.lat, zoom))
  const maxIndex = 2 ** zoom
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 120) return []
  const result: { href: string; x: number; y: number; width: number; height: number }[] = []
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      if (x < 0 || y < 0 || x >= maxIndex || y >= maxIndex) continue
      const west = tileXToLon(x, zoom)
      const east = tileXToLon(x + 1, zoom)
      const north = tileYToLat(y, zoom)
      const south = tileYToLat(y + 1, zoom)
      const northWestPoint = project({ lat: north, lon: west })
      const southEastPoint = project({ lat: south, lon: east })
      result.push({
        href: `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`,
        x: northWestPoint.x,
        y: northWestPoint.y,
        width: southEastPoint.x - northWestPoint.x,
        height: southEastPoint.y - northWestPoint.y
      })
    }
  }
  return result
})

/* --- interaction ---------------------------------------------------- */

function toViewUnits(clientX: number, clientY: number): { x: number; y: number } {
  const element = container.value
  if (!element) return { x: 0, y: 0 }
  const rect = element.getBoundingClientRect()
  return {
    x: ((clientX - rect.left) / rect.width) * halfW.value * 2 - halfW.value,
    y: ((clientY - rect.top) / rect.height) * halfH.value * 2 - halfH.value
  }
}

function fit(): void {
  const points: LatLon[] = props.waypoints.map((wp) => ({ lat: wp.lat, lon: wp.lon }))
  if (props.home) points.push({ lat: props.home[0], lon: props.home[1] })
  for (const zone of props.zones) {
    if (zone.kind === 'circle') points.push({ lat: zone.lat, lon: zone.lon })
    else points.push(...zone.vertices)
  }
  if (!points.length) return
  const lats = points.map((p) => p.lat)
  const lons = points.map((p) => p.lon)
  const latSpan = Math.max(...lats) - Math.min(...lats)
  const lonSpan = Math.max(...lons) - Math.min(...lons)
  center.value = { lat: (Math.max(...lats) + Math.min(...lats)) / 2, lon: (Math.max(...lons) + Math.min(...lons)) / 2 }
  const spanNorth = Math.max(latSpan * 111320, 40)
  const spanEast = Math.max(lonSpan * metersPerDegLon(center.value.lat), 40)
  pxPerMeter.value = clamp(
    Math.min(size.value.w / (spanEast * 1.35), size.value.h / (spanNorth * 1.35)),
    0.02,
    20
  )
}

function onPointerDown(event: PointerEvent): void {
  const target = event.target as Element | null
  const marker = target?.closest?.('[data-wp-seq]') as HTMLElement | null
  drag.moved = false
  drag.startClientX = event.clientX
  drag.startClientY = event.clientY
  drag.startCenter = { ...center.value }
  if (marker) {
    drag.mode = 'marker'
    drag.seq = Number(marker.dataset.wpSeq)
    emit('select', drag.seq)
  } else {
    drag.mode = 'pan'
    drag.seq = -1
  }
  dragging.value = true
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

function onPointerMove(event: PointerEvent): void {
  const view = toViewUnits(event.clientX, event.clientY)
  cursor.value = unproject(view.x, view.y)

  const dx = event.clientX - drag.startClientX
  const dy = event.clientY - drag.startClientY
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true

  if (drag.mode === 'pan') {
    center.value = fromLocalXY(drag.startCenter, {
      x: -dx / pxPerMeter.value,
      y: dy / pxPerMeter.value
    })
  } else if (drag.mode === 'marker' && drag.seq >= 0) {
    const point = unproject(view.x, view.y)
    emit('move-waypoint', drag.seq, point.lat, point.lon)
  }
}

function onPointerUp(): void {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  const wasMarker = drag.mode === 'marker'
  const wasClick = !drag.moved
  dragging.value = false
  if (drag.mode === 'pan' && wasClick && props.armed) {
    const target = cursor.value
    if (target) emit('add-waypoint', target.lat, target.lon)
  }
  drag.mode = 'none'
  drag.seq = wasMarker ? drag.seq : -1
}

function onWheel(event: WheelEvent): void {
  event.preventDefault()
  const view = toViewUnits(event.clientX, event.clientY)
  const world = unproject(view.x, view.y)
  const before = toLocalXY(center.value, world)
  const factor = Math.exp(-event.deltaY * 0.0014)
  pxPerMeter.value = clamp(pxPerMeter.value * factor, 0.02, 40)
  center.value = fromLocalXY(center.value, {
    x: before.x - view.x,
    y: before.y + view.y
  })
}

function onPointerLeave(): void {
  cursor.value = null
}

function markerRadius(): number {
  return px(6)
}

defineExpose({ fit })

onMounted(() => {
  const element = container.value
  if (element) {
    size.value = { w: element.clientWidth, h: element.clientHeight }
    resizeObserver = new ResizeObserver(() => {
      size.value = { w: element.clientWidth, h: element.clientHeight }
    })
    resizeObserver.observe(element)
  }
  fit()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
})
</script>

<template>
  <div ref="container" class="map-canvas" :class="{ armed }">
    <svg
      :viewBox="viewBox"
      preserveAspectRatio="xMidYMid slice"
      @pointerdown="onPointerDown"
      @wheel="onWheel"
      @pointerleave="onPointerLeave"
      @dblclick="fit"
    >
      <g class="tiles" v-if="tiles.length">
        <image
          v-for="tile in tiles"
          :key="tile.href"
          :href="tile.href"
          :x="tile.x"
          :y="tile.y"
          :width="tile.width"
          :height="tile.height"
          preserveAspectRatio="none"
          opacity="0.85"
        />
      </g>

      <g class="grid" v-if="showGrid">
        <line
          v-for="x in gridLines.vertical"
          :key="`v${x}`"
          :x1="x"
          :x2="x"
          :y1="-halfH"
          :y2="halfH"
          :stroke-width="px(1)"
        />
        <line
          v-for="y in gridLines.horizontal"
          :key="`h${y}`"
          :x1="-halfW"
          :x2="halfW"
          :y1="y"
          :y2="y"
          :stroke-width="px(1)"
        />
      </g>

      <g class="zones" v-if="showZones">
        <template v-for="zone in zoneShapes" :key="zone.id">
          <circle
            v-if="zone.kind === 'circle'"
            :cx="zone.cx"
            :cy="zone.cy"
            :r="zone.r"
            :stroke-width="px(1.6)"
            fill="rgba(211, 58, 58, 0.14)"
          />
          <polygon
            v-else
            :points="zone.points"
            :stroke-width="px(1.6)"
            fill="rgba(211, 58, 58, 0.14)"
          />
        </template>
      </g>

      <polyline
        v-if="pathPoints.length > 1"
        class="flight-path"
        :points="pathPoints.join(' ')"
        :stroke-width="px(2)"
        fill="none"
      />

      <g class="leg-arrows">
        <g v-for="(leg, index) in legs" :key="`leg${index}`" :transform="`translate(${leg.x} ${leg.y}) rotate(${leg.bearing})`">
          <path
            :d="`M 0 ${-px(4)} L ${px(3.2)} ${px(3)} L 0 ${px(1.2)} L ${-px(3.2)} ${px(3)} Z`"
            class="arrow"
          />
        </g>
      </g>

      <g class="home" v-if="homeMarker">
        <circle :cx="homeMarker.x" :cy="homeMarker.y" :r="px(7)" :stroke-width="px(1.6)" />
        <text
          :x="homeMarker.x"
          :y="homeMarker.y + px(3.4)"
          :font-size="px(9)"
          text-anchor="middle"
          class="home-label"
        >
          {{ homeMarker.label }}
        </text>
      </g>

      <g class="waypoints">
        <g
          v-for="wp in waypoints"
          :key="wp.seq"
          :data-wp-seq="wp.seq"
          class="marker"
          :class="{
            selected: wp.seq === selectedSeq,
            action: !isNavigable(wp.command)
          }"
        >
          <circle :cx="project(wp).x" :cy="project(wp).y" :r="markerRadius()" :stroke-width="px(1.6)" />
          <text
            v-if="showLabels"
            :x="project(wp).x"
            :y="project(wp).y - markerRadius() - px(3)"
            :font-size="px(10)"
            text-anchor="middle"
            class="wp-label"
          >
            {{ wp.seq }}
          </text>
          <title>WP{{ wp.seq }} · {{ wp.lat.toFixed(6) }}, {{ wp.lon.toFixed(6) }} · {{ wp.alt.toFixed(0) }}m</title>
        </g>
      </g>
    </svg>

    <div class="map-overlay top-right">
      <span class="badge muted mono">{{ cursor ? `${cursor.lat.toFixed(5)}, ${cursor.lon.toFixed(5)}` : '—' }}</span>
    </div>

    <div class="map-overlay bottom-left">
      <div class="scale-bar">
        <div class="scale-line" :style="{ width: `${scaleBar.width}px` }" />
        <span class="mono">{{ scaleBar.metres >= 1000 ? `${scaleBar.metres / 1000} km` : `${scaleBar.metres} m` }}</span>
      </div>
    </div>

    <div class="map-overlay bottom-right" v-if="showTiles">
      <span class="attribution">© OpenStreetMap contributors</span>
    </div>
  </div>
</template>

<style scoped>
.map-canvas {
  position: relative;
  width: 100%;
  height: 520px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--panel-2);
  border: 1px solid var(--border);
  cursor: grab;
  touch-action: none;
}

.map-canvas.armed {
  cursor: crosshair;
}

.map-canvas:active {
  cursor: grabbing;
}

svg {
  display: block;
  width: 100%;
  height: 100%;
}

.grid line {
  stroke: var(--border);
  opacity: 0.55;
}

.zones circle,
.zones polygon {
  stroke: var(--error);
  stroke-dasharray: 6 4;
}

.flight-path {
  stroke: var(--accent);
  stroke-linecap: round;
  stroke-linejoin: round;
}

.arrow {
  fill: var(--accent);
  opacity: 0.85;
}

.home circle {
  fill: rgba(26, 156, 98, 0.18);
  stroke: var(--ok);
}

.home-label {
  fill: var(--ok);
  font-weight: 700;
  dominant-baseline: middle;
}

.marker circle {
  fill: var(--panel);
  stroke: var(--accent);
}

.marker.selected circle {
  fill: var(--accent);
  stroke: #fff;
}

.marker.action circle {
  stroke: var(--warn);
  stroke-dasharray: 2 2;
}

.wp-label {
  fill: var(--muted);
  font-family: var(--mono);
  pointer-events: none;
}

.map-overlay {
  position: absolute;
  pointer-events: none;
}

.top-right {
  top: 8px;
  right: 8px;
}

.bottom-left {
  bottom: 8px;
  left: 8px;
}

.bottom-right {
  bottom: 6px;
  right: 8px;
}

.scale-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--muted);
}

.scale-line {
  height: 8px;
  border: 1px solid var(--text);
  border-top: none;
  background: transparent;
}

.attribution {
  font-size: 10px;
  color: var(--muted);
}
</style>
