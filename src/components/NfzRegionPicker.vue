<script setup lang="ts">
/** Province → city → district NFZ catalogue picker + list. */
import { computed, ref, watch } from 'vue'
import { BUILTIN_ADMIN_INDEX, findCity, findProvince } from '../core/admin-div'
import { t } from '../core/i18n'
import {
  NFZ_DISCLAIMER,
  type NfzRecord,
  recordToZone,
  resolveRegionZones
} from '../core/nfz-pack'
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()

const provinceName = ref('江苏省')
const cityName = ref('徐州市')
const districtName = ref('')
const error = ref('')
const warnings = ref<string[]>([])

const province = computed(() => findProvince(BUILTIN_ADMIN_INDEX, provinceName.value))
const city = computed(() => (province.value ? findCity(province.value, cityName.value) : null))
const districts = computed(() => city.value?.districts ?? [])

watch(
  provinceName,
  () => {
    const p = province.value
    if (p && !p.cities.some((c) => c.name === cityName.value)) {
      cityName.value = p.cities[0]?.name ?? ''
    }
    districtName.value = ''
  },
  { immediate: true }
)

watch(
  cityName,
  () => {
    districtName.value = ''
  },
  { immediate: true }
)

const resolved = computed(() => {
  try {
    error.value = ''
    const r = resolveRegionZones(
      provinceName.value,
      cityName.value,
      districtName.value || null
    )
    warnings.value = r.warnings
    return r
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    warnings.value = []
    return null
  }
})

const records = computed<NfzRecord[]>(() => resolved.value?.records ?? [])
const pack = computed(() => resolved.value?.pack ?? null)

function isEnabled(id: string): boolean {
  return settings.zones.some((z) => z.id === id)
}

function toggle(rec: NfzRecord): void {
  if (isEnabled(rec.id)) {
    settings.removeZone(rec.id)
  } else {
    settings.addZone(recordToZone(rec))
  }
}

function enableAll(): void {
  for (const rec of records.value) {
    if (!isEnabled(rec.id)) settings.addZone(recordToZone(rec))
  }
}

function clearEnabled(): void {
  const ids = new Set(records.value.map((r) => r.id))
  for (const z of settings.zones) {
    if (ids.has(z.id)) settings.removeZone(z.id)
  }
}
</script>

<template>
  <section class="panel nfz-picker">
    <div class="panel-head">
      <h3>{{ t('nfz.title') }}</h3>
      <span class="badge muted">{{ pack?.cityName || '—' }}</span>
      <div class="header-spacer" style="flex: 1" />
      <button class="btn small" type="button" @click="enableAll">{{ t('nfz.enableAll') }}</button>
      <button class="btn small ghost" type="button" @click="clearEnabled">
        {{ t('nfz.clearEnabled') }}
      </button>
    </div>
    <div class="panel-body">
      <div class="cascade">
        <label>
          {{ t('nfz.province') }}
          <select v-model="provinceName">
            <option v-for="p in BUILTIN_ADMIN_INDEX.provinces" :key="p.code" :value="p.name">
              {{ p.name }}
            </option>
          </select>
        </label>
        <label>
          {{ t('nfz.city') }}
          <select v-model="cityName">
            <option v-for="c in province?.cities ?? []" :key="c.code" :value="c.name">
              {{ c.name }}
            </option>
          </select>
        </label>
        <label>
          {{ t('nfz.district') }}
          <select v-model="districtName">
            <option value="">{{ t('nfz.wholeCity') }}</option>
            <option v-for="d in districts" :key="d.code" :value="d.name">{{ d.name }}</option>
          </select>
        </label>
      </div>
      <p class="disclaimer">{{ NFZ_DISCLAIMER }}</p>
      <p v-if="error" class="hint warn">{{ error }}</p>
      <p v-for="w in warnings" :key="w" class="hint">{{ w }}</p>
      <table class="nfz-table">
        <thead>
          <tr>
            <th></th>
            <th>{{ t('nfz.name') }}</th>
            <th>{{ t('nfz.kind') }}</th>
            <th>{{ t('nfz.range') }}</th>
            <th>{{ t('nfz.category') }}</th>
            <th>{{ t('nfz.district') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!records.length">
            <td colspan="6" class="muted">{{ t('nfz.empty') }}</td>
          </tr>
          <tr v-for="z in records" :key="z.id">
            <td>
              <input type="checkbox" :checked="isEnabled(z.id)" @change="toggle(z)" />
            </td>
            <td>{{ z.name }}</td>
            <td>{{ z.kind }}</td>
            <td class="mono">
              <template v-if="z.kind === 'circle'">r={{ z.radiusM }}m</template>
              <template v-else>poly({{ z.vertices.length }})</template>
            </td>
            <td>{{ z.category }}</td>
            <td>{{ z.district || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.cascade {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 8px;
}
.cascade label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
  color: var(--muted, #8b9aab);
  min-width: 120px;
}
.disclaimer {
  font-size: 0.8rem;
  color: var(--warn, #f0b429);
  margin: 6px 0 10px;
}
.nfz-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}
.nfz-table th,
.nfz-table td {
  border-bottom: 1px solid var(--line, #2a3544);
  padding: 6px 8px;
  text-align: left;
}
.hint {
  font-size: 0.85rem;
  color: var(--muted, #8b9aab);
}
.hint.warn {
  color: var(--danger, #f07178);
}
</style>
