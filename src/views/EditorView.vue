<script setup lang="ts">
/**
 * Editor view — mission toolbar, map, altitude profile, waypoint table and
 * the pattern / IO side panels.
 */
import { ref } from 'vue'
import AltitudeProfile from '../components/AltitudeProfile.vue'
import MapCanvas from '../components/MapCanvas.vue'
import MissionIO from '../components/MissionIO.vue'
import PatternPanel from '../components/PatternPanel.vue'
import PreflightPanel from '../components/PreflightPanel.vue'
import WaypointTable from '../components/WaypointTable.vue'
import { formatDistance, formatDuration } from '../core/geo'
import { t } from '../core/i18n'
import { useMissionStore } from '../stores/mission'
import { useSettingsStore } from '../stores/settings'

const store = useMissionStore()
const settings = useSettingsStore()

const armed = ref(false)
const mapRef = ref<InstanceType<typeof MapCanvas> | null>(null)

function onAddWaypoint(lat: number, lon: number): void {
  store.addWaypoint(lat, lon)
}

function onMoveWaypoint(seq: number, lat: number, lon: number): void {
  store.updateWaypoint(seq, { lat, lon })
}

function fit(): void {
  mapRef.value?.fit()
}

function confirmClear(): void {
  if (window.confirm(t('editor.clearConfirm'))) store.clear()
}
</script>

<template>
  <div class="view">
    <section class="panel mission-bar">
      <div class="mission-meta">
        <div class="field">
          <label>{{ t('editor.missionName') }}</label>
          <input
            type="text"
            :value="store.mission.name"
            style="min-width: 240px"
            @input="store.setName(($event.target as HTMLInputElement).value)"
          />
        </div>
        <div class="badge muted mono">{{ t('editor.waypointCount') }} {{ store.stats.count }}</div>
        <div class="badge muted mono">{{ t('editor.totalDistance') }} {{ formatDistance(store.stats.distanceM) }}</div>
        <div class="badge muted mono">{{ t('editor.estimatedDuration') }} {{ formatDuration(store.stats.durationS) }}</div>
        <div class="badge muted mono">{{ t('editor.maxAltitude') }} {{ store.stats.maxAltitudeM.toFixed(0) }} m</div>
        <div class="badge" :class="store.home ? 'ok' : 'muted'" v-if="store.home">
          {{ t('editor.home') }} {{ store.home[0].toFixed(5) }}, {{ store.home[1].toFixed(5) }}
        </div>
        <div v-if="store.issues.length" class="badge warning">
          {{ t('io.validationErrors') }} · {{ store.issues.length }}
        </div>
      </div>
      <div class="toolbar">
        <button class="btn small" type="button" @click="store.loadSample()">{{ t('editor.loadSample') }}</button>
        <button class="btn small danger" type="button" @click="confirmClear" :disabled="!store.stats.count">
          {{ t('editor.clear') }}
        </button>
      </div>
    </section>

    <div class="editor-grid">
      <div class="editor-col">
        <div class="panel">
          <div class="panel-head">
            <h3>{{ t('editor.map') }}</h3>
            <button class="btn small" :class="armed ? 'primary' : ''" type="button" @click="armed = !armed">
              {{ t('editor.addWaypoint') }} · {{ armed ? t('common.enabled') : t('common.disabled') }}
            </button>
            <button class="btn small ghost" type="button" @click="fit">{{ t('common.apply') }} · fit</button>
            <div class="header-spacer" style="flex: 1" />
            <label class="switch">
              <input v-model="settings.showTiles" type="checkbox" />
              {{ t('editor.showTiles') }}
            </label>
            <label class="switch">
              <input v-model="settings.showGrid" type="checkbox" />
              {{ t('editor.showGrid') }}
            </label>
            <label class="switch">
              <input v-model="settings.showLabels" type="checkbox" />
              {{ t('editor.showLabels') }}
            </label>
            <label class="switch">
              <input v-model="settings.showZones" type="checkbox" />
              {{ t('editor.showZones') }}
            </label>
          </div>
          <div class="panel-body tight">
            <MapCanvas
              ref="mapRef"
              :waypoints="store.waypoints"
              :home="store.home"
              :zones="settings.zones"
              :selected-seq="store.selectedSeq"
              :show-tiles="settings.showTiles"
              :show-grid="settings.showGrid"
              :show-labels="settings.showLabels"
              :show-zones="settings.showZones"
              :armed="armed"
              @add-waypoint="onAddWaypoint"
              @select="store.selectedSeq = $event"
              @move-waypoint="onMoveWaypoint"
            />
            <p class="hint">
              {{ armed ? t('editor.addHereHint') : t('editor.panHint') }} · {{ t('editor.selected') }}:
              #{{ store.selectedSeq }}
            </p>
          </div>
        </div>

        <AltitudeProfile
          :waypoints="store.waypoints"
          :selected-seq="store.selectedSeq"
          @select="store.selectedSeq = $event"
        />

        <WaypointTable />
      </div>

      <div class="editor-col side">
        <PreflightPanel mode="summary" />
        <PatternPanel />
        <MissionIO />
      </div>
    </div>
  </div>
</template>

<style scoped>
.mission-bar {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  flex-wrap: wrap;
  padding: 10px 12px;
  margin-bottom: 12px;
}

.mission-meta {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
}

.editor-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 440px);
  gap: 12px;
  align-items: start;
}

.editor-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.hint {
  margin: 6px 2px 0;
  font-size: 11.5px;
  color: var(--muted);
}

@media (max-width: 1180px) {
  .editor-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
