import { describe, expect, it } from 'vitest'
import {
  DO_SET_HOME,
  NAV_WAYPOINT,
  commandName,
  isAction,
  isNavigable
} from '../src/core/actions'
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
  parseQgcPlan,
  parseWpl,
  resequence,
  sampleMission,
  toQgcPlan,
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

  it('reads a real QGC WPL 110 file with the standard column order', () => {
    // seq current frame command p1 p2 p3 p4 x y z autocontinue
    const text = [
      'QGC WPL 110',
      '0\t1\t0\t16\t0\t0\t0\t0\t22.8000000\t108.3000000\t0.00\t1',
      '1\t0\t3\t22\t0\t0\t0\t0\t22.8010000\t108.3000000\t45.00\t1',
      '2\t0\t3\t16\t5.0\t2.0\t0.0\t90.0\t22.8020000\t108.3010000\t60.00\t1',
      '3\t0\t3\t16\t0.0\t2.0\t0.0\t-9999.0\t22.8030000\t108.3020000\t55.00\t1'
    ].join('\n')
    const mission = parseWpl(text)
    expect(mission.home).toEqual([22.8, 108.3, 0])
    expect(mission.waypoints.length).toBe(3)
    expect(mission.waypoints[0].command).toBe(22)
    expect(mission.waypoints[0].lat).toBeCloseTo(22.801, 6)
    expect(mission.waypoints[1].delay).toBeCloseTo(5, 6)
    expect(mission.waypoints[1].yaw).toBeCloseTo(90, 6)
    expect(mission.waypoints[1].lat).toBeCloseTo(22.802, 6)
    expect(mission.waypoints[1].lon).toBeCloseTo(108.301, 6)
    expect(mission.waypoints[1].alt).toBeCloseTo(60, 6)
  })

  it('writes WPL with autocontinue in the last column (QGC order)', () => {
    const wp = createWaypoint({ lat: 22.81, lon: 108.31, alt: 50, delay: 3, yaw: 45, autocontinue: 1 })
    const text = toWpl([wp])
    const cells = text.split('\n')[1].split('\t')
    expect(cells.length).toBe(12)
    expect(cells[3]).toBe(String(NAV_WAYPOINT))
    expect(Number(cells[4])).toBeCloseTo(3, 6)
    expect(Number(cells[7])).toBeCloseTo(45, 6)
    expect(Number(cells[8])).toBeCloseTo(22.81, 6)
    expect(cells[11]).toBe('1')
  })

  it('round-trips a QGC .plan through the 7-element params array', () => {
    const mission = createMission('plan-roundtrip')
    mission.home = [22.8, 108.3, 0]
    mission.waypoints = [
      createWaypoint({ lat: 22.801, lon: 108.301, alt: 50, speed: 8, delay: 1.5, yaw: 90 }),
      createWaypoint({ lat: 22.802, lon: 108.302, alt: 60, speed: 8 })
    ]
    resequence(mission.waypoints)
    const plan = toQgcPlan(mission)
    const parsed = parseQgcPlan(JSON.stringify(plan))
    expect(parsed.home?.[0]).toBeCloseTo(22.8, 6)
    expect(parsed.waypoints.length).toBe(2)
    expect(parsed.waypoints[0].lat).toBeCloseTo(22.801, 6)
    expect(parsed.waypoints[0].lon).toBeCloseTo(108.301, 6)
    expect(parsed.waypoints[0].alt).toBeCloseTo(50, 6)
    expect(parsed.waypoints[0].delay).toBeCloseTo(1.5, 6)
    expect(parsed.waypoints[0].yaw).toBeCloseTo(90, 6)
    expect(parsed.waypoints[1].lat).toBeCloseTo(22.802, 6)
  })

  it('reads a QGC plan that only carries coordinate arrays', () => {
    const plan = {
      fileType: 'Plan',
      mission: {
        plannedHomePosition: [22.8, 108.3, 0],
        items: [
          {
            type: 'SimpleItem',
            command: 16,
            frame: 3,
            autoContinue: true,
            Altitude: 55,
            params: [0, 2, 0, -9999, 22.805, 108.305, 55],
            coordinate: [22.805, 108.305]
          },
          {
            type: 'SimpleItem',
            command: 16,
            frame: 3,
            autoContinue: true,
            Altitude: 40,
            params: [0, 0, 0, 0],
            coordinate: [22.806, 108.306]
          }
        ]
      }
    }
    const mission = parseQgcPlan(JSON.stringify(plan))
    expect(mission.waypoints[0].lat).toBeCloseTo(22.805, 6)
    expect(mission.waypoints[0].lon).toBeCloseTo(108.305, 6)
    expect(mission.waypoints[1].lat).toBeCloseTo(22.806, 6)
    expect(mission.waypoints[1].lon).toBeCloseTo(108.306, 6)
  })

  it('exports WPL with a leading HOME row when home is set', () => {
    const wp = createWaypoint({ lat: 22.81, lon: 108.31, alt: 50 })
    const text = toWpl([wp], 'QGC WPL 120', [22.8, 108.3, 0])
    const lines = text.split('\n')
    expect(lines).toHaveLength(3)
    const homeCells = lines[1].split('\t')
    expect(Number(homeCells[2])).toBe(0)
    expect(Number(homeCells[8])).toBeCloseTo(22.8, 6)
    const parsed = parseWpl(text)
    expect(parsed.home?.[0]).toBeCloseTo(22.8, 6)
    expect(parsed.waypoints).toHaveLength(1)
    expect(parsed.waypoints[0].lat).toBeCloseTo(22.81, 6)
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
