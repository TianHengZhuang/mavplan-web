import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { NAV_LAND, NAV_RETURN_TO_LAUNCH, NAV_WAYPOINT, isNavigable } from '../core/actions'
import { bearingDeg, haversineDistance } from '../core/geo'
import {
  YAW_UNCONSTRAINED,
  addActionAfter,
  addCameraTrigger,
  createMission,
  createWaypoint,
  estimatedDuration,
  fromDict,
  missionStats,
  parseMissionText,
  resequence,
  sampleMission,
  toCsv,
  toDict,
  toKml,
  toQgcPlan,
  toWpl,
  totalDistance,
  validateMission,
  type MissionDoc,
  type Waypoint
} from '../core/mission'

export interface LegInfo {
  distanceM: number
  bearing: number
  /** Vertical rate implied by the leg, m/s (0 when the leg is flat). */
  climbRate: number
  durationS: number
}

export interface ImportResult {
  ok: boolean
  message: string
  format?: string
  count?: number
}

const STORAGE_KEY = 'mavplan-web.mission'
const HISTORY_LIMIT = 50

function loadInitial(): MissionDoc {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return fromDict(JSON.parse(raw) as Record<string, unknown>)
  } catch {
    /* fall through to the sample mission */
  }
  return sampleMission()
}

function cloneMission(doc: MissionDoc): MissionDoc {
  return fromDict(JSON.parse(JSON.stringify(toDict(doc))) as Record<string, unknown>)
}

export const useMissionStore = defineStore('mission', () => {
  const mission = ref<MissionDoc>(loadInitial())
  const selectedSeq = ref<number>(0)
  const dirty = ref(false)
  const statusMessage = ref('')
  const undoStack = ref<MissionDoc[]>([])
  const redoStack = ref<MissionDoc[]>([])
  let suppressHistory = false

  watch(
    mission,
    (value) => {
      dirty.value = true
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toDict(value)))
      } catch {
        /* ignore quota / private-mode errors */
      }
    },
    { deep: true }
  )

  function pushHistory(): void {
    if (suppressHistory) return
    undoStack.value.push(cloneMission(mission.value))
    if (undoStack.value.length > HISTORY_LIMIT) {
      undoStack.value.shift()
    }
    redoStack.value = []
  }

  function applySnapshot(next: MissionDoc): void {
    suppressHistory = true
    mission.value = next
    reselect(
      Math.min(selectedSeq.value, Math.max(0, next.waypoints.length - 1))
    )
    suppressHistory = false
  }

  function undo(): boolean {
    if (!undoStack.value.length) return false
    redoStack.value.push(cloneMission(mission.value))
    const previous = undoStack.value.pop()
    if (!previous) return false
    applySnapshot(previous)
    statusMessage.value = 'undo'
    return true
  }

  function redo(): boolean {
    if (!redoStack.value.length) return false
    undoStack.value.push(cloneMission(mission.value))
    const next = redoStack.value.pop()
    if (!next) return false
    applySnapshot(next)
    statusMessage.value = 'redo'
    return true
  }

  const waypoints = computed(() => mission.value.waypoints)
  const stats = computed(() => missionStats(mission.value.waypoints))
  const issues = computed(() => validateMission(mission.value))
  const distance = computed(() => totalDistance(mission.value.waypoints))
  const duration = computed(() => estimatedDuration(mission.value.waypoints))
  const home = computed(() => mission.value.home)
  const selected = computed(() =>
    mission.value.waypoints.find((wp) => wp.seq === selectedSeq.value) ?? null
  )

  /** Per-leg distance / bearing / climb information for the table and profile. */
  const legs = computed<LegInfo[]>(() => {
    const list = mission.value.waypoints
    const result: LegInfo[] = []
    for (let i = 0; i < list.length; i += 1) {
      if (i === 0) {
        result.push({ distanceM: 0, bearing: 0, climbRate: 0, durationS: 0 })
        continue
      }
      const previous = list[i - 1]
      const current = list[i]
      const distanceM = haversineDistance(previous, current)
      const speed = current.speed > 0 ? current.speed : previous.speed > 0 ? previous.speed : 10
      const durationS = distanceM / speed
      const climbRate = durationS > 0 ? (current.alt - previous.alt) / durationS : 0
      result.push({
        distanceM,
        bearing: bearingDeg(previous, current),
        climbRate,
        durationS
      })
    }
    return result
  })

  function reselect(index: number): void {
    const clamped = Math.max(0, Math.min(index, mission.value.waypoints.length - 1))
    selectedSeq.value = mission.value.waypoints.length ? clamped : 0
  }

  function addWaypoint(lat: number, lon: number, alt?: number, speed?: number): Waypoint {
    pushHistory()
    const previous = mission.value.waypoints[mission.value.waypoints.length - 1]
    const waypoint = createWaypoint({
      lat,
      lon,
      alt: alt ?? previous?.alt ?? 50,
      speed: speed ?? previous?.speed ?? 8
    })
    mission.value.waypoints.push(waypoint)
    resequence(mission.value.waypoints)
    selectedSeq.value = waypoint.seq
    return waypoint
  }

  function updateWaypoint(seq: number, patch: Partial<Waypoint>): void {
    const waypoint = mission.value.waypoints[seq]
    if (!waypoint) return
    Object.assign(waypoint, patch)
  }

  function removeWaypoint(seq: number): void {
    pushHistory()
    mission.value.waypoints.splice(seq, 1)
    resequence(mission.value.waypoints)
    reselect(seq > 0 ? seq - 1 : 0)
  }

  function moveWaypoint(seq: number, delta: number): void {
    const target = seq + delta
    const list = mission.value.waypoints
    if (target < 0 || target >= list.length) return
    pushHistory()
    const [item] = list.splice(seq, 1)
    list.splice(target, 0, item)
    resequence(list)
    selectedSeq.value = target
  }

  function duplicateWaypoint(seq: number): void {
    const source = mission.value.waypoints[seq]
    if (!source) return
    pushHistory()
    mission.value.waypoints.splice(seq + 1, 0, createWaypoint({ ...source, seq: seq + 1 }))
    resequence(mission.value.waypoints)
    selectedSeq.value = seq + 1
  }

  function insertAction(seq: number, command: number, param1 = 0): void {
    pushHistory()
    mission.value.waypoints = addActionAfter(mission.value.waypoints, seq, command, param1)
  }

  function insertCameraTrigger(seq: number, mode: 'distance' | 'time', value: number): void {
    pushHistory()
    mission.value.waypoints = addCameraTrigger(mission.value.waypoints, seq, mode, value)
  }

  function addLandingWaypoint(): void {
    const last = mission.value.waypoints[mission.value.waypoints.length - 1]
    if (!last) return
    pushHistory()
    mission.value.waypoints.push(
      createWaypoint({
        lat: last.lat,
        lon: last.lon,
        alt: 0,
        speed: Math.max(2, last.speed / 2 || 3),
        command: NAV_LAND
      })
    )
    resequence(mission.value.waypoints)
    reselect(mission.value.waypoints.length - 1)
  }

  function addReturnToLaunch(): void {
    const first = mission.value.waypoints[0]
    if (!first) return
    pushHistory()
    mission.value.waypoints.push(
      createWaypoint({
        lat: first.lat,
        lon: first.lon,
        alt: first.alt,
        speed: first.speed,
        command: NAV_RETURN_TO_LAUNCH
      })
    )
    resequence(mission.value.waypoints)
    reselect(mission.value.waypoints.length - 1)
  }

  function replaceWaypoints(list: Waypoint[]): void {
    pushHistory()
    mission.value.waypoints = resequence(list.map((wp) => createWaypoint(wp)))
    reselect(0)
  }

  function appendWaypoints(list: Waypoint[]): void {
    pushHistory()
    const offset = mission.value.waypoints.length
    list.forEach((wp, index) => {
      mission.value.waypoints.push(createWaypoint({ ...wp, seq: offset + index }))
    })
    resequence(mission.value.waypoints)
  }

  function clear(keepName = true): void {
    pushHistory()
    mission.value.waypoints = []
    mission.value.home = null
    if (!keepName) mission.value.name = 'Untitled Mission'
    reselect(0)
  }

  function loadSample(): void {
    pushHistory()
    mission.value = sampleMission()
    reselect(0)
    statusMessage.value = ''
  }

  function setHome(lat: number, lon: number, alt = 0): void {
    pushHistory()
    mission.value.home = [lat, lon, alt]
  }

  function setHomeFrom(seq: number): void {
    const wp = mission.value.waypoints[seq]
    if (!wp) return
    pushHistory()
    mission.value.home = [wp.lat, wp.lon, 0]
  }

  function setName(name: string): void {
    mission.value.name = name
  }

  function importText(text: string, filename = 'mission'): ImportResult {
    try {
      const { mission: parsed, format } = parseMissionText(text)
      pushHistory()
      mission.value = { ...parsed, name: parsed.name || filename.replace(/\.[^.]+$/, '') }
      reselect(0)
      return { ok: true, message: '', format, count: parsed.waypoints.length }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  function exportPayload(kind: 'json' | 'wpl110' | 'wpl120' | 'qgc' | 'kml' | 'csv'): {
    filename: string
    content: string
    mime: string
  } {
    const base = (mission.value.name || 'mission').replace(/[\\/:*?"<>|\s]+/g, '_')
    switch (kind) {
      case 'json':
        return {
          filename: `${base}.json`,
          content: JSON.stringify(toDict(mission.value), null, 2),
          mime: 'application/json'
        }
      case 'wpl110':
        return {
          filename: `${base}.waypoints`,
          content: toWpl(mission.value.waypoints, 'QGC WPL 110', mission.value.home),
          mime: 'text/plain'
        }
      case 'wpl120':
        return {
          filename: `${base}.waypoints`,
          content: toWpl(mission.value.waypoints, 'QGC WPL 120', mission.value.home),
          mime: 'text/plain'
        }
      case 'qgc':
        return {
          filename: `${base}.plan`,
          content: JSON.stringify(toQgcPlan(mission.value), null, 2),
          mime: 'application/json'
        }
      case 'kml':
        return { filename: `${base}.kml`, content: toKml(mission.value), mime: 'application/vnd.google-earth.kml+xml' }
      case 'csv':
      default:
        return { filename: `${base}.csv`, content: toCsv(mission.value.waypoints), mime: 'text/tab-separated-values' }
    }
  }

  const navigableCount = computed(
    () => mission.value.waypoints.filter((wp) => isNavigable(wp.command)).length
  )

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  const yawUnconstrained = YAW_UNCONSTRAINED
  const defaultCommand = NAV_WAYPOINT

  return {
    mission,
    waypoints,
    stats,
    issues,
    distance,
    duration,
    home,
    legs,
    selected,
    selectedSeq,
    statusMessage,
    dirty,
    navigableCount,
    canUndo,
    canRedo,
    yawUnconstrained,
    defaultCommand,
    addWaypoint,
    updateWaypoint,
    removeWaypoint,
    moveWaypoint,
    duplicateWaypoint,
    insertAction,
    insertCameraTrigger,
    addLandingWaypoint,
    addReturnToLaunch,
    replaceWaypoints,
    appendWaypoints,
    clear,
    loadSample,
    setHome,
    setHomeFrom,
    setName,
    importText,
    exportPayload,
    undo,
    redo,
    createMission
  }
})
