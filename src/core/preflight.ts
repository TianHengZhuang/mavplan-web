/**
 * Preflight console — a browser port of `src/mavplan/nofly.py` plus the
 * turn/battery/energy checks used by the training material.
 *
 * Findings are returned as structured items (code + data) so the UI can
 * localise them; every hard limit produces an `error`, soft limits produce a
 * `warning`, and informational rows explain the numbers that were computed.
 */

import {
  type LatLon,
  bearingDeg,
  distancePointToSegment,
  haversineDistance,
  headingChangeDeg,
  minTurnRadius,
  pointInPolygon,
  segmentIntersectsPolygon,
  segmentsIntersect
} from './geo'
import { estimatedDuration, type MissionDoc, type Waypoint } from './mission'

export interface CircleZone {
  id: string
  kind: 'circle'
  name: string
  lat: number
  lon: number
  radiusM: number
  /** Vertical limit of the zone, metres AGL; 0 = unlimited. */
  ceilingM: number
}

export interface PolygonZone {
  id: string
  kind: 'polygon'
  name: string
  vertices: LatLon[]
  ceilingM: number
  /** Anchor mirroring Python Zone.to_dict (first vertex). Optional for UI-only zones. */
  lat?: number
  lon?: number
}

export type Zone = CircleZone | PolygonZone

export interface BatteryModel {
  capacityMah: number
  cells: number
  cruiseCurrentA: number
  hoverCurrentA: number
}

export interface PreflightParams {
  maxAltitudeM: number
  maxDistanceM: number
  cruiseSpeed: number
  bankDeg: number
  reservePercent: number
  /** Seconds spent hovering at each waypoint. */
  hoverTimeS: number
  battery: BatteryModel
}

export type PreflightCode =
  | 'no-waypoints'
  | 'altitude-exceeded'
  | 'distance-exceeded'
  | 'turn-too-short'
  | 'zone-inside'
  | 'zone-intersect'
  | 'zone-tangent'
  | 'battery-insufficient'
  | 'battery-low'
  | 'battery-ok'
  | 'ok'

export interface CheckItem {
  level: 'error' | 'warning' | 'info'
  code: PreflightCode
  /** Sequence of the waypoint this finding belongs to, when applicable. */
  seq?: number
  params: Record<string, string | number>
}

export interface PreflightReport {
  items: CheckItem[]
  errors: number
  warnings: number
  infos: number
  distanceM: number
  durationS: number
  cruiseTimeS: number
  hoverTimeS: number
  requiredMah: number
  availableMah: number
  turnRadiusM: number
  /** True when no error-level finding was raised. */
  cleared: boolean
}

/** Shape-compatible with mavplan CLI `mission check --json` (schema mavplan.preflight/1). */
export function toPreflightJson(
  report: PreflightReport,
  missionName: string,
  waypointCount: number,
  zoneCount: number,
  formatMessage?: (item: CheckItem) => string
): {
  schema: string
  mission: { name: string; waypoints: number }
  zones: number
  summary: { errors: number; warnings: number; info: number }
  checks: { code: string; level: string; message: string; waypoint?: number }[]
} {
  return {
    schema: 'mavplan.preflight/1',
    mission: { name: missionName, waypoints: waypointCount },
    zones: zoneCount,
    summary: {
      errors: report.errors,
      warnings: report.warnings,
      info: report.infos
    },
    checks: report.items.map((item) => ({
      code: item.code,
      level: item.level,
      message: formatMessage ? formatMessage(item) : item.code,
      ...(typeof item.seq === 'number' ? { waypoint: item.seq } : {})
    }))
  }
}

export function defaultParams(): PreflightParams {
  return {
    maxAltitudeM: 120,
    maxDistanceM: 3000,
    cruiseSpeed: 10,
    bankDeg: 30,
    reservePercent: 20,
    hoverTimeS: 5,
    battery: {
      capacityMah: 5000,
      cells: 4,
      cruiseCurrentA: 12,
      hoverCurrentA: 18
    }
  }
}

export function emptyReport(): PreflightReport {
  return {
    items: [],
    errors: 0,
    warnings: 0,
    infos: 0,
    distanceM: 0,
    durationS: 0,
    cruiseTimeS: 0,
    hoverTimeS: 0,
    requiredMah: 0,
    availableMah: 0,
    turnRadiusM: 0,
    cleared: false
  }
}

/** Altitude of the aircraft at a given item, using the previous altitude for actions. */
function altitudeAt(waypoints: Waypoint[], index: number): number {
  const wp = waypoints[index]
  if (wp.command >= 176 && index > 0) return waypoints[index - 1].alt
  return wp.alt
}

export type ZoneRelation = 'inside' | 'intersect' | 'near' | 'clear'

/** Relation between one flown segment and one zone. */
export function segmentZoneRelation(a: LatLon, b: LatLon, zone: Zone, toleranceM = 1): ZoneRelation {
  if (zone.kind === 'circle') {
    const center: LatLon = { lat: zone.lat, lon: zone.lon }
    const distanceA = haversineDistance(a, center)
    const distanceB = haversineDistance(b, center)
    const distanceSegment = distancePointToSegment(center, a, b)
    if (distanceSegment > zone.radiusM + toleranceM) return 'clear'
    if (distanceA <= zone.radiusM || distanceB <= zone.radiusM || distanceSegment <= zone.radiusM) {
      // Both endpoints outside but the segment cuts through → intersect.
      if (distanceA > zone.radiusM && distanceB > zone.radiusM) return 'intersect'
      return 'inside'
    }
    return 'near'
  }

  const vertices = zone.vertices
  if (vertices.length < 3) return 'clear'
  if (pointInPolygon(a, vertices) || pointInPolygon(b, vertices)) return 'inside'
  if (segmentIntersectsPolygon(a, b, vertices)) return 'intersect'
  let minDistance = Infinity
  for (let i = 0; i < vertices.length; i += 1) {
    const c = vertices[i]
    const d = vertices[(i + 1) % vertices.length]
    if (segmentsIntersect(a, b, c, d)) return 'intersect'
    minDistance = Math.min(
      minDistance,
      distancePointToSegment(a, c, d),
      distancePointToSegment(b, c, d),
      distancePointToSegment(c, a, b),
      distancePointToSegment(d, a, b)
    )
  }
  return minDistance <= toleranceM ? 'near' : 'clear'
}

export function zoneContains(zone: Zone, point: LatLon): boolean {
  if (zone.kind === 'circle') {
    return haversineDistance({ lat: zone.lat, lon: zone.lon }, point) <= zone.radiusM
  }
  return pointInPolygon(point, zone.vertices)
}

export function preflightCheck(
  mission: MissionDoc,
  params: PreflightParams,
  zones: Zone[] = []
): PreflightReport {
  const report = emptyReport()
  const waypoints = mission.waypoints
  if (!waypoints.length) {
    report.items.push({ level: 'error', code: 'no-waypoints', params: {} })
    report.errors = 1
    return report
  }

  const home: LatLon = mission.home
    ? { lat: mission.home[0], lon: mission.home[1] }
    : { lat: waypoints[0].lat, lon: waypoints[0].lon }

  // --- altitude & distance envelopes -------------------------------------
  waypoints.forEach((wp, index) => {
    const altitude = altitudeAt(waypoints, index)
    if (altitude > params.maxAltitudeM) {
      report.items.push({
        level: 'error',
        code: 'altitude-exceeded',
        seq: wp.seq,
        params: { altitude: altitude.toFixed(0), limit: params.maxAltitudeM }
      })
    }
    const distance = haversineDistance(home, wp)
    if (distance > params.maxDistanceM) {
      report.items.push({
        level: 'error',
        code: 'distance-exceeded',
        seq: wp.seq,
        params: { distance: (distance / 1000).toFixed(2), limit: (params.maxDistanceM / 1000).toFixed(2) }
      })
    }
  })

  // --- turn feasibility ---------------------------------------------------
  let turnRadius = 0
  for (let i = 1; i < waypoints.length - 1; i += 1) {
    const previous = waypoints[i - 1]
    const current = waypoints[i]
    const next = waypoints[i + 1]
    const speed = current.speed > 0 ? current.speed : params.cruiseSpeed
    const headingIn = bearingDeg(previous, current)
    const headingOut = bearingDeg(current, next)
    const turn = headingChangeDeg(headingIn, headingOut)
    if (turn < 15) continue
    const radius = minTurnRadius(speed, params.bankDeg)
    turnRadius = Math.max(turnRadius, radius)
    if (distancePointToSegment(current, previous, next) < radius) {
      report.items.push({
        level: 'warning',
        code: 'turn-too-short',
        seq: current.seq,
        params: {
          turn: turn.toFixed(0),
          radius: radius.toFixed(0),
          speed: speed.toFixed(1)
        }
      })
    }
  }

  // --- no-fly zones -------------------------------------------------------
  for (const zone of zones) {
    for (let i = 0; i + 1 < waypoints.length; i += 1) {
      const a = waypoints[i]
      const b = waypoints[i + 1]
      const relation = segmentZoneRelation(a, b, zone, 1)
      if (relation === 'clear') continue
      // ceilingM <= 0 means unlimited: the zone always applies.
      // ceilingM > 0 means the zone only restricts flight below that altitude
      // (flying over the ceiling is allowed).
      const minAlt = Math.min(altitudeAt(waypoints, i), altitudeAt(waypoints, i + 1))
      const applies = zone.ceilingM <= 0 || minAlt < zone.ceilingM
      if (!applies) continue
      const code: PreflightCode =
        relation === 'inside' ? 'zone-inside' : relation === 'intersect' ? 'zone-intersect' : 'zone-tangent'
      report.items.push({
        level: relation === 'near' ? 'warning' : 'error',
        code,
        seq: a.seq,
        params: { zone: zone.name }
      })
    }
    if (zone.ceilingM > 0) {
      report.items.push({
        level: 'info',
        code: 'ok',
        params: { zone: zone.name, ceiling: zone.ceilingM }
      })
    }
  }

  // --- energy / battery ---------------------------------------------------
  const cruiseTime = Math.max(0, estimatedDuration(waypoints, 0, params.cruiseSpeed))
  const hoverTime = params.hoverTimeS * waypoints.length + waypoints.reduce((s, wp) => s + Math.max(0, wp.delay), 0)
  const distance = totalLegLength(waypoints)
  const requiredMah =
    (cruiseTime * params.battery.cruiseCurrentA * 1000) / 3600 +
    (hoverTime * params.battery.hoverCurrentA * 1000) / 3600
  const availableMah = params.battery.capacityMah * (1 - params.reservePercent / 100)

  if (requiredMah > availableMah) {
    report.items.push({
      level: 'error',
      code: 'battery-insufficient',
      params: {
        required: requiredMah.toFixed(0),
        available: availableMah.toFixed(0),
        capacity: params.battery.capacityMah
      }
    })
  } else if (requiredMah > availableMah * 0.9) {
    report.items.push({
      level: 'warning',
      code: 'battery-low',
      params: {
        required: requiredMah.toFixed(0),
        available: availableMah.toFixed(0),
        margin: (availableMah - requiredMah).toFixed(0)
      }
    })
  } else {
    report.items.push({
      level: 'info',
      code: 'battery-ok',
      params: {
        required: requiredMah.toFixed(0),
        available: availableMah.toFixed(0),
        margin: (availableMah - requiredMah).toFixed(0)
      }
    })
  }

  report.distanceM = distance
  report.durationS = cruiseTime + hoverTime
  report.cruiseTimeS = cruiseTime
  report.hoverTimeS = hoverTime
  report.requiredMah = requiredMah
  report.availableMah = availableMah
  report.turnRadiusM = turnRadius
  report.errors = report.items.filter((item) => item.level === 'error').length
  report.warnings = report.items.filter((item) => item.level === 'warning').length
  report.infos = report.items.filter((item) => item.level === 'info').length
  report.cleared = report.errors === 0
  return report
}

/** Sum of leg lengths in metres (per-leg speeds are handled separately). */
function totalLegLength(waypoints: Waypoint[]): number {
  let total = 0
  for (let i = 0; i + 1 < waypoints.length; i += 1) {
    total += haversineDistance(waypoints[i], waypoints[i + 1])
  }
  return total
}
