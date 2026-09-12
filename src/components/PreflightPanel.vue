<script setup lang="ts">
/**
 * Preflight panel — limits, no-fly zones and the resulting findings.
 *
 * `mode="summary"` renders the compact variant used next to the editor map;
 * `mode="full"` renders the complete console on the preflight page.
 */
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { formatDistance, formatDuration, type LatLon } from '../core/geo'
import { t } from '../core/i18n'
import { type CheckItem, type Zone, preflightCheck, toPreflightJson } from '../core/preflight'
import { useMissionStore } from '../stores/mission'
import { useSettingsStore } from '../stores/settings'

const props = withDefaults(defineProps<{ mode?: 'full' | 'summary' }>(), { mode: 'full' })

const store = useMissionStore()
const settings = useSettingsStore()

const vertexDrafts = ref<Record<string, string>>({})

watch(
  () => settings.zones,
  (zones) => {
    for (const zone of zones) {
      if (zone.kind === 'polygon' && vertexDrafts.value[zone.id] === undefined) {
        vertexDrafts.value[zone.id] = zone.vertices
          .map((vertex) => `${vertex.lat.toFixed(6)},${vertex.lon.toFixed(6)}`)
          .join('\n')
      }
    }
  },
  { immediate: true, deep: true }
)

const report = computed(() => preflightCheck(store.mission, settings.params, settings.zones))

const visibleItems = computed(() =>
  props.mode === 'summary' ? report.value.items.slice(0, 6) : report.value.items
)

const usedPercent = computed(() => {
  const available = report.value.availableMah
  if (available <= 0) return 0
  return Math.min(100, (report.value.requiredMah / available) * 100)
})

const barClass = computed(() => {
  if (!report.value.cleared) return 'bar error'
  return usedPercent.value > 90 ? 'bar warning' : 'bar ok'
})

const homePoint = computed<LatLon>(() => {
  const home = store.home
  if (home) return { lat: home[0], lon: home[1] }
  const first = store.waypoints[0]
  return first ? { lat: first.lat, lon: first.lon } : { lat: 22.8175, lon: 108.3165 }
})

function parseVertices(text: string): LatLon[] {
  const result: LatLon[] = []
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split(/[,;\s]+/).filter((part) => part.length)
    if (parts.length < 2) continue
    const lat = Number(parts[0])
    const lon = Number(parts[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    result.push({ lat, lon })
  }
  return result
}

function onVertexInput(id: string, event: Event): void {
  const text = (event.target as HTMLTextAreaElement).value
  vertexDrafts.value[id] = text
  const vertices = parseVertices(text)
  if (vertices.length >= 3) settings.updateZone(id, { vertices } as Partial<Zone>)
}

function addCircleZone(): void {
  const home = homePoint.value
  settings.addZone({
    id: `zone-${Date.now()}`,
    kind: 'circle',
    name: `NFZ ${settings.zones.length + 1}`,
    lat: Number(home.lat.toFixed(6)),
    lon: Number(home.lon.toFixed(6)),
    radiusM: 200,
    ceilingM: 0
  })
}

function addPolygonZone(): void {
  const points = store.waypoints.map((wp) => ({ lat: wp.lat, lon: wp.lon }))
  if (points.length < 3) return
  const lats = points.map((p) => p.lat)
  const lons = points.map((p) => p.lon)
  const vertices: LatLon[] = [
    { lat: Math.min(...lats), lon: Math.min(...lons) },
    { lat: Math.max(...lats), lon: Math.min(...lons) },
    { lat: Math.max(...lats), lon: Math.max(...lons) },
    { lat: Math.min(...lats), lon: Math.max(...lons) }
  ]
  settings.addZone({
    id: `zone-${Date.now()}`,
    kind: 'polygon',
    name: `NFZ ${settings.zones.length + 1}`,
    vertices,
    ceilingM: 0
  })
}

function messageOf(item: CheckItem): string {
  return t(`preflight.check.${item.code}`, item.params)
}

function pick(item: CheckItem): void {
  if (typeof item.seq === 'number') store.selectedSeq = item.seq
}

const groupedFindings = computed(() => {
  const levels = ['error', 'warning', 'info'] as const
  return levels
    .map((level) => ({
      level,
      items: visibleItems.value.filter((item) => item.level === level)
    }))
    .filter((group) => group.items.length > 0)
})

const copyState = ref<'idle' | 'ok' | 'fail'>('idle')

async function copyPreflightJson(): Promise<void> {
  const payload = toPreflightJson(
    report.value,
    store.mission.name || 'mission',
    store.waypoints.length,
    settings.zones.length,
    messageOf
  )
  const text = JSON.stringify(payload, null, 2)
  try {
    await navigator.clipboard.writeText(text)
    copyState.value = 'ok'
  } catch {
    copyState.value = 'fail'
  }
  window.setTimeout(() => {
    copyState.value = 'idle'
  }, 2000)
}
</script>

<template>
  <div class="panel">
    <div class="panel-head">
      <h3>{{ t('preflight.title') }}</h3>
      <span class="badge" :class="report.cleared ? 'ok' : 'error'">
        {{ report.cleared ? t('preflight.resultCleared') : t('preflight.resultBlocked') }}
      </span>
      <span class="badge muted mono">{{
        t('preflight.levels', { errors: report.errors, warnings: report.warnings, infos: report.infos })
      }}</span>
      <div class="header-spacer" style="flex: 1" />
      <button v-if="mode === 'full'" class="btn small ghost" type="button" @click="copyPreflightJson">
        {{
          copyState === 'ok'
            ? t('preflight.copyJsonOk')
            : copyState === 'fail'
              ? t('preflight.copyJsonFail')
              : t('preflight.copyJson')
        }}
      </button>
      <RouterLink v-if="mode === 'summary'" class="btn small ghost" to="/preflight">
        {{ t('preflight.issueList') }}
      </RouterLink>
    </div>

    <div class="panel-body">
      <div class="stats-grid">
        <div class="stat">
          <span class="stat-label">{{ t('preflight.distance') }}</span>
          <span class="stat-value mono">{{ formatDistance(report.distanceM) }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">{{ t('preflight.duration') }}</span>
          <span class="stat-value mono">{{ formatDuration(report.durationS) }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">{{ t('preflight.cruiseTime') }}</span>
          <span class="stat-value mono">{{ formatDuration(report.cruiseTimeS) }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">{{ t('preflight.hoverTime') }}</span>
          <span class="stat-value mono">{{ formatDuration(report.hoverTimeS) }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">{{ t('preflight.required') }}</span>
          <span class="stat-value mono">{{ report.requiredMah.toFixed(0) }} mAh</span>
        </div>
        <div class="stat">
          <span class="stat-label">{{ t('preflight.available') }}</span>
          <span class="stat-value mono">{{ report.availableMah.toFixed(0) }} mAh</span>
        </div>
        <div class="stat">
          <span class="stat-label">{{ t('preflight.turnRadius') }}</span>
          <span class="stat-value mono">{{ report.turnRadiusM.toFixed(0) }} m</span>
        </div>
      </div>

      <div class="battery">
        <div :class="barClass" :style="{ width: `${usedPercent.toFixed(1)}%` }" />
      </div>

      <div v-if="mode === 'full' && groupedFindings.length">
        <section v-for="group in groupedFindings" :key="group.level" class="finding-group">
          <h4 class="finding-group-title">
            {{ t(`preflight.level.${group.level}`) }}
            <span class="badge muted mono">{{ group.items.length }}</span>
          </h4>
          <ul class="findings">
            <li
              v-for="(item, index) in group.items"
              :key="`${item.code}-${item.seq ?? -1}-${index}`"
              :class="`finding ${item.level}`"
              @click="pick(item)"
            >
              <span class="badge" :class="item.level">
                {{ t(`preflight.level.${item.level}`) }}
              </span>
              <span class="finding-text">{{ messageOf(item) }}</span>
              <span v-if="typeof item.seq === 'number'" class="badge muted mono">#{{ item.seq }}</span>
            </li>
          </ul>
        </section>
      </div>
      <ul v-else-if="visibleItems.length" class="findings">
        <li
          v-for="(item, index) in visibleItems"
          :key="`${item.code}-${item.seq ?? -1}-${index}`"
          :class="`finding ${item.level}`"
          @click="pick(item)"
        >
          <span class="badge" :class="item.level">
            {{ t(`preflight.level.${item.level}`) }}
          </span>
          <span class="finding-text">{{ messageOf(item) }}</span>
          <span v-if="typeof item.seq === 'number'" class="badge muted mono">#{{ item.seq }}</span>
        </li>
      </ul>
      <div v-else class="empty">{{ t('preflight.noIssues') }}</div>

      <template v-if="mode === 'full'">
        <section class="sub-block">
          <h4>{{ t('preflight.params') }}</h4>
          <div class="field-row">
            <div class="field">
              <label>{{ t('preflight.maxAltitude') }}</label>
              <input v-model.number="settings.params.maxAltitudeM" type="number" step="5" min="5" />
            </div>
            <div class="field">
              <label>{{ t('preflight.maxDistance') }}</label>
              <input v-model.number="settings.params.maxDistanceM" type="number" step="100" min="50" />
            </div>
            <div class="field">
              <label>{{ t('preflight.cruiseSpeed') }}</label>
              <input v-model.number="settings.params.cruiseSpeed" type="number" step="0.5" min="0.5" />
            </div>
            <div class="field">
              <label>{{ t('preflight.bank') }}</label>
              <input v-model.number="settings.params.bankDeg" type="number" step="1" min="5" max="60" />
            </div>
            <div class="field">
              <label>{{ t('preflight.reserve') }}</label>
              <input v-model.number="settings.params.reservePercent" type="number" step="1" min="0" max="80" />
            </div>
            <div class="field">
              <label>{{ t('preflight.hoverTime') }}</label>
              <input v-model.number="settings.params.hoverTimeS" type="number" step="1" min="0" />
            </div>
          </div>
          <div class="field-row">
            <div class="field">
              <label>{{ t('preflight.battery.capacity') }}</label>
              <input v-model.number="settings.params.battery.capacityMah" type="number" step="100" min="200" />
            </div>
            <div class="field">
              <label>{{ t('preflight.battery.cells') }}</label>
              <input v-model.number="settings.params.battery.cells" type="number" step="1" min="1" max="14" />
            </div>
            <div class="field">
              <label>{{ t('preflight.battery.cruiseCurrent') }}</label>
              <input v-model.number="settings.params.battery.cruiseCurrentA" type="number" step="0.5" min="0.5" />
            </div>
            <div class="field">
              <label>{{ t('preflight.battery.hoverCurrent') }}</label>
              <input v-model.number="settings.params.battery.hoverCurrentA" type="number" step="0.5" min="0.5" />
            </div>
            <div class="field" style="justify-content: flex-end">
              <button class="btn small" type="button" @click="settings.resetParams()">{{ t('common.reset') }}</button>
            </div>
          </div>
        </section>

        <section class="sub-block">
          <h4>{{ t('preflight.zones') }}</h4>
          <p class="hint">{{ t('preflight.zoneHint') }}</p>
          <div class="toolbar">
            <button class="btn small" type="button" @click="addCircleZone">{{ t('preflight.addCircleZone') }}</button>
            <button
              class="btn small"
              type="button"
              :disabled="store.waypoints.length < 3"
              @click="addPolygonZone"
            >
              {{ t('preflight.addPolygonZone') }}
            </button>
          </div>

          <div v-if="!settings.zones.length" class="empty">{{ t('preflight.noZones') }}</div>

          <div v-else class="zone-list">
            <article v-for="zone in settings.zones" :key="zone.id" class="zone-card">
              <div class="zone-head">
                <input
                  class="zone-name"
                  type="text"
                  :value="zone.name"
                  @input="settings.updateZone(zone.id, { name: ($event.target as HTMLInputElement).value })"
                />
                <span class="badge muted mono">{{ zone.kind === 'circle' ? t('preflight.addCircleZone') : t('preflight.addPolygonZone') }}</span>
                <button class="icon-btn" type="button" @click="settings.removeZone(zone.id)">✕</button>
              </div>

              <div v-if="zone.kind === 'circle'" class="field-row">
                <div class="field">
                  <label>{{ t('field.lat') }}</label>
                  <input
                    type="number"
                    step="0.000001"
                    :value="zone.lat"
                    @input="settings.updateZone(zone.id, { lat: Number(($event.target as HTMLInputElement).value) })"
                  />
                </div>
                <div class="field">
                  <label>{{ t('field.lon') }}</label>
                  <input
                    type="number"
                    step="0.000001"
                    :value="zone.lon"
                    @input="settings.updateZone(zone.id, { lon: Number(($event.target as HTMLInputElement).value) })"
                  />
                </div>
                <div class="field">
                  <label>{{ t('preflight.zoneRadius') }}</label>
                  <input
                    type="number"
                    step="10"
                    min="1"
                    :value="zone.radiusM"
                    @input="settings.updateZone(zone.id, { radiusM: Number(($event.target as HTMLInputElement).value) })"
                  />
                </div>
                <div class="field">
                  <label>{{ t('preflight.zoneCeiling') }}</label>
                  <input
                    type="number"
                    step="5"
                    min="0"
                    :value="zone.ceilingM"
                    @input="settings.updateZone(zone.id, { ceilingM: Number(($event.target as HTMLInputElement).value) })"
                  />
                </div>
              </div>

              <div v-else class="field-row">
                <div class="field" style="flex: 1 1 260px">
                  <label>{{ t('preflight.vertices') }}</label>
                  <textarea
                    rows="4"
                    spellcheck="false"
                    :value="vertexDrafts[zone.id]"
                    @input="onVertexInput(zone.id, $event)"
                  />
                </div>
                <div class="field">
                  <label>{{ t('preflight.zoneCeiling') }}</label>
                  <input
                    type="number"
                    step="5"
                    min="0"
                    :value="zone.ceilingM"
                    @input="settings.updateZone(zone.id, { ceilingM: Number(($event.target as HTMLInputElement).value) })"
                  />
                </div>
              </div>
            </article>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 8px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
}

.stat-label {
  font-size: 11px;
  color: var(--muted);
}

.stat-value {
  font-size: 13px;
  font-weight: 600;
}

.battery {
  margin: 10px 0 4px;
  height: 8px;
  border-radius: 999px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  overflow: hidden;
}

.bar {
  height: 100%;
}

.bar.ok {
  background: var(--ok);
}

.bar.warning {
  background: var(--warn);
}

.bar.error {
  background: var(--error);
}

.findings {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 280px;
  overflow: auto;
}

.finding {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-left-width: 3px;
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  cursor: pointer;
}

.finding.error {
  border-left-color: var(--error);
}

.finding.warning {
  border-left-color: var(--warn);
}

.finding.info {
  border-left-color: var(--accent);
}

.finding-text {
  flex: 1;
  font-size: 12.5px;
}

.sub-block {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sub-block h4 {
  margin: 0;
  font-size: 12.5px;
  font-weight: 600;
}

.hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--muted);
}

.zone-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.zone-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px;
  background: var(--panel-2);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.zone-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.zone-name {
  flex: 1;
  max-width: 240px;
}
</style>
