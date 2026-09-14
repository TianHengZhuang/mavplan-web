/**
 * Mission model, validation and the file formats understood by the console.
 *
 * The JSON shape produced by `Mission.save()` in Python is the canonical
 * interchange format:
 *
 * ```json
 * {
 *   "name": "Untitled Mission",
 *   "frame": 3,
 *   "home": [34.2472, 117.1856, 0],
 *   "waypoints": [{ "seq": 0, "lat": ..., "lon": ..., "alt": ... }]
 * }
 * ```
 *
 * Everything here is pure TypeScript (no DOM) so it can be unit-tested and
 * reused by a future CLI/desktop shell.
 */

import {
  DO_SET_CAM_TRIGG_DIST,
  DO_SET_CAM_TRIGG_INTERVAL,
  NAV_WAYPOINT,
  commandName,
  isNavigable
} from './actions'
import { bearingDeg, haversineDistance } from './geo'

export interface Waypoint {
  /** Sequence number inside the mission (assigned by {@link resequence}). */
  seq: number
  lat: number
  lon: number
  /** Relative altitude in metres (frame 3 = global relative alt). */
  alt: number
  /** Leg speed in m/s (0 = autopilot default). */
  speed: number
  /** Hold time at the item, seconds. */
  delay: number
  /** Heading constraint in degrees; -9999 means "unconstrained". */
  yaw: number
  /** Acceptance radius in metres. */
  acceptance_radius: number
  /** Loiter radius in metres (0 = no loiter). */
  orbit: number
  /** MAV_CMD id. */
  command: number
  /** MAV_FRAME id, 3 = global relative altitude. */
  frame: number
  autocontinue: number
}

export const YAW_UNCONSTRAINED = -9999

export interface MissionDoc {
  name: string
  frame: number
  home: [number, number, number] | null
  waypoints: Waypoint[]
}

export interface MissionStats {
  count: number
  navigable: number
  actions: number
  distanceM: number
  durationS: number
  maxAltitudeM: number
  minAltitudeM: number
}

export function createWaypoint(partial: Partial<Waypoint> = {}): Waypoint {
  return {
    seq: partial.seq ?? 0,
    lat: partial.lat ?? 0,
    lon: partial.lon ?? 0,
    alt: partial.alt ?? 50,
    speed: partial.speed ?? 0,
    delay: partial.delay ?? 0,
    yaw: partial.yaw ?? YAW_UNCONSTRAINED,
    acceptance_radius: partial.acceptance_radius ?? 2,
    orbit: partial.orbit ?? 0,
    command: partial.command ?? NAV_WAYPOINT,
    frame: partial.frame ?? 3,
    autocontinue: partial.autocontinue ?? 1
  }
}

export function createMission(name = 'Untitled Mission'): MissionDoc {
  return { name, frame: 3, home: null, waypoints: [] }
}

/** Renumber `seq` so it always equals the array index. */
export function resequence(waypoints: Waypoint[]): Waypoint[] {
  waypoints.forEach((wp, index) => {
    wp.seq = index
  })
  return waypoints
}

export function validateWaypoint(wp: Waypoint): string[] {
  const errors: string[] = []
  if (!Number.isFinite(wp.lat) || wp.lat < -90 || wp.lat > 90) {
    errors.push(`Latitude ${wp.lat} is out of range (-90 to 90)`)
  }
  if (!Number.isFinite(wp.lon) || wp.lon < -180 || wp.lon > 180) {
    errors.push(`Longitude ${wp.lon} is out of range (-180 to 180)`)
  }
  if (wp.alt < -1000 || wp.alt > 50000) {
    errors.push(`Altitude ${wp.alt}m is outside safe range (-1000 to 50000)`)
  }
  if (wp.speed < 0) errors.push(`Speed ${wp.speed} cannot be negative`)
  if (wp.delay < 0) errors.push(`Delay ${wp.delay} cannot be negative`)
  if ((wp.yaw < -180 || wp.yaw > 360) && wp.yaw !== YAW_UNCONSTRAINED) {
    errors.push(`Yaw ${wp.yaw} is not in range (-180 to 360) or -9999`)
  }
  return errors
}

export function validateMission(mission: MissionDoc): string[] {
  const errors: string[] = []
  if (!mission.waypoints.length) return ['Mission has no waypoints']
  mission.waypoints.forEach((wp, index) => {
    for (const message of validateWaypoint(wp)) errors.push(`WP${index}: ${message}`)
  })
  const home = mission.waypoints[0]
  mission.waypoints.slice(1).forEach((wp, offset) => {
    if (!isNavigable(wp.command)) return
    const distance = haversineDistance(home, wp)
    if (distance > 50000) {
      errors.push(
        `Waypoint ${offset + 1} is ${(distance / 1000).toFixed(1)}km from WP0 — verify this is intentional`
      )
    }
  })
  return errors
}

export function totalDistance(waypoints: Waypoint[]): number {
  let total = 0
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    total += haversineDistance(waypoints[i], waypoints[i + 1])
  }
  return total
}

export function estimatedDuration(
  waypoints: Waypoint[],
  hoverTime = 5,
  cruiseSpeed = 10
): number {
  if (waypoints.length < 2) return 0
  let cruise = 0
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const leg = haversineDistance(waypoints[i], waypoints[i + 1])
    const speed = waypoints[i].speed > 0 ? waypoints[i].speed : cruiseSpeed
    cruise += leg / speed
  }
  const hover = hoverTime * waypoints.length
  const delays = waypoints.reduce((sum, wp) => sum + Math.max(0, wp.delay), 0)
  return cruise + hover + delays
}

export function missionStats(waypoints: Waypoint[]): MissionStats {
  const altitudes = waypoints.map((wp) => wp.alt)
  return {
    count: waypoints.length,
    navigable: waypoints.filter((wp) => isNavigable(wp.command)).length,
    actions: waypoints.filter((wp) => !isNavigable(wp.command)).length,
    distanceM: totalDistance(waypoints),
    durationS: estimatedDuration(waypoints),
    maxAltitudeM: altitudes.length ? Math.max(...altitudes) : 0,
    minAltitudeM: altitudes.length ? Math.min(...altitudes) : 0
  }
}

/** Heading of every leg, indexed by the leg's start waypoint. */
export function legBearings(waypoints: Waypoint[]): number[] {
  const bearings: number[] = []
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    bearings.push(bearingDeg(waypoints[i], waypoints[i + 1]))
  }
  return bearings
}

/* ------------------------------------------------------------------ *
 * Serialisation
 * ------------------------------------------------------------------ */

export function toDict(mission: MissionDoc): Record<string, unknown> {
  const data: Record<string, unknown> = { name: mission.name, frame: mission.frame }
  if (mission.home) data.home = [mission.home[0], mission.home[1], mission.home[2]]
  data.waypoints = mission.waypoints.map((wp) => ({
    seq: wp.seq,
    lat: wp.lat,
    lon: wp.lon,
    alt: wp.alt,
    speed: wp.speed,
    delay: wp.delay,
    yaw: wp.yaw,
    acceptance_radius: wp.acceptance_radius,
    orbit: wp.orbit,
    command: wp.command,
    frame: wp.frame,
    autocontinue: wp.autocontinue
  }))
  return data
}

export function fromDict(data: Record<string, unknown>): MissionDoc {
  const rawWaypoints = Array.isArray(data.waypoints) ? (data.waypoints as Record<string, unknown>[]) : []
  const home = Array.isArray(data.home) ? (data.home as number[]) : null
  return {
    name: typeof data.name === 'string' ? data.name : 'Untitled Mission',
    frame: typeof data.frame === 'number' ? data.frame : 3,
    home: home && home.length >= 3 ? [home[0], home[1], home[2]] : null,
    waypoints: resequence(
      rawWaypoints.map((item) =>
        createWaypoint({
          seq: Number(item.seq ?? 0),
          lat: Number(item.lat ?? 0),
          lon: Number(item.lon ?? 0),
          alt: Number(item.alt ?? 0),
          speed: Number(item.speed ?? 0),
          delay: Number(item.delay ?? 0),
          yaw: Number(item.yaw ?? YAW_UNCONSTRAINED),
          acceptance_radius: Number(item.acceptance_radius ?? 2),
          orbit: Number(item.orbit ?? 0),
          command: Number(item.command ?? NAV_WAYPOINT),
          frame: Number(item.frame ?? 3),
          autocontinue: Number(item.autocontinue ?? 1)
        })
      )
    )
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Tab-separated CSV, header identical to `Mission.to_csv()` in Python. */
export function toCsv(waypoints: Waypoint[]): string {
  const rows = [
    'seq\tlat\tlon\talt\tspeed\tdelay\tyaw\tacceptance_radius\torbit\tcommand\tframe\tautocontinue'
  ]
  for (const wp of waypoints) {
    rows.push(
      `${wp.seq}\t${wp.lat.toFixed(7)}\t${wp.lon.toFixed(7)}\t${wp.alt.toFixed(2)}\t` +
        `${wp.speed.toFixed(1)}\t${wp.delay.toFixed(1)}\t${wp.yaw.toFixed(1)}\t` +
        `${wp.acceptance_radius.toFixed(1)}\t${wp.orbit.toFixed(1)}\t` +
        `${wp.command}\t${wp.frame}\t${wp.autocontinue}`
    )
  }
  return rows.join('\n')
}

/**
 * QGC WPL 110 / 120 mission file (QGroundControl & Mission Planner compatible).
 *
 * Column order (matches QGC / Mission Planner / mavplan Python):
 * seq, current, frame, command, p1, p2, p3, p4, x(lat), y(lon), z(alt), autocontinue
 */
export function toWpl(waypoints: Waypoint[], header = 'QGC WPL 120', home?: [number, number, number] | null): string {
  const lines = [header]
  let seq = 0
  if (home) {
    lines.push(
      [
        seq,
        0,
        0,
        NAV_WAYPOINT,
        0,
        0,
        0,
        0,
        home[0].toFixed(7),
        home[1].toFixed(7),
        home[2].toFixed(2),
        1
      ].join('\t')
    )
    seq += 1
  }
  for (const wp of waypoints) {
    const values = [
      seq,
      0,
      wp.frame,
      wp.command,
      wp.delay.toFixed(1),
      wp.acceptance_radius.toFixed(1),
      wp.orbit.toFixed(1),
      wp.yaw.toFixed(1),
      wp.lat.toFixed(7),
      wp.lon.toFixed(7),
      wp.alt.toFixed(2),
      wp.autocontinue
    ]
    lines.push(values.join('\t'))
    seq += 1
  }
  return lines.join('\n')
}

export function toKml(mission: MissionDoc): string {
  const waypoints = mission.waypoints
  const coords = waypoints.map((wp) => `          ${wp.lon.toFixed(7)},${wp.lat.toFixed(7)},${wp.alt.toFixed(1)}`)
  const placemarks = waypoints
    .map(
      (wp) => `        <Placemark>
          <name>WP${wp.seq} ${commandName(wp.command)}</name>
          <description>Alt: ${wp.alt.toFixed(1)}m | Speed: ${wp.speed.toFixed(0)}m/s | Delay: ${wp.delay.toFixed(0)}s</description>
          <Point>
            <coordinates>${wp.lon.toFixed(7)},${wp.lat.toFixed(7)},${wp.alt.toFixed(1)}</coordinates>
          </Point>
        </Placemark>`
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(mission.name)}</name>
    <description>MAVLink mission: ${waypoints.length} items, ${(totalDistance(waypoints) / 1000).toFixed(1)}km total</description>
    <Style id="track">
      <LineStyle>
        <color>ff0000ff</color>
        <width>3</width>
      </LineStyle>
    </Style>
    <Folder>
      <name>Waypoints</name>
${placemarks}
    </Folder>
    <Placemark>
      <name>Flight Path</name>
      <styleUrl>#track</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
${coords.join('\n')}
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>
`
}

/**
 * QGroundControl `.plan` document (Plan file format v1).
 *
 * Authoritative waypoint payload is the 7-element `params` array
 * `[p1, p2, p3, p4, lat, lon, alt]` — identical to mavplan Python
 * `formats.to_qgc_plan`. The top-level `lat`/`lon` SimpleItem fields that
 * older writers used are NOT part of the QGC format and are ignored on read.
 */
export function toQgcPlan(
  mission: MissionDoc,
  cruiseSpeed = 10,
  hoverSpeed = 5
): Record<string, unknown> {
  const home: [number, number, number] = mission.home ?? [
    mission.waypoints[0]?.lat ?? 0,
    mission.waypoints[0]?.lon ?? 0,
    0
  ]
  const items = mission.waypoints.map((wp) => ({
    AMSLAltAboveTerrain: null,
    Altitude: wp.alt,
    AltitudeMode: wp.frame === 0 ? 0 : 1,
    autoContinue: wp.autocontinue === 1,
    command: wp.command,
    doJumpId: null,
    frame: wp.frame,
    params: [
      wp.delay,
      wp.acceptance_radius,
      wp.orbit,
      wp.yaw,
      wp.lat,
      wp.lon,
      wp.alt
    ],
    type: 'SimpleItem',
    coordinate: [wp.lat, wp.lon],
    relativeAltitude: wp.frame !== 0
  }))
  return {
    fileType: 'Plan',
    geoFence: { circles: [], polygons: [], version: 1 },
    groundStation: 'mavplan-web',
    mission: {
      cruiseSpeed,
      firmwareType: 12,
      globalPlanAltitudeMode: 1,
      hoverSpeed,
      items,
      plannedHomePosition: home,
      vehicleType: 2,
      version: 2
    },
    rallyPoints: { points: [], version: 1 },
    version: 1
  }
}

/* ------------------------------------------------------------------ *
 * Parsing / format sniffing
 * ------------------------------------------------------------------ */

export type MissionFormat = 'mission-json' | 'qgc-plan' | 'wpl'

export function sniffFormat(text: string): MissionFormat | null {
  const trimmed = text.replace(/^﻿/, '').trim()
  if (!trimmed) return null
  if (trimmed.startsWith('QGC WPL')) return 'wpl'
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed) as Record<string, unknown>
      if (data.fileType === 'Plan' || data.mission) return 'qgc-plan'
      if (Array.isArray(data.waypoints)) return 'mission-json'
    } catch {
      return null
    }
  }
  return null
}

export function parseWpl(text: string): MissionDoc {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
  if (!lines.length || !lines[0].startsWith('QGC WPL')) {
    throw new Error('Not a QGC WPL file (missing header)')
  }
  const mission = createMission('Imported WPL mission')
  for (const line of lines.slice(1)) {
    // QGC/Mission Planner emit tabs; be liberal with commas / whitespace.
    const cells = line.replace(/,/g, '\t').split(/\s+/).filter((c) => c.length > 0)
    if (cells.length < 11) continue
    const seq = Number(cells[0])
    const frame = Number(cells[2])
    const command = Number(cells[3])
    const p1 = Number(cells[4])
    const p2 = Number(cells[5])
    const p3 = Number(cells[6])
    const p4 = Number(cells[7])
    const lat = Number(cells[8])
    const lon = Number(cells[9])
    const alt = Number(cells[10])
    const autocontinue = cells.length > 11 ? Number(cells[11]) : 1
    // Leading HOME row (NAV_WAYPOINT + MAV_FRAME_GLOBAL) is metadata, not a flown item.
    if (command === NAV_WAYPOINT && frame === 0 && mission.home === null) {
      mission.home = [lat, lon, alt]
      continue
    }
    mission.waypoints.push(
      createWaypoint({
        frame,
        command,
        autocontinue,
        delay: p1,
        acceptance_radius: p2,
        orbit: p3,
        yaw: p4,
        lat,
        lon,
        alt
      })
    )
  }
  resequence(mission.waypoints)
  return mission
}

export function parseQgcPlan(text: string): MissionDoc {
  const data = JSON.parse(text.replace(/^﻿/, '')) as Record<string, unknown>
  if (data.fileType && data.fileType !== 'Plan') {
    throw new Error('Not a QGroundControl .plan file (missing fileType "Plan")')
  }
  const missionBlock = (data.mission ?? {}) as Record<string, unknown>
  const items = Array.isArray(missionBlock.items) ? (missionBlock.items as Record<string, unknown>[]) : []
  const mission = createMission('Imported QGC plan')
  const home = Array.isArray(missionBlock.plannedHomePosition)
    ? (missionBlock.plannedHomePosition as number[])
    : null
  if (home && home.length >= 2) {
    mission.home = [Number(home[0]), Number(home[1]), Number(home[2] ?? 0)]
  }
  for (const item of items) {
    if (item.type && item.type !== 'SimpleItem') continue
    const params = Array.isArray(item.params) ? (item.params as unknown[]) : []
    const coordinate = Array.isArray(item.coordinate) ? (item.coordinate as number[]) : null
    // Authoritative: params = [p1, p2, p3, p4, lat, lon, alt] (QGC + mavplan Python).
    // Fall back to `coordinate: [lat, lon]` when params are missing or too short.
    const rawLat = params.length >= 7 ? Number(params[4]) : Number(coordinate?.[0] ?? NaN)
    const rawLon = params.length >= 7 ? Number(params[5]) : Number(coordinate?.[1] ?? NaN)
    const rawAlt = params.length >= 7 ? Number(params[6]) : Number(item.Altitude ?? coordinate?.[2] ?? 0)
    mission.waypoints.push(
      createWaypoint({
        lat: Number.isFinite(rawLat) ? rawLat : 0,
        lon: Number.isFinite(rawLon) ? rawLon : 0,
        alt: Number.isFinite(rawAlt) ? rawAlt : 0,
        frame: Number(item.frame ?? 3),
        command: Number(item.command ?? NAV_WAYPOINT),
        autocontinue: item.autoContinue === false ? 0 : 1,
        delay: Number(params[0] ?? 0),
        acceptance_radius: Number(params[1] ?? 2),
        orbit: Number(params[2] ?? 0),
        yaw: Number(params[3] ?? YAW_UNCONSTRAINED)
      })
    )
  }
  resequence(mission.waypoints)
  return mission
}

export function parseMissionText(text: string): { mission: MissionDoc; format: MissionFormat } {
  const cleaned = text.replace(/^﻿/, '')
  const format = sniffFormat(cleaned)
  if (!format) throw new Error('Unrecognised mission file — expected mavplan JSON, QGC .plan or QGC WPL')
  if (format === 'wpl') return { mission: parseWpl(cleaned), format }
  if (format === 'qgc-plan') return { mission: parseQgcPlan(cleaned), format }
  return { mission: fromDict(JSON.parse(cleaned) as Record<string, unknown>), format }
}

/* ------------------------------------------------------------------ *
 * Helpers used by the editor UI
 * ------------------------------------------------------------------ */

export function addActionAfter(
  waypoints: Waypoint[],
  afterSeq: number,
  command: number,
  param1 = 0
): Waypoint[] {
  const reference = waypoints[afterSeq]
  if (!reference) return waypoints
  const action = createWaypoint({
    lat: reference.lat,
    lon: reference.lon,
    alt: reference.alt,
    command,
    frame: reference.frame,
    delay: command === DO_SET_CAM_TRIGG_DIST || command === DO_SET_CAM_TRIGG_INTERVAL ? param1 : 0,
    yaw: reference.yaw
  })
  const next = [...waypoints]
  next.splice(afterSeq + 1, 0, action)
  return resequence(next)
}

export function addCameraTrigger(
  waypoints: Waypoint[],
  afterSeq: number,
  mode: 'distance' | 'time',
  value: number
): Waypoint[] {
  const command = mode === 'distance' ? DO_SET_CAM_TRIGG_DIST : DO_SET_CAM_TRIGG_INTERVAL
  return addActionAfter(waypoints, afterSeq, command, value)
}

/**
 * A small, realistic teaching sample: a lake search-and-rescue sweep over
 * Yunlong Lake (云龙湖), Xuzhou, Jiangsu (江苏省徐州市) — replace with your own site.
 */
export function sampleMission(): MissionDoc {
  // Southwest shore of Yunlong Lake (云龙湖), Xuzhou, Jiangsu (江苏省徐州市)
  const origin = { lat: 34.2472, lon: 117.1856 }
  const mission = createMission('江苏省徐州市 云龙湖')
  mission.home = [origin.lat, origin.lon, 0]
  const legs: Array<[number, number, number]> = [
    [0, 0, 60],
    [0.0035, 0, 60],
    [0.0035, 0.0035, 60],
    [0.007, 0.0035, 60],
    [0.007, 0.007, 60],
    [0.0105, 0.007, 60],
    [0.0105, 0.0035, 60],
    [0.014, 0.0035, 60],
    [0.014, 0, 45]
  ]
  waypointsPush(mission, legs, origin)
  mission.waypoints.push(
    createWaypoint({ lat: origin.lat + 0.014, lon: origin.lon, alt: 20, speed: 5, command: 21 })
  )
  return mission
}

function waypointsPush(
  mission: MissionDoc,
  legs: Array<[number, number, number]>,
  origin: { lat: number; lon: number }
): void {
  for (const [dLat, dLon, alt] of legs) {
    mission.waypoints.push(
      createWaypoint({ lat: origin.lat + dLat, lon: origin.lon + dLon, alt, speed: 8 })
    )
  }
  resequence(mission.waypoints)
}
