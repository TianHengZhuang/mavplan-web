<script setup lang="ts">
/**
 * Pattern generator panel — rectangle (lawn-mower), circular orbit and
 * polygon survey.  Generated legs can either replace or extend the mission,
 * and survey geometry can be promoted to a no-fly zone in one click.
 */
import { computed, onMounted, reactive, ref } from 'vue'
import {
  type StartCorner,
  boundingRectangle,
  generateLawnMower,
  generateOrbit,
  generatePolygonScan
} from '../core/pattern'
import { boundsOf, type LatLon } from '../core/geo'
import { t } from '../core/i18n'
import type { Waypoint } from '../core/mission'
import { useMissionStore } from '../stores/mission'
import { useSettingsStore } from '../stores/settings'

const store = useMissionStore()
const settings = useSettingsStore()

const message = ref('')

const lawn = reactive({
  c1Lat: 22.8175,
  c1Lon: 108.3165,
  c2Lat: 22.8245,
  c2Lon: 108.3265,
  alt: 60,
  speed: 8,
  spacing: 30,
  startCorner: 'SW' as StartCorner,
  startFromOuter: true
})

const orbit = reactive({
  lat: 22.8205,
  lon: 108.3215,
  radius: 150,
  alt: 60,
  speed: 8,
  points: 12,
  direction: 'cw' as 'cw' | 'ccw',
  startBearing: 0
})

const poly = reactive({
  text: '',
  alt: 60,
  speed: 8,
  spacing: 30,
  sweepAngle: 0,
  startFromOuter: true
})

const cornerOptions: StartCorner[] = ['NW', 'NE', 'SW', 'SE']

function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseVertices(text: string): LatLon[] {
  const result: LatLon[] = []
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split(/[,;\s]+/).filter((part) => part.length)
    if (parts.length < 2) continue
    const lat = Number(parts[0])
    const lon = Number(parts[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue
    result.push({ lat, lon })
  }
  return result
}

const polygonVertices = computed(() => parseVertices(poly.text))

const lawnmowerPreview = computed(() => {
  if (![lawn.c1Lat, lawn.c1Lon, lawn.c2Lat, lawn.c2Lon, lawn.spacing].every(isFiniteNumber)) return []
  if (lawn.spacing <= 0) return []
  return generateLawnMower({
    corner1: { lat: lawn.c1Lat, lon: lawn.c1Lon },
    corner2: { lat: lawn.c2Lat, lon: lawn.c2Lon },
    altitude: lawn.alt,
    speed: lawn.speed,
    laneSpacing: lawn.spacing,
    startCorner: lawn.startCorner,
    startFromOuter: lawn.startFromOuter
  })
})

const orbitPreview = computed(() => {
  if (![orbit.lat, orbit.lon, orbit.radius, orbit.points].every(isFiniteNumber) || orbit.radius <= 0) return []
  return generateOrbit({
    center: { lat: orbit.lat, lon: orbit.lon },
    radiusM: orbit.radius,
    altitude: orbit.alt,
    speed: orbit.speed,
    points: orbit.points,
    direction: orbit.direction,
    startBearing: orbit.startBearing
  })
})

const polygonPreview = computed(() => {
  if (polygonVertices.value.length < 3 || poly.spacing <= 0) return []
  return generatePolygonScan({
    vertices: polygonVertices.value,
    altitude: poly.alt,
    speed: poly.speed,
    laneSpacing: poly.spacing,
    sweepAngle: poly.sweepAngle,
    startFromOuter: poly.startFromOuter
  })
})

const surveyArea = computed(() => {
  const extent = boundingRectangle(polygonVertices.value)
  return extent ? extent.areaM2 : 0
})

function write(list: Waypoint[], mode: 'replace' | 'append'): void {
  if (!list.length) {
    message.value = t('pattern.invalid')
    return
  }
  if (mode === 'replace') store.replaceWaypoints(list)
  else store.appendWaypoints(list)
  message.value = t('pattern.generated', { count: list.length })
}

function useMissionBounds(): void {
  const points: LatLon[] = store.waypoints.map((wp) => ({ lat: wp.lat, lon: wp.lon }))
  if (store.home) points.push({ lat: store.home[0], lon: store.home[1] })
  const bounds = boundsOf(points)
  if (!bounds) {
    message.value = t('pattern.invalid')
    return
  }
  if (store.waypoints.length) {
    lawn.c1Lat = Number(bounds.minLat.toFixed(6))
    lawn.c1Lon = Number(bounds.minLon.toFixed(6))
    lawn.c2Lat = Number(bounds.maxLat.toFixed(6))
    lawn.c2Lon = Number(bounds.maxLon.toFixed(6))
  }
  const origin = store.home
    ? { lat: store.home[0], lon: store.home[1] }
    : { lat: (bounds.minLat + bounds.maxLat) / 2, lon: (bounds.minLon + bounds.maxLon) / 2 }
  orbit.lat = Number(origin.lat.toFixed(6))
  orbit.lon = Number(origin.lon.toFixed(6))
  if (store.waypoints.length) {
    poly.text = [
      `${bounds.minLat.toFixed(6)},${bounds.minLon.toFixed(6)}`,
      `${bounds.maxLat.toFixed(6)},${bounds.minLon.toFixed(6)}`,
      `${bounds.maxLat.toFixed(6)},${bounds.maxLon.toFixed(6)}`,
      `${bounds.minLat.toFixed(6)},${bounds.maxLon.toFixed(6)}`
    ].join('\n')
  }
}

function addPolygonZone(): void {
  if (polygonVertices.value.length < 3) {
    message.value = t('pattern.polygonNeedThree')
    return
  }
  const name = `NFZ ${settings.zones.length + 1}`
  settings.addZone({
    id: `zone-${Date.now()}`,
    kind: 'polygon',
    name,
    vertices: polygonVertices.value,
    ceilingM: 0
  })
  message.value = t('pattern.zoneAdded', { name })
}

function addOrbitZone(): void {
  const name = `NFZ ${settings.zones.length + 1}`
  settings.addZone({
    id: `zone-${Date.now()}`,
    kind: 'circle',
    name,
    lat: orbit.lat,
    lon: orbit.lon,
    radiusM: Math.max(1, orbit.radius),
    ceilingM: 0
  })
  message.value = t('pattern.zoneAdded', { name })
}

onMounted(() => {
  const points: LatLon[] = store.waypoints.map((wp) => ({ lat: wp.lat, lon: wp.lon }))
  if (store.home) points.push({ lat: store.home[0], lon: store.home[1] })
  const bounds = boundsOf(points)
  if (bounds && store.waypoints.length) useMissionBounds()
  else {
    poly.text = [
      `${lawn.c1Lat},${lawn.c1Lon}`,
      `${lawn.c2Lat},${lawn.c1Lon}`,
      `${lawn.c2Lat},${lawn.c2Lon}`,
      `${lawn.c1Lat},${lawn.c2Lon}`
    ].join('\n')
  }
})
</script>

<template>
  <div class="panel">
    <div class="panel-head">
      <h3>{{ t('pattern.title') }}</h3>
      <div class="header-spacer" style="flex: 1" />
      <button class="btn small" type="button" @click="useMissionBounds">{{ t('pattern.fromMission') }}</button>
    </div>

    <div class="panel-body">
      <div v-if="message" class="status-line">
        <span class="badge info">{{ message }}</span>
      </div>

      <section class="pattern-block">
        <h4>{{ t('pattern.lawnmower') }}</h4>
        <div class="field-row">
          <div class="field">
            <label>{{ t('pattern.corner1') }}</label>
            <div class="pair">
              <input v-model.number="lawn.c1Lat" type="number" step="0.000001" />
              <input v-model.number="lawn.c1Lon" type="number" step="0.000001" />
            </div>
          </div>
          <div class="field">
            <label>{{ t('pattern.corner2') }}</label>
            <div class="pair">
              <input v-model.number="lawn.c2Lat" type="number" step="0.000001" />
              <input v-model.number="lawn.c2Lon" type="number" step="0.000001" />
            </div>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>{{ t('pattern.altitude') }}</label>
            <input v-model.number="lawn.alt" type="number" step="1" min="0" />
          </div>
          <div class="field">
            <label>{{ t('pattern.speed') }}</label>
            <input v-model.number="lawn.speed" type="number" step="0.5" min="0" />
          </div>
          <div class="field">
            <label>{{ t('pattern.laneSpacing') }}</label>
            <input v-model.number="lawn.spacing" type="number" step="1" min="1" />
          </div>
          <div class="field">
            <label>{{ t('pattern.startCorner') }}</label>
            <select v-model="lawn.startCorner">
              <option v-for="corner in cornerOptions" :key="corner" :value="corner">{{ corner }}</option>
            </select>
          </div>
        </div>
        <div class="block-footer">
          <label class="switch">
            <input v-model="lawn.startFromOuter" type="checkbox" />
            {{ t('pattern.startFromOuter') }}
          </label>
          <span class="badge muted mono">≈ {{ lawnmowerPreview.length }}</span>
          <button class="btn small primary" type="button" @click="write(lawnmowerPreview, 'replace')">
            {{ t('pattern.replace') }}
          </button>
          <button class="btn small" type="button" @click="write(lawnmowerPreview, 'append')">
            {{ t('pattern.append') }}
          </button>
        </div>
      </section>

      <section class="pattern-block">
        <h4>{{ t('pattern.orbit') }}</h4>
        <div class="field-row">
          <div class="field">
            <label>{{ t('pattern.center') }}</label>
            <div class="pair">
              <input v-model.number="orbit.lat" type="number" step="0.000001" />
              <input v-model.number="orbit.lon" type="number" step="0.000001" />
            </div>
          </div>
          <div class="field">
            <label>{{ t('pattern.radius') }}</label>
            <input v-model.number="orbit.radius" type="number" step="10" min="1" />
          </div>
          <div class="field">
            <label>{{ t('pattern.altitude') }}</label>
            <input v-model.number="orbit.alt" type="number" step="1" min="0" />
          </div>
          <div class="field">
            <label>{{ t('pattern.speed') }}</label>
            <input v-model.number="orbit.speed" type="number" step="0.5" min="0" />
          </div>
          <div class="field">
            <label>{{ t('pattern.points') }}</label>
            <input v-model.number="orbit.points" type="number" step="1" min="3" max="120" />
          </div>
          <div class="field">
            <label>{{ t('pattern.direction') }}</label>
            <select v-model="orbit.direction">
              <option value="cw">{{ t('pattern.cw') }}</option>
              <option value="ccw">{{ t('pattern.ccw') }}</option>
            </select>
          </div>
          <div class="field">
            <label>{{ t('pattern.startBearing') }}</label>
            <input v-model.number="orbit.startBearing" type="number" step="15" />
          </div>
        </div>
        <div class="block-footer">
          <span class="badge muted mono">≈ {{ orbitPreview.length }}</span>
          <button class="btn small primary" type="button" @click="write(orbitPreview, 'replace')">
            {{ t('pattern.replace') }}
          </button>
          <button class="btn small" type="button" @click="write(orbitPreview, 'append')">
            {{ t('pattern.append') }}
          </button>
          <button class="btn small ghost" type="button" @click="addOrbitZone">{{ t('pattern.addZone') }}</button>
        </div>
      </section>

      <section class="pattern-block">
        <h4>{{ t('pattern.polygon') }}</h4>
        <div class="field">
          <label>{{ t('pattern.polygonVertices') }}</label>
          <textarea v-model="poly.text" rows="5" spellcheck="false" />
        </div>
        <div class="field-row">
          <div class="field">
            <label>{{ t('pattern.altitude') }}</label>
            <input v-model.number="poly.alt" type="number" step="1" min="0" />
          </div>
          <div class="field">
            <label>{{ t('pattern.speed') }}</label>
            <input v-model.number="poly.speed" type="number" step="0.5" min="0" />
          </div>
          <div class="field">
            <label>{{ t('pattern.laneSpacing') }}</label>
            <input v-model.number="poly.spacing" type="number" step="1" min="1" />
          </div>
          <div class="field">
            <label>{{ t('pattern.sweepAngle') }}</label>
            <input v-model.number="poly.sweepAngle" type="number" step="15" />
          </div>
        </div>
        <div class="block-footer">
          <label class="switch">
            <input v-model="poly.startFromOuter" type="checkbox" />
            {{ t('pattern.startFromOuter') }}
          </label>
          <span class="badge muted mono">{{ polygonVertices.length }} pts</span>
          <span class="badge muted mono">{{ (surveyArea / 10000).toFixed(2) }} ha</span>
          <span class="badge muted mono">≈ {{ polygonPreview.length }}</span>
          <button class="btn small primary" type="button" @click="write(polygonPreview, 'replace')">
            {{ t('pattern.replace') }}
          </button>
          <button class="btn small" type="button" @click="write(polygonPreview, 'append')">
            {{ t('pattern.append') }}
          </button>
          <button class="btn small ghost" type="button" @click="addPolygonZone">{{ t('pattern.addZone') }}</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.pattern-block {
  padding: 10px 0 12px;
  border-top: 1px dashed var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pattern-block:first-of-type {
  border-top: none;
  padding-top: 0;
}

.pattern-block h4 {
  margin: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
}

.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.block-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.status-line {
  padding-bottom: 6px;
}
</style>
