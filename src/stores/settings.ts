import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  DO_SET_CAM_TRIGG_DIST,
  DO_SET_CAM_TRIGG_INTERVAL
} from '../core/actions'
import { locale as i18nLocale, setLocale, type Locale } from '../core/i18n'
import { defaultParams, type PreflightParams, type Zone } from '../core/preflight'

const STORAGE_KEY = 'mavplan-web.settings'

interface PersistedSettings {
  locale?: Locale
  showTiles?: boolean
  showGrid?: boolean
  showLabels?: boolean
  showZones?: boolean
  params?: PreflightParams
  zones?: Zone[]
}

function load(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PersistedSettings) : {}
  } catch {
    return {}
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const stored = load()

  const locale = i18nLocale
  const showTiles = ref(stored.showTiles ?? false)
  const showGrid = ref(stored.showGrid ?? true)
  const showLabels = ref(stored.showLabels ?? true)
  const showZones = ref(stored.showZones ?? true)
  const params = ref<PreflightParams>({ ...defaultParams(), ...(stored.params ?? {}) })
  const zones = ref<Zone[]>(stored.zones ?? [])
  const statusMessage = ref('')

  if (stored.locale) setLocale(stored.locale)

  function persist(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          locale: locale.value,
          showTiles: showTiles.value,
          showGrid: showGrid.value,
          showLabels: showLabels.value,
          showZones: showZones.value,
          params: params.value,
          zones: zones.value
        })
      )
    } catch {
      /* storage unavailable (private mode) — the console keeps working */
    }
  }

  watch([locale, showTiles, showGrid, showLabels, showZones, params, zones], persist, {
    deep: true
  })

  function switchLocale(next: Locale): void {
    setLocale(next)
  }

  function toggleLocale(): void {
    setLocale(locale.value === 'zh-CN' ? 'en' : 'zh-CN')
  }

  function resetParams(): void {
    params.value = defaultParams()
  }

  function addZone(zone: Zone): void {
    zones.value = [...zones.value, zone]
  }

  function removeZone(id: string): void {
    zones.value = zones.value.filter((zone) => zone.id !== id)
  }

  function updateZone(id: string, patch: Partial<Zone>): void {
    zones.value = zones.value.map((zone) =>
      zone.id === id ? ({ ...zone, ...patch } as Zone) : zone
    )
  }

  function clearZones(): void {
    zones.value = []
  }

  const cameraTriggerCommands = computed(() => [DO_SET_CAM_TRIGG_DIST, DO_SET_CAM_TRIGG_INTERVAL])

  return {
    locale,
    showTiles,
    showGrid,
    showLabels,
    showZones,
    params,
    zones,
    statusMessage,
    cameraTriggerCommands,
    switchLocale,
    toggleLocale,
    resetParams,
    addZone,
    removeZone,
    updateZone,
    clearZones
  }
})
