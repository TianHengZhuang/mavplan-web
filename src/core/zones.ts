/**
 * No-fly zone JSON in the mavplan Python layout
 * (`mavplan.nofly.load_zones_json` / `Zone.to_dict`).
 *
 * Accepted root shapes:
 *   - bare array of zone dicts
 *   - `{"zones": [...]}`
 *   - a single zone dict
 *
 * Python zone fields: name, kind ("circle"|"polygon"), lat, lon,
 * radius_m, optional vertices as [[lat, lon], ...].
 * Web keeps an extra `ceilingM` (UI-only; ignored by Python).
 */

import type { LatLon } from './geo'
import type { PolygonZone, Zone } from './preflight'

let zoneSeq = 0

function nextZoneId(prefix = 'zone'): string {
  zoneSeq += 1
  return `${prefix}-${Date.now().toString(36)}-${zoneSeq}`
}

export interface PythonZoneDict {
  name: string
  kind: string
  lat?: number
  lon?: number
  radius_m?: number
  vertices?: Array<[number, number] | { lat: number; lon: number }>
  ceiling_m?: number
  ceilingM?: number
}

function parseVertices(raw: PythonZoneDict['vertices']): LatLon[] {
  if (!Array.isArray(raw)) return []
  const ring: LatLon[] = []
  for (const v of raw) {
    if (Array.isArray(v) && v.length >= 2) {
      ring.push({ lat: Number(v[0]), lon: Number(v[1]) })
    } else if (v && typeof v === 'object' && 'lat' in v && 'lon' in v) {
      const point = v as { lat: number; lon: number }
      ring.push({ lat: Number(point.lat), lon: Number(point.lon) })
    }
  }
  // Drop a closing duplicate the way Python `polygon_ring()` does.
  if (ring.length >= 2) {
    const a = ring[0]
    const b = ring[ring.length - 1]
    if (Math.abs(a.lat - b.lat) < 1e-12 && Math.abs(a.lon - b.lon) < 1e-12) {
      ring.pop()
    }
  }
  return ring
}

export function zoneFromPythonDict(raw: PythonZoneDict, index = 0): Zone {
  const kind = raw.kind === 'polygon' ? 'polygon' : 'circle'
  const name = raw.name || `zone-${index + 1}`
  const ceilingM = Number(raw.ceilingM ?? raw.ceiling_m ?? 0)
  if (kind === 'polygon') {
    const vertices = parseVertices(raw.vertices)
    if (vertices.length < 3) {
      throw new Error(`Polygon zone "${name}" needs at least 3 vertices`)
    }
    const anchor = vertices[0]
    const zone: PolygonZone = {
      id: nextZoneId('poly'),
      kind: 'polygon',
      name,
      vertices,
      ceilingM: Number.isFinite(ceilingM) ? ceilingM : 0,
      lat: anchor.lat,
      lon: anchor.lon
    }
    return zone
  }
  const lat = Number(raw.lat)
  const lon = Number(raw.lon)
  const radiusM = Number(raw.radius_m ?? 50)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !(radiusM > 0)) {
    throw new Error(`Circle zone "${name}" needs lat, lon and positive radius_m`)
  }
  return {
    id: nextZoneId('circ'),
    kind: 'circle',
    name,
    lat,
    lon,
    radiusM,
    ceilingM: Number.isFinite(ceilingM) ? ceilingM : 0
  }
}

export function zonesFromPythonDict(raw: PythonZoneDict): Zone {
  return zoneFromPythonDict(raw)
}

/** Parse a zones JSON document produced by mavplan Python (or hand-written). */
export function parseZonesJson(text: string): Zone[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Zones file is not valid JSON')
  }
  let list: unknown
  if (Array.isArray(data)) list = data
  else if (data && typeof data === 'object' && Array.isArray((data as { zones?: unknown }).zones)) {
    list = (data as { zones: unknown[] }).zones
  } else if (data && typeof data === 'object' && 'kind' in (data as object)) {
    list = [data]
  } else {
    throw new Error('Zones JSON must be an array, {"zones":[...]} or a single zone')
  }
  return (list as PythonZoneDict[]).map((item, index) => zoneFromPythonDict(item, index))
}

export function zoneToPythonDict(zone: Zone): PythonZoneDict {
  if (zone.kind === 'polygon') {
    const polygon = zone as PolygonZone
    const ring = polygon.vertices
    const anchor = ring[0] ?? { lat: 0, lon: 0 }
    const dict: PythonZoneDict = {
      name: polygon.name,
      kind: 'polygon',
      lat: Number(anchor.lat.toFixed(7)),
      lon: Number(anchor.lon.toFixed(7)),
      radius_m: 0,
      vertices: ring.map((v) => [Number(v.lat.toFixed(7)), Number(v.lon.toFixed(7))] as [number, number])
    }
    if (polygon.ceilingM > 0) dict.ceiling_m = polygon.ceilingM
    return dict
  }
  const dict: PythonZoneDict = {
    name: zone.name,
    kind: 'circle',
    lat: Number(zone.lat.toFixed(7)),
    lon: Number(zone.lon.toFixed(7)),
    radius_m: Number(zone.radiusM.toFixed(1))
  }
  if (zone.ceilingM > 0) dict.ceiling_m = zone.ceilingM
  return dict
}

/** Serialize zones for `mavplan mission check --zones-json` / Python load. */
export function toZonesJson(zones: Zone[]): string {
  const payload = { zones: zones.map(zoneToPythonDict) }
  return JSON.stringify(payload, null, 2)
}
