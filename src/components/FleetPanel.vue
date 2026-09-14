<script setup lang="ts">
/** Fleet cards for dashboard / playback headers. */
import { ref } from 'vue'
import type { Drone, DroneRole } from '../core/fleet'
import { t } from '../core/i18n'
import { useFleetStore } from '../stores/fleet'

const fleet = useFleetStore()
const newName = ref('')
const newCallsign = ref('')
const newModel = ref('')
const newRole = ref<DroneRole>('wingman')

function add(): void {
  const name = newName.value.trim()
  if (!name) return
  const ok = fleet.addDrone({
    name,
    callsign: newCallsign.value.trim() || `UAV-${String(fleet.count + 1).padStart(2, '0')}`,
    model: newModel.value.trim(),
    role: newRole.value
  })
  if (ok) {
    newName.value = ''
    newCallsign.value = ''
    newModel.value = ''
  }
}

function statusClass(status: Drone['status']): string {
  return `st-${status}`
}
</script>

<template>
  <section class="panel fleet-panel">
    <div class="panel-head">
      <h3>{{ t('fleet.title') }}</h3>
      <span class="badge muted mono">{{ fleet.count }} {{ t('fleet.countUnit') }}</span>
      <div class="header-spacer" style="flex: 1" />
      <button class="btn small ghost" type="button" @click="fleet.resetFromMission()">
        {{ t('fleet.reset') }}
      </button>
    </div>
    <div class="panel-body">
      <p v-if="fleet.issues.length" class="hint warn">{{ fleet.issues.join(' · ') }}</p>
      <div class="fleet-grid">
        <article v-for="d in fleet.drones" :key="d.id" class="fleet-card">
          <header>
            <strong>{{ d.name }}</strong>
            <span class="badge" :class="statusClass(d.status)">{{ d.status }}</span>
          </header>
          <div class="meta mono">
            <span>{{ d.callsign || '—' }}</span>
            <span>{{ d.model || '—' }}</span>
            <span>{{ d.role }}</span>
          </div>
          <div class="meta">
            <span>{{ d.batteryWh }} Wh</span>
            <span>{{ d.maxAltM }} m</span>
            <span>{{ d.cruiseSpeedMs }} m/s</span>
          </div>
          <footer>
            <button
              class="btn small ghost"
              type="button"
              :disabled="d.role === 'lead'"
              @click="fleet.updateDrone(d.id, { role: 'lead' })"
            >
              {{ t('fleet.setLead') }}
            </button>
            <button class="btn small ghost danger" type="button" @click="fleet.removeDrone(d.id)">
              {{ t('fleet.remove') }}
            </button>
          </footer>
        </article>
      </div>
      <form class="fleet-add" @submit.prevent="add">
        <input v-model="newName" :placeholder="t('fleet.name')" required />
        <input v-model="newCallsign" :placeholder="t('fleet.callsign')" />
        <input v-model="newModel" :placeholder="t('fleet.model')" />
        <select v-model="newRole">
          <option value="wingman">wingman</option>
          <option value="standby">standby</option>
          <option value="lead">lead</option>
        </select>
        <button class="btn small" type="submit">{{ t('fleet.add') }}</button>
      </form>
      <p v-if="fleet.statusMessage" class="hint warn">{{ fleet.statusMessage }}</p>
    </div>
  </section>
</template>

<style scoped>
.fleet-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}
.fleet-card {
  border: 1px solid var(--line, #2a3544);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--panel2, #1c2430);
}
.fleet-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.fleet-card .meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--muted, #8b9aab);
  margin-bottom: 4px;
}
.fleet-card footer {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.st-planned {
  background: #2a3544;
  color: #9aabbc;
}
.st-ready {
  background: #1a3d2a;
  color: #3ecf8e;
}
.st-flying {
  background: #152a3d;
  color: #3d9cf0;
}
.st-landed {
  background: #2a2a18;
  color: #c9b458;
}
.fleet-add {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.fleet-add input,
.fleet-add select {
  flex: 1 1 120px;
  min-width: 100px;
}
.hint.warn {
  color: var(--warn, #f0b429);
  font-size: 0.85rem;
}
</style>
