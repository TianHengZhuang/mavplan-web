import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  DO_SET_CAM_TRIGG_DIST,
  DO_SET_CAM_TRIGG_INTERVAL
} from '../core/actions'
import { locale as i18nLocale, setLocale, type Locale } from '../core/i18n'
import { defaultParams, type PreflightParams, type Zone } from '../core/preflight'
import { applyTaskToPreflight, type TaskBrief } from '../core/taskspec'
import { parseZonesJson, toZonesJson } from '../core/zones'

const STORAGE_KEY = 'mavplan-web.settings'

interface PersistedSettings {
  locale?: Locale
  showTiles?: boolean
  showGrid?: boolean
  showLabels?: boolean
  showZones?: boolean
  params?: PreflightParams
  zones?: Zone[]
  task?: TaskBrief | null
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
  const taskBrief = ref<TaskBrief | null>(stored.task ?? null)
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
          zones: zones.value,
          task: taskBrief.value
        })
      )
    } catch {
      /* storage unavailable (private mode) — the console keeps working */
    }
  }

  watch([locale, showTiles, showGrid, showLabels, showZones, params, zones, taskBrief], persist, {
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

  /** Import mavplan zones JSON (Python load_zones_json layout). */
  function importZonesJson(text: string): number {
    const parsed = parseZonesJson(text)
    zones.value = [...zones.value, ...parsed]
    return parsed.length
  }

  function exportZonesJson(): string {
    return toZonesJson(zones.value)
  }

  /**
   * Load a TaskSpec brief: store it, merge no-fly zones, and retune
   * preflight limits so browser checks match the CLI grader.
   */
  function applyTaskBrief(brief: TaskBrief, options: { replaceZones?: boolean } = {}): void {
    taskBrief.value = brief
    if (options.replaceZones !== false) {
      zones.value = [...brief.noFlyZones]
    } else {
      zones.value = [...zones.value, ...brief.noFlyZones]
    }
    params.value = applyTaskToPreflight(params.value, brief)
  }

  function clearTaskBrief(): void {
    taskBrief.value = null
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
    taskBrief,
    statusMessage,
    cameraTriggerCommands,
    switchLocale,
    toggleLocale,
    resetParams,
    addZone,
    removeZone,
    updateZone,
    clearZones,
    importZonesJson,
    exportZonesJson,
    applyTaskBrief,
    clearTaskBrief
  }
})
