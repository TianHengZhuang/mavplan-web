<script setup lang="ts">
/**
 * Preflight view — full limits / zone console beside a read-only map so the
 * operator can see exactly which leg trips which restriction.
 */
import { ref } from 'vue'
import AltitudeProfile from '../components/AltitudeProfile.vue'
import CliCompanion from '../components/CliCompanion.vue'
import MapCanvas from '../components/MapCanvas.vue'
import PreflightPanel from '../components/PreflightPanel.vue'
import NfzRegionPicker from '../components/NfzRegionPicker.vue'
import { t } from '../core/i18n'
import { useMissionStore } from '../stores/mission'
import { useSettingsStore } from '../stores/settings'

const store = useMissionStore()
const settings = useSettingsStore()

const mapRef = ref<InstanceType<typeof MapCanvas> | null>(null)
</script>

<template>
  <div class="view preflight-grid">
    <PreflightPanel mode="full" />

    <div class="preflight-side">
      <NfzRegionPicker />

      <div class="panel">
        <div class="panel-head">
          <h3>{{ t('editor.map') }}</h3>
          <div class="header-spacer" style="flex: 1" />
          <button class="btn small ghost" type="button" @click="mapRef?.fit()">
            {{ t('common.apply') }} · fit
          </button>
        </div>
        <div class="panel-body tight">
          <div class="map-host">
            <MapCanvas
              ref="mapRef"
              :waypoints="store.waypoints"
              :home="store.home"
              :zones="settings.zones"
              :required="settings.taskBrief?.required ?? []"
              :selected-seq="store.selectedSeq"
              :show-tiles="settings.showTiles"
              :show-grid="settings.showGrid"
              :show-labels="settings.showLabels"
              :show-zones="settings.showZones"
              :armed="false"
              @select="store.selectedSeq = $event"
            />
          </div>
        </div>
      </div>

      <AltitudeProfile
        :waypoints="store.waypoints"
        :selected-seq="store.selectedSeq"
        @select="store.selectedSeq = $event"
      />

      <CliCompanion />
    </div>
  </div>
</template>

<style scoped>
.preflight-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(380px, 460px);
  gap: 12px;
  align-items: start;
}

.preflight-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

@media (max-width: 1180px) {
  .preflight-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
