import { describe, expect, it } from 'vitest'
import { NAV_WAYPOINT, DO_SET_HOME, commandName, isAction, isNavigable } from '../src/core/actions'
import {
  bearingDeg,
  distancePointToSegment,
  formatDistance,
  formatDuration,
  fromLocalXY,
  haversineDistance,
  minTurnRadius,
  pointInPolygon,
  toLocalXY
} from '../src/core/geo'
import {
  createMission,
  createWaypoint,
  missionStats,
  parseMissionText,
  resequence,
  sampleMission,
  toWpl,
  type Waypoint
} from '../src/core/mission'
import {
  boundingRectangle,
  generateLawnMower,
  generateOrbit,
  generatePolygonScan,
  polygonAreaM2
} from '../src/core/pattern'
import {
  defaultParams,
  preflightCheck,
  segmentZoneRelation,
  type CircleZone,
  type PolygonZone
} from '../src/core/preflight'

const ORIGIN = { lat: 22.8, lon: 108.3 }

function rect(widthM: number, heightM: number) {
  return { corner1: ORIGIN, corner2: fromLocalXY(ORIGIN, { x: widthM, y: heightM }) }
}

function straightMission(alt = 60, legs = 3): Waypoint[] {
  const waypoints: Waypoint[] = []
  for (let i = 0; i < legs; i += 1) {
    const point = fromLocalXY(ORIGIN, { x: i * 150, y: 0 })
    waypoints.push(createWaypoint({ seq: i + 1, lat: point.lat, lon: point.lon, alt, speed: 8 }))
  }
  return waypoints
}

describe('geo helpers', () => {
  it('measures great-circle distance with metre accuracy', () => {
    const d = haversineDistance({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })
    expect(d).toBeGreaterThan(111000)
    expect(d).toBeLessThan(111500)
  })

  it('keeps local XY projection reversible', () => {
    const xy = toLocalXY(ORIGIN, fromLocalXY(ORIGIN, { x: 250, y: -80 }))
    expect(Math.abs(xy.x - 250)).toBeLessThan(0.5)
    expect(Math.abs(xy.y + 80)).toBeLessThan(0.5)
  })

  it('derives bearings and turn radii', () => {
    const north = bearingDeg({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })
    expect(Math.abs(north)).toBeLessThan(0.5)
    const radius = minTurnRadius(10, 30)
    expect(radius).toBeGreaterThan(15)
    expect(radius).toBeLessThan(20)
  })

  it('detects points inside a polygon and distances to segments', () => {
    const square = [
      { lat: 22.8, lon: 108.3 },
      { lat: 22.8, lon: 108.31 },
      { lat: 22.81, lon: 108.31 },
      { lat: 22.81, lon: 108.3 }
    ]
    expect(pointInPolygon({ lat: 22.805, lon: 108.305 }, square)).toBe(true)
    expect(pointInPolygon({ lat: 22.9, lon: 108.9 }, square)).toBe(false)
    const mid = fromLocalXY(ORIGIN, { x: 0, y: 50 })
    const d = distancePointToSegment(mid, ORIGIN, fromLocalXY(ORIGIN, { x: 0, y: 100 }))
    expect(d).toBeLessThan(1)
  })

  it('formats distances and durations for the UI', () => {
    expect(formatDistance(1500)).toContain('1')
    expect(formatDuration(90)).toMatch(/1|90/)
  })
})

describe('pattern generators', () => {
  it('covers a rectangular block lane by lane', () => {
    const { corner1, corner2 } = rect(200, 100)
    const waypoints = generateLawnMower({
      corner1,
      corner2,
      altitude: 40,
      speed: 7,
      laneSpacing: 25,
      startCorner: 'SW',
      startFromOuter: true
    })
    // 100 m of height at 25 m spacing gives 5 lanes, two points each.
    expect(waypoints.length).toBe(10)
    expect(waypoints[0].alt).toBe(40)
    // seq is a zero-based index into the list: the canvas and the profile
    // charts both look waypoints up by seq, so 10 points end at seq 9.
    expect(resequence(waypoints).map((wp) => wp.seq)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('closes an orbit with the requested number of points', () => {
    const waypoints = generateOrbit({
      center: ORIGIN,
      radiusM: 60,
      altitude: 50,
      speed: 6,
      points: 12,
      direction: 'cw',
      startBearing: 0
    })
    expect(waypoints.length).toBe(12)
    const first = waypoints[0]
    expect(haversineDistance(ORIGIN, { lat: first.lat, lon: first.lon })).toBeGreaterThan(50)
  })

  it('scans a polygon and reports its geometry', () => {
    const { corner1, corner2 } = rect(200, 100)
    const vertices = [
      corner1,
      { lat: corner1.lat, lon: corner2.lon },
      corner2,
      { lat: corner2.lat, lon: corner1.lon }
    ]
    const box = boundingRectangle(vertices)
    expect(box).not.toBeNull()
    expect(Math.abs((box as NonNullable<typeof box>).widthM - 200)).toBeLessThan(3)
    expect(Math.abs((box as NonNullable<typeof box>).heightM - 100)).toBeLessThan(3)
    expect(Math.abs(polygonAreaM2(vertices) - 20000)).toBeLessThan(400)

    const waypoints = generatePolygonScan({
      vertices,
      altitude: 35,
      speed: 6,
      laneSpacing: 25,
      sweepAngle: 0,
      startFromOuter: true
    })
    expect(waypoints.length).toBeGreaterThanOrEqual(8)
  })
})

describe('mission document', () => {
  it('ships a usable sample mission', () => {
    const mission = sampleMission()
    expect(mission.waypoints.length).toBeGreaterThan(2)
    const stats = missionStats(mission.waypoints)
    expect(stats.count).toBe(mission.waypoints.length)
    expect(stats.distanceM).toBeGreaterThan(0)
  })

  it('round-trips through the WPL writer and reader', () => {
    const waypoints = straightMission(70, 4)
    const text = toWpl(waypoints)
    const parsed = parseMissionText(text)
    expect(parsed.format).toBe('wpl')
    expect(parsed.mission.waypoints.length).toBe(waypoints.length)
    expect(Math.abs(parsed.mission.waypoints[1].lon - waypoints[1].lon)).toBeLessThan(1e-5)
    expect(parsed.mission.waypoints[0].alt).toBeCloseTo(70, 3)
  })

  it('renumbers waypoints after edits', () => {
    const waypoints = straightMission(50, 3)
    waypoints.splice(1, 1)
    expect(resequence(waypoints).map((wp) => wp.seq)).toEqual([0, 1])
  })
})

describe('preflight console', () => {
  it('clears a nominal mission', () => {
    const mission = { ...createMission('nominal'), waypoints: straightMission(60, 3) }
    const report = preflightCheck(mission, defaultParams(), [])
    expect(report.items.some((item) => item.code === 'no-waypoints')).toBe(false)
    expect(report.cleared).toBe(true)
    expect(report.distanceM).toBeGreaterThan(250)
    expect(report.availableMah).toBeGreaterThan(0)
  })

  it('flags over-altitude and over-distance waypoints', () => {
    const params = { ...defaultParams(), maxAltitudeM: 100, maxDistanceM: 200 }
    const mission = { ...createMission('too high'), waypoints: straightMission(150, 3) }
    const report = preflightCheck(mission, params, [])
    expect(report.cleared).toBe(false)
    expect(report.items.some((item) => item.code === 'altitude-exceeded')).toBe(true)
    expect(report.items.some((item) => item.code === 'distance-exceeded')).toBe(true)
  })

  it('blocks missions that enter a no-fly zone', () => {
    const waypoints = straightMission(60, 3)
    const circle: CircleZone = {
      id: 'nfz-1',
      kind: 'circle',
      name: 'Airport',
      lat: waypoints[1].lat,
      lon: waypoints[1].lon,
      radiusM: 80,
      ceilingM: 100
    }
    expect(['inside', 'intersect']).toContain(segmentZoneRelation(waypoints[0], waypoints[1], circle))

    const mission = { ...createMission('zone'), waypoints }
    const report = preflightCheck(mission, defaultParams(), [circle])
    expect(report.cleared).toBe(false)
    expect(report.items.some((item) => item.code === 'zone-inside' || item.code === 'zone-intersect')).toBe(true)
  })

  it('reports insufficient battery for a long mission', () => {
    const params = defaultParams()
    params.battery.capacityMah = 300
    params.reservePercent = 10
    const mission = { ...createMission('long'), waypoints: straightMission(80, 8) }
    const report = preflightCheck(mission, params, [])
    expect(report.items.some((item) => item.code === 'battery-insufficient')).toBe(true)
    expect(report.requiredMah).toBeGreaterThan(report.availableMah)
  })

  it('handles polygon zones with ceilings', () => {
    const waypoints = straightMission(40, 4)
    const lats = waypoints.map((wp) => wp.lat)
    const lons = waypoints.map((wp) => wp.lon)
    const polygon: PolygonZone = {
      id: 'nfz-2',
      kind: 'polygon',
      name: 'Training box',
      vertices: [
        { lat: Math.min(...lats) - 0.001, lon: Math.min(...lons) - 0.001 },
        { lat: Math.min(...lats) - 0.001, lon: Math.max(...lons) + 0.001 },
        { lat: Math.max(...lats) + 0.001, lon: Math.max(...lons) + 0.001 },
        { lat: Math.max(...lats) + 0.001, lon: Math.min(...lons) - 0.001 }
      ],
      ceilingM: 60
    }
    const mission = { ...createMission('poly'), waypoints }
    const report = preflightCheck(mission, defaultParams(), [polygon])
    expect(report.cleared).toBe(false)
    expect(report.errors).toBeGreaterThan(0)
  })
})

describe('command catalogue', () => {
  it('classifies navigation and action items', () => {
    expect(isAction(DO_SET_HOME)).toBe(true)
    expect(isAction(NAV_WAYPOINT)).toBe(false)
    expect(isNavigable(NAV_WAYPOINT)).toBe(true)
    expect(commandName(NAV_WAYPOINT).length).toBeGreaterThan(0)
  })
})
