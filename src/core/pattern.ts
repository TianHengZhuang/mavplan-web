/**
 * Survey pattern generators — a browser port of `src/mavplan/pattern.py`.
 *
 * Every generator returns plain {@link Waypoint} objects with `seq` left at 0;
 * the caller is responsible for re-sequencing and for choosing append/replace
 * semantics (see the mission store).
 */

import { NAV_WAYPOINT } from './actions'
import {
  type LatLon,
  type XY,
  clamp,
  destination,
  fromLocalXY,
  pointInPolygon,
  rotateXY,
  toLocalXY
} from './geo'
import { createWaypoint, type Waypoint } from './mission'

export type StartCorner = 'NW' | 'NE' | 'SW' | 'SE'

export interface LawnMowerParams {
  corner1: LatLon
  corner2: LatLon
  altitude: number
  /** Leg speed in m/s; 0 = autopilot default. */
  speed: number
  /** Distance between adjacent survey lanes, metres. */
  laneSpacing: number
  startCorner: StartCorner
  /** true = work the block from the outer lane inward; false = from the far edge back. */
  startFromOuter: boolean
}

export interface OrbitParams {
  center: LatLon
  radiusM: number
  altitude: number
  speed: number
  points: number
  direction: 'cw' | 'ccw'
  /** Bearing of the first orbit point, degrees. */
  startBearing: number
}

export interface PolygonScanParams {
  vertices: LatLon[]
  altitude: number
  speed: number
  laneSpacing: number
  /** Bearing of the survey lanes, degrees (0 = north-south lanes are 90). */
  sweepAngle: number
  startFromOuter: boolean
}

export interface RectangleExtent {
  corner1: LatLon
  corner2: LatLon
  widthM: number
  heightM: number
  areaM2: number
}

function waypointAt(point: LatLon, altitude: number, speed: number): Waypoint {
  return createWaypoint({
    lat: point.lat,
    lon: point.lon,
    alt: altitude,
    speed,
    command: NAV_WAYPOINT
  })
}

/** Axis-aligned bounding rectangle of a vertex list, as two corner points. */
export function boundingRectangle(vertices: LatLon[]): RectangleExtent | null {
  if (!vertices.length) return null
  const lats = vertices.map((v) => v.lat)
  const lons = vertices.map((v) => v.lon)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLon = Math.min(...lons)
  const maxLon = Math.max(...lons)
  const corner1: LatLon = { lat: minLat, lon: minLon }
  const corner2: LatLon = { lat: maxLat, lon: maxLon }
  const widthM = Math.abs(toLocalXY(corner1, { lat: minLat, lon: maxLon }).x)
  const heightM = Math.abs(toLocalXY(corner1, { lat: maxLat, lon: minLon }).y)
  return { corner1, corner2, widthM, heightM, areaM2: widthM * heightM }
}

/** Shoelace area of a small polygon (local tangent plane approximation). */
export function polygonAreaM2(vertices: LatLon[]): number {
  if (vertices.length < 3) return 0
  const origin = vertices[0]
  const pts = vertices.map((v) => toLocalXY(origin, v))
  let sum = 0
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    sum += a.x * b.y - b.x * a.y
  }
  return Math.abs(sum) / 2
}

/* ------------------------------------------------------------------ *
 * Lawn-mower (back-and-forth) survey over a rectangle
 * ------------------------------------------------------------------ */

export function generateLawnMower(params: LawnMowerParams): Waypoint[] {
  const spacing = Math.max(1, params.laneSpacing)
  const a: XY = { x: 0, y: 0 }
  const b = toLocalXY(params.corner1, params.corner2)
  const xMin = Math.min(a.x, b.x)
  const xMax = Math.max(a.x, b.x)
  const yMin = Math.min(a.y, b.y)
  const yMax = Math.max(a.y, b.y)
  const height = yMax - yMin

  const laneCount = Math.max(1, Math.floor(height / spacing + 1e-6) + 1)
  const lanes: number[] = []
  for (let k = 0; k < laneCount; k += 1) {
    // Spread the lanes evenly so the last lane always sits on the far edge.
    const y = laneCount === 1 ? yMin : yMin + (height * k) / (laneCount - 1)
    lanes.push(y)
  }

  const fromSouth = params.startCorner === 'SW' || params.startCorner === 'SE'
  const ordered = fromSouth ? lanes.slice() : lanes.slice().reverse()
  if (!params.startFromOuter) ordered.reverse()

  const firstHeadsEast = params.startCorner === 'SW' || params.startCorner === 'NW'

  const waypoints: Waypoint[] = []
  ordered.forEach((y, index) => {
    const headsEast = index % 2 === 0 ? firstHeadsEast : !firstHeadsEast
    const xs = headsEast ? [xMin, xMax] : [xMax, xMin]
    for (const x of xs) {
      waypoints.push(
        waypointAt(fromLocalXY(params.corner1, { x, y }), params.altitude, params.speed)
      )
    }
  })
  return waypoints
}

/* ------------------------------------------------------------------ *
 * Circular orbit
 * ------------------------------------------------------------------ */

export function generateOrbit(params: OrbitParams): Waypoint[] {
  const points = clamp(Math.round(params.points), 3, 360)
  const step = 360 / points
  const waypoints: Waypoint[] = []
  for (let i = 0; i < points; i += 1) {
    const offset = params.direction === 'cw' ? -i * step : i * step
    const bearing = (params.startBearing + offset + 360) % 360
    waypoints.push(
      waypointAt(
        destination(params.center, Math.max(1, params.radiusM), bearing),
        params.altitude,
        params.speed
      )
    )
  }
  return waypoints
}

/* ------------------------------------------------------------------ *
 * Polygon survey (rotated lane sweep with polygon clipping)
 * ------------------------------------------------------------------ */

interface LanePair {
  x1: number
  x2: number
}

function centroid(vertices: LatLon[]): LatLon {
  const lat = vertices.reduce((sum, v) => sum + v.lat, 0) / vertices.length
  const lon = vertices.reduce((sum, v) => sum + v.lon, 0) / vertices.length
  return { lat, lon }
}

/** Crossings of the horizontal line `y` with the polygon, in rotated space. */
function laneCrossings(rotated: XY[], y: number): number[] {
  const xs: number[] = []
  for (let i = 0; i < rotated.length; i += 1) {
    const p = rotated[i]
    const q = rotated[(i + 1) % rotated.length]
    if (Math.abs(p.y - q.y) < 1e-9) {
      if (Math.abs(p.y - y) < 1e-9) {
        xs.push(p.x, q.x)
      }
      continue
    }
    const crosses = (p.y - y) * (q.y - y) <= 0
    if (!crosses) continue
    const t = (y - p.y) / (q.y - p.y)
    xs.push(p.x + t * (q.x - p.x))
  }
  xs.sort((left, right) => left - right)
  const deduped: number[] = []
  for (const x of xs) {
    if (!deduped.length || Math.abs(x - deduped[deduped.length - 1]) > 0.05) deduped.push(x)
  }
  return deduped
}

export function generatePolygonScan(params: PolygonScanParams): Waypoint[] {
  const vertices = params.vertices.filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lon))
  if (vertices.length < 3) return []
  const spacing = Math.max(1, params.laneSpacing)
  const origin = centroid(vertices)
  const rotated = vertices.map((v) => rotateXY(toLocalXY(origin, v), -params.sweepAngle))
  const yMin = Math.min(...rotated.map((p) => p.y))
  const yMax = Math.max(...rotated.map((p) => p.y))
  const height = yMax - yMin
  const laneCount = Math.max(1, Math.ceil(height / spacing) || 1)
  const step = laneCount > 1 ? height / (laneCount - 1) : 0

  const laneYs: number[] = []
  for (let k = 0; k < laneCount; k += 1) laneYs.push(yMin + step * k)
  if (!params.startFromOuter) laneYs.reverse()

  const lanes: LanePair[] = []
  for (const y of laneYs) {
    const xs = laneCrossings(rotated, y)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x1 = xs[i]
      const x2 = xs[i + 1]
      const midRotated: XY = { x: (x1 + x2) / 2, y }
      const midWorld = fromLocalXY(origin, rotateXY(midRotated, params.sweepAngle))
      if (pointInPolygon(midWorld, vertices)) lanes.push({ x1, x2 })
    }
  }

  const waypoints: Waypoint[] = []
  lanes.forEach((lane, index) => {
    const forward = index % 2 === 0
    const ends = forward ? [lane.x1, lane.x2] : [lane.x2, lane.x1]
    for (const x of ends) {
      const world = fromLocalXY(origin, rotateXY({ x, y: laneYs[index] }, params.sweepAngle))
      waypoints.push(waypointAt(world, params.altitude, params.speed))
    }
  })
  return waypoints
}

/**
 * Rotate an existing mission so its first leg heads along `bearing`.
 * Useful for teaching how crab-angle compensation changes the ground track.
 */
export function rotateMissionWaypoints(waypoints: Waypoint[], bearing: number): Waypoint[] {
  if (waypoints.length < 2) return waypoints.map((wp) => ({ ...wp }))
  const origin = waypoints[0]
  return waypoints.map((wp) => {
    const local = toLocalXY(origin, wp)
    const rotated = rotateXY(local, bearing)
    const world = fromLocalXY(origin, rotated)
    return { ...wp, lat: world.lat, lon: world.lon }
  })
}
