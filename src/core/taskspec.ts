/**
 * TaskSpec — mavplan Python training-exam brief (`mavplan.taskspec.TaskSpec`).
 *
 * The JSON document (version 1) is the same file the CLI writes via
 * `TaskSpec.save()` / `mavplan scenario run --task-out task.json`. Loading it
 * in the console applies home, limits and no-fly zones so a student can plan
 * against the exact brief the grader will score.
 */

import type { PreflightParams, Zone } from './preflight'
import { parseZonesJson, zoneFromPythonDict, type PythonZoneDict } from './zones'
import type { LatLon } from './geo'

export interface TaskCheckPoint {
  name: string
  lat: number
  lon: number
  radiusM: number
  kind: 'point' | 'area'
}

export interface TaskBrief {
  version: number
  name: string
  description: string
  difficulty: string
  home: [number, number, number]
  required: TaskCheckPoint[]
  altitudeRange: [number, number]
  speedRange: [number, number]
  maxTimeS: number
  maxDistanceM: number
  noFlyZones: Zone[]
}

interface RawTask {
  version?: number
  name?: string
  description?: string
  difficulty?: string
  home?: number[]
  required?: Array<Record<string, unknown>>
  altitude_range?: number[]
  speed_range?: number[]
  max_time_s?: number
  max_distance_m?: number
  no_fly_zones?: PythonZoneDict[]
}

function readCheckPoint(raw: Record<string, unknown>, index: number): TaskCheckPoint {
  const lat = Number(raw.lat)
  const lon = Number(raw.lon)
  const radiusM = Number(raw.radius_m ?? 20)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error(`Required checkpoint #${index + 1} is missing lat/lon`)
  }
  return {
    name: String(raw.name ?? `点${index + 1}`),
    lat,
    lon,
    radiusM: Number.isFinite(radiusM) && radiusM > 0 ? radiusM : 20,
    kind: raw.kind === 'area' ? 'area' : 'point'
  }
}

export function parseTaskSpec(text: string): TaskBrief {
  let data: RawTask
  try {
    data = JSON.parse(text) as RawTask
  } catch {
    throw new Error('Task file is not valid JSON')
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Task JSON must be an object')
  }
  // Accept a bare zones wrapper only when it actually looks like a TaskSpec.
  if (!('required' in data) && !('altitude_range' in data) && !('no_fly_zones' in data) && !('home' in data)) {
    throw new Error('Not a mavplan TaskSpec (missing home / required / altitude_range / no_fly_zones)')
  }
  const homeRaw = Array.isArray(data.home) ? data.home : [31.2, 121.4, 0]
  const home: [number, number, number] = [
    Number(homeRaw[0] ?? 31.2),
    Number(homeRaw[1] ?? 121.4),
    Number(homeRaw[2] ?? 0)
  ]
  const altitude = Array.isArray(data.altitude_range) ? data.altitude_range : [50, 80]
  const speed = Array.isArray(data.speed_range) ? data.speed_range : [8, 12]
  return {
    version: Number(data.version ?? 1),
    name: String(data.name ?? '航线规划考核任务'),
    description: String(data.description ?? ''),
    difficulty: String(data.difficulty ?? 'easy'),
    home,
    required: (data.required ?? []).map((item, index) => readCheckPoint(item, index)),
    altitudeRange: [Number(altitude[0] ?? 50), Number(altitude[1] ?? 80)],
    speedRange: [Number(speed[0] ?? 8), Number(speed[1] ?? 12)],
    maxTimeS: Number(data.max_time_s ?? 600),
    maxDistanceM: Number(data.max_distance_m ?? 5000),
    noFlyZones: (data.no_fly_zones ?? []).map((item, index) => zoneFromPythonDict(item, index))
  }
}

/** Serialize back to the Python TaskSpec.to_dict() shape (for round-trips). */
export function toTaskSpecDict(brief: TaskBrief): Record<string, unknown> {
  return {
    version: brief.version,
    name: brief.name,
    description: brief.description,
    difficulty: brief.difficulty,
    home: brief.home.map((v) => Number(v.toFixed(7))),
    required: brief.required.map((cp) => ({
      name: cp.name,
      lat: Number(cp.lat.toFixed(7)),
      lon: Number(cp.lon.toFixed(7)),
      radius_m: Number(cp.radiusM.toFixed(1)),
      kind: cp.kind
    })),
    altitude_range: brief.altitudeRange,
    speed_range: brief.speedRange,
    max_time_s: Number(brief.maxTimeS.toFixed(1)),
    max_distance_m: Number(brief.maxDistanceM.toFixed(1)),
    no_fly_zones: brief.noFlyZones.map((zone) => {
      // Reuse the zones module serialisation for Python-compatible fields.
      const json = JSON.parse(
        JSON.stringify({
          zones: [
            zone.kind === 'circle'
              ? {
                  name: zone.name,
                  kind: 'circle',
                  lat: zone.lat,
                  lon: zone.lon,
                  radius_m: zone.radiusM
                }
              : {
                  name: zone.name,
                  kind: 'polygon',
                  lat: zone.vertices[0]?.lat ?? 0,
                  lon: zone.vertices[0]?.lon ?? 0,
                  radius_m: 0,
                  vertices: zone.vertices.map((v) => [v.lat, v.lon])
                }
          ]
        })
      ) as { zones: PythonZoneDict[] }
      return json.zones[0]
    })
  }
}

/**
 * Map a TaskSpec onto preflight limits.
 * Python defaults for teaching are 120 m / 500 m; a brief overrides both.
 */
export function applyTaskToPreflight(params: PreflightParams, brief: TaskBrief): PreflightParams {
  return {
    ...params,
    maxAltitudeM: brief.altitudeRange[1],
    maxDistanceM: brief.maxDistanceM,
    cruiseSpeed: params.cruiseSpeed || brief.speedRange[1]
  }
}

export function taskHomeLatLon(brief: TaskBrief): LatLon {
  return { lat: brief.home[0], lon: brief.home[1] }
}

/** Convenience for tests and the IO panel: detect TaskSpec vs zones JSON. */
export function looksLikeTaskSpec(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{')) return false
  try {
    const data = JSON.parse(trimmed) as RawTask
    return Boolean(data && (data.required || data.altitude_range || data.no_fly_zones))
  } catch {
    return false
  }
}

export { parseZonesJson }
