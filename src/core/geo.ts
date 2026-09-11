/**
 * Geodesy helpers shared by the mission editor, pattern generator and
 * preflight console.
 *
 * Conventions: distances in metres, bearings in degrees (0 = north, clockwise),
 * coordinates in WGS-84 degrees.  The spherical-earth formulas mirror
 * `src/mavplan/pattern.py` and `src/mavplan/nofly.py` (R = 6 371 000 m) so a
 * browser preview and the Python CLI agree to the centimetre.
 */

export const EARTH_RADIUS_M = 6371000
export const METERS_PER_DEG_LAT = 111320

export interface LatLon {
  lat: number
  lon: number
}

/** Local tangent-plane offset: x = east, y = north, both in metres. */
export interface XY {
  x: number
  y: number
}

export const toRad = (deg: number): number => (deg * Math.PI) / 180
export const toDeg = (rad: number): number => (rad * 180) / Math.PI

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}

/** Great-circle distance in metres (haversine). */
export function haversineDistance(a: LatLon, b: LatLon): number {
  const phi1 = toRad(a.lat)
  const phi2 = toRad(b.lat)
  const dPhi = toRad(b.lat - a.lat)
  const dLambda = toRad(b.lon - a.lon)
  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Initial great-circle bearing from `a` to `b`, normalised to [0, 360). */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const phi1 = toRad(a.lat)
  const phi2 = toRad(b.lat)
  const dLambda = toRad(b.lon - a.lon)
  const x = Math.sin(dLambda) * Math.cos(phi2)
  const y =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda)
  return (toDeg(Math.atan2(x, y)) + 360) % 360
}

/** Destination point starting at `from`, travelling `distanceM` on `bearing`. */
export function destination(from: LatLon, distanceM: number, bearing: number): LatLon {
  const delta = distanceM / EARTH_RADIUS_M
  const theta = toRad(bearing)
  const phi1 = toRad(from.lat)
  const lambda1 = toRad(from.lon)
  const sinPhi2 =
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta)
  const phi2 = Math.asin(clamp(sinPhi2, -1, 1))
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * sinPhi2
    )
  return { lat: toDeg(phi2), lon: ((toDeg(lambda2) + 540) % 360) - 180 }
}

/** Metres per degree of longitude at a given latitude. */
export function metersPerDegLon(lat: number): number {
  return METERS_PER_DEG_LAT * Math.cos(toRad(clamp(lat, -89.9, 89.9)))
}

/** Project a geographic point onto a local east/north grid centred on `origin`. */
export function toLocalXY(origin: LatLon, p: LatLon): XY {
  return {
    x: (p.lon - origin.lon) * metersPerDegLon(origin.lat),
    y: (p.lat - origin.lat) * METERS_PER_DEG_LAT
  }
}

/** Inverse of {@link toLocalXY}. */
export function fromLocalXY(origin: LatLon, xy: XY): LatLon {
  return {
    lat: origin.lat + xy.y / METERS_PER_DEG_LAT,
    lon: origin.lon + xy.x / metersPerDegLon(origin.lat)
  }
}

/** Rotate a local offset by `deg` (counter-clockwise in a north-up frame). */
export function rotateXY(p: XY, deg: number): XY {
  const r = toRad(deg)
  const c = Math.cos(r)
  const s = Math.sin(r)
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

export function midpoint(a: LatLon, b: LatLon): LatLon {
  return { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 }
}

export interface GeoBounds {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

export function boundsOf(points: LatLon[]): GeoBounds | null {
  if (!points.length) return null
  let minLat = Infinity
  let maxLat = -Infinity
  let minLon = Infinity
  let maxLon = -Infinity
  for (const p of points) {
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLon = Math.min(minLon, p.lon)
    maxLon = Math.max(maxLon, p.lon)
  }
  return { minLat, maxLat, minLon, maxLon }
}

/** Ray-casting point-in-polygon test (polygon = ordered vertices, closed implicitly). */
export function pointInPolygon(p: LatLon, polygon: LatLon[]): boolean {
  if (polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].lat
    const xi = polygon[i].lon
    const yj = polygon[j].lat
    const xj = polygon[j].lon
    const intersects =
      yi > p.lat !== yj > p.lat &&
      p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi || Number.EPSILON) + xi
    if (intersects) inside = !inside
  }
  return inside
}

/** Shortest distance from `p` to segment `a`–`b`, in metres (local tangent plane). */
export function distancePointToSegment(p: LatLon, a: LatLon, b: LatLon): number {
  const origin = a
  const pa = toLocalXY(origin, p)
  const pb = toLocalXY(origin, b)
  const vx = pb.x
  const vy = pb.y
  const len2 = vx * vx + vy * vy
  if (len2 === 0) return Math.hypot(pa.x, pa.y)
  const t = clamp((pa.x * vx + pa.y * vy) / len2, 0, 1)
  const cx = vx * t
  const cy = vy * t
  return Math.hypot(pa.x - cx, pa.y - cy)
}

function orientation(a: LatLon, b: LatLon, c: LatLon): number {
  const origin = a
  const pb = toLocalXY(origin, b)
  const pc = toLocalXY(origin, c)
  return pb.x * pc.y - pb.y * pc.x
}

function onSegment(a: LatLon, b: LatLon, p: LatLon, epsM = 0.5): boolean {
  return distancePointToSegment(p, a, b) <= epsM
}

/** True when segments `a`–`b` and `c`–`d` cross (or touch within 0.5 m). */
export function segmentsIntersect(a: LatLon, b: LatLon, c: LatLon, d: LatLon): boolean {
  const d1 = orientation(c, d, a)
  const d2 = orientation(c, d, b)
  const d3 = orientation(a, b, c)
  const d4 = orientation(a, b, d)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }
  if (Math.abs(d1) < 1e-9 && onSegment(c, d, a)) return true
  if (Math.abs(d2) < 1e-9 && onSegment(c, d, b)) return true
  if (Math.abs(d3) < 1e-9 && onSegment(a, b, c)) return true
  if (Math.abs(d4) < 1e-9 && onSegment(a, b, d)) return true
  return false
}

/** True when segment `a`–`b` enters, touches or crosses the polygon boundary. */
export function segmentIntersectsPolygon(a: LatLon, b: LatLon, polygon: LatLon[]): boolean {
  if (polygon.length < 2) return false
  for (let i = 0; i < polygon.length; i += 1) {
    const c = polygon[i]
    const d = polygon[(i + 1) % polygon.length]
    if (segmentsIntersect(a, b, c, d)) return true
  }
  return pointInPolygon(a, polygon) || pointInPolygon(b, polygon)
}

/** Smallest heading change (0–180°) between two bearings. */
export function headingChangeDeg(b1: number, b2: number): number {
  const diff = Math.abs(((b2 - b1 + 540) % 360) - 180)
  return 180 - diff
}

/** Coordinated-turn radius for a given speed and bank limit. */
export function minTurnRadius(speedMs: number, bankDeg: number, g = 9.81): number {
  const bank = toRad(clamp(bankDeg, 1, 80))
  return (speedMs * speedMs) / (g * Math.tan(bank))
}

export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres)) return '—'
  if (Math.abs(metres) >= 1000) return `${(metres / 1000).toFixed(2)} km`
  return `${metres.toFixed(1)} m`
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:00'
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function formatCoord(value: number, digits = 6): string {
  return value.toFixed(digits)
}

/* ------------------------------------------------------------------ *
 * Web-Mercator helpers — only used by the optional OpenStreetMap layer
 * of the map canvas (offline vector rendering is the default).
 * ------------------------------------------------------------------ */

export function lonToTileX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * 2 ** zoom
}

export function latToTileY(lat: number, zoom: number): number {
  const rad = toRad(clamp(lat, -85.0511, 85.0511))
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom
}

export function tileXToLon(x: number, zoom: number): number {
  return (x / 2 ** zoom) * 360 - 180
}

export function tileYToLat(y: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** zoom
  return toDeg(Math.atan(Math.sinh(n)))
}
