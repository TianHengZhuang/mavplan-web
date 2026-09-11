import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DO_SET_CAM_TRIGG_DIST, NAV_RETURN_TO_LAUNCH, NAV_WAYPOINT, DO_SET_HOME } from '../src/core/actions'
import {
  coverageSummary,
  dataVolumeGb,
  estimatePhotoCount,
  footprintWidthM,
  forwardOverlapPct,
  groundSampleDistanceCm,
  spacingForOverlapM,
  triggerValueForOverlap
} from '../src/core/camera'
import {
  buildFlightPlan,
  cruiseElapsedS,
  legIndexAt,
  navigationCount,
  sampleFlight
} from '../src/core/flight'
import { fromLocalXY, haversineDistance } from '../src/core/geo'
import { createWaypoint, type Waypoint } from '../src/core/mission'
import { useMissionStore } from '../src/stores/mission'

const ORIGIN = { lat: 22.8, lon: 108.3 }

/** Straight line of `count` waypoints, 150 m apart, all at `alt`. */
function straightMission(alt = 60, count = 3, speed = 8): Waypoint[] {
  const waypoints: Waypoint[] = []
  for (let i = 0; i < count; i += 1) {
    const point = fromLocalXY(ORIGIN, { x: i * 150, y: 0 })
    waypoints.push(createWaypoint({ seq: i + 1, lat: point.lat, lon: point.lon, alt, speed }))
  }
  return waypoints
}

describe('camera helpers', () => {
  it('derives the ground swath from altitude and field of view', () => {
    // 160 m * tan(42°) ≈ 144.1 m
    expect(footprintWidthM(80, 84)).toBeCloseTo(144.06, 1)
    expect(footprintWidthM(120, 84)).toBeCloseTo(footprintWidthM(80, 84) * 1.5, 1)
  })

  it('clamps nonsense field of view instead of returning Infinity', () => {
    expect(Number.isFinite(footprintWidthM(80, 0))).toBe(true)
    expect(Number.isFinite(footprintWidthM(80, 400))).toBe(true)
  })

  it('converts the swath into a GSD in cm/px', () => {
    expect(groundSampleDistanceCm(144.0646, 5472)).toBeCloseTo(2.63, 1)
    expect(groundSampleDistanceCm(144.0646, 0)).toBeGreaterThan(0)
  })

  it('reports forward overlap from the trigger spacing', () => {
    expect(forwardOverlapPct(30, 144.0646)).toBeCloseTo(79.2, 1)
    expect(forwardOverlapPct(30, 0)).toBe(0)
    // Spacing equal to the swath leaves no overlap at all.
    expect(forwardOverlapPct(144.0646, 144.0646)).toBe(0)
  })

  it('inverts overlap into a trigger spacing', () => {
    expect(spacingForOverlapM(144.0646, 70)).toBeCloseTo(43.2, 1)
    expect(spacingForOverlapM(144.0646, 0)).toBeCloseTo(144.06, 1)
    // Overlap is capped so the spacing can never go negative.
    expect(spacingForOverlapM(144.0646, 99)).toBeGreaterThan(0)
  })

  it('estimates shot count per trigger mode', () => {
    expect(estimatePhotoCount('distance', 1000, 0, 25)).toBe(41)
    expect(estimatePhotoCount('time', 0, 600, 5)).toBe(120)
    expect(estimatePhotoCount('distance', 1000, 0, 0)).toBe(0)
    expect(estimatePhotoCount('distance', -50, 0, 25)).toBe(1)
  })

  it('converts the shot count into a data volume in gigabytes', () => {
    expect(dataVolumeGb(100)).toBeCloseTo(1.758, 3)
    expect(dataVolumeGb(0)).toBe(0)
  })

  it('suggests the trigger value that matches a target overlap', () => {
    expect(triggerValueForOverlap('distance', 144.0646, 70, 8)).toBeCloseTo(43.2, 1)
    expect(triggerValueForOverlap('time', 144.0646, 70, 8)).toBeCloseTo(5.4, 1)
    expect(triggerValueForOverlap('time', 144.0646, 70, 0)).toBe(1)
  })

  it('renders a one-line coverage summary', () => {
    const text = coverageSummary(144.0646, 2.63, 79.2, 41)
    expect(text).toContain('cm/px')
    expect(text).toContain('144.1')
    expect(text).toContain('41 shots')
  })
})

describe('flight plan math', () => {
  it('splits a waypoint list into legs with distance, bearing and speed', () => {
    const waypoints = straightMission()
    const plan = buildFlightPlan(waypoints)
    const oneLeg = haversineDistance(waypoints[0], waypoints[1])
    expect(plan.legs.length).toBe(2)
    expect(plan.legs[0].distanceM).toBeCloseTo(oneLeg, 6)
    expect(plan.totalDistanceM).toBeCloseTo(oneLeg * 2, 1)
    expect(plan.legs[0].speed).toBe(8)
    expect(plan.legs[0].durationS).toBeCloseTo(oneLeg / 8, 6)
    // Heading 090° — east — but the projection is not exactly axis aligned,
    // so the tolerance stays at one degree.
    expect(plan.legs[0].bearing).toBeCloseTo(90, 0)
    expect(plan.legs[1].endM).toBeCloseTo(plan.totalDistanceM, 6)
    expect(plan.legs[1].index).toBe(2)
    expect(plan.legs[0].fromIndex).toBe(0)
    expect(plan.legs[1].toIndex).toBe(2)
  })

  it('derives climb, descent and the steepest vertical rate', () => {
    const [a, b] = straightMission(100, 2)
    b.alt = 50
    const plan = buildFlightPlan([a, b])
    expect(plan.climbM).toBe(0)
    expect(plan.descentM).toBe(50)
    expect(plan.legs[0].climbRate).toBeCloseTo(-2.667, 2)
    expect(plan.steepestClimbRate).toBeCloseTo(2.667, 2)
  })

  it('charges hover time only when a per-item dwell is given', () => {
    const plain = buildFlightPlan(straightMission())
    expect(plain.hoverTimeS).toBe(0)
    expect(plain.totalDurationS).toBeCloseTo(plain.legs.reduce((s, l) => s + l.durationS, 0), 6)

    const hovered = buildFlightPlan(straightMission(), { hoverTimeS: 5 })
    expect(hovered.hoverTimeS).toBe(15)
    expect(hovered.totalDurationS).toBeCloseTo(plain.totalDurationS + 15, 6)
  })

  it('falls back to a default speed when no waypoint carries one', () => {
    const [a, b] = straightMission(60, 2, 0)
    const plan = buildFlightPlan([a, b])
    expect(plan.legs[0].speed).toBe(10)
    expect(buildFlightPlan([a, b], { defaultSpeedMps: 4 }).legs[0].speed).toBe(4)
  })

  it('maps a distance-in-flight back to the active leg', () => {
    const plan = buildFlightPlan(straightMission())
    expect(legIndexAt(plan, 0)).toBe(0)
    expect(legIndexAt(plan, 160)).toBe(1)
    expect(legIndexAt(plan, 10_000)).toBe(1)
  })

  it('samples position, altitude and speed along a leg', () => {
    const waypoints = straightMission()
    const plan = buildFlightPlan(waypoints)

    const start = sampleFlight(plan, waypoints, 0)
    expect(start).not.toBeNull()
    expect(start?.legIndex).toBe(0)
    expect(start?.legFraction).toBeCloseTo(0, 6)
    expect(start?.alt).toBeCloseTo(60, 6)
    expect(haversineDistance(start!, waypoints[0])).toBeLessThan(0.5)

    const middle = sampleFlight(plan, waypoints, 75)
    expect(middle?.legIndex).toBe(0)
    expect(middle?.legFraction).toBeCloseTo(0.5, 2)
    expect(haversineDistance(middle!, waypoints[0])).toBeCloseTo(75, 0)

    const secondLeg = sampleFlight(plan, waypoints, 225)
    expect(secondLeg?.legIndex).toBe(1)
    expect(secondLeg?.legFraction).toBeCloseTo(0.5, 2)
    expect(secondLeg?.speed).toBe(8)
  })

  it('clamps sampling beyond the end of the flight', () => {
    const waypoints = straightMission()
    const plan = buildFlightPlan(waypoints)
    const end = sampleFlight(plan, waypoints, 1_000_000)
    expect(end?.progressM).toBeCloseTo(plan.totalDistanceM, 6)
    expect(end?.legIndex).toBe(1)
    expect(end?.legFraction).toBeCloseTo(1, 3)
    expect(haversineDistance(end!, waypoints[2])).toBeLessThan(1)
  })

  it('interpolates altitude across a climb', () => {
    const [a, b] = straightMission(100, 2)
    b.alt = 0
    const plan = buildFlightPlan([a, b])
    const mid = sampleFlight(plan, [a, b], plan.totalDistanceM / 2)
    expect(mid?.alt).toBeCloseTo(50, 0)
  })

  it('returns nothing for a plan that cannot be flown', () => {
    const single = [createWaypoint({ seq: 1, ...ORIGIN })]
    const plan = buildFlightPlan(single)
    expect(plan.legs.length).toBe(0)
    expect(sampleFlight(plan, single, 10)).toBeNull()
  })

  it('accumulates cruise time up to the sampled distance', () => {
    const waypoints = straightMission()
    const plan = buildFlightPlan(waypoints)
    expect(cruiseElapsedS(plan, 0)).toBeCloseTo(0, 6)
    expect(cruiseElapsedS(plan, 150)).toBeCloseTo(18.75, 1)
    expect(cruiseElapsedS(plan, plan.totalDistanceM)).toBeCloseTo(37.5, 1)
    expect(cruiseElapsedS(plan, 1_000_000)).toBeCloseTo(37.5, 1)
  })

  it('counts only navigable items as flight legs', () => {
    const waypoints = straightMission(60, 2)
    waypoints.push(
      createWaypoint({ seq: 3, ...ORIGIN, command: DO_SET_CAM_TRIGG_DIST, delay: 25 }),
      createWaypoint({ seq: 4, ...ORIGIN, command: DO_SET_HOME })
    )
    expect(navigationCount(waypoints)).toBe(2)
    expect(buildFlightPlan(waypoints).legs.length).toBe(3)
  })

  it('keeps the sequence numbers of the source waypoints', () => {
    const plan = buildFlightPlan(straightMission(60, 4))
    expect(plan.legs.map((leg) => leg.toSeq)).toEqual([2, 3, 4])
    expect(plan.legs.map((leg) => leg.fromSeq)).toEqual([1, 2, 3])
  })
})

describe('mission store planning hooks', () => {
  const memory = new Map<string, string>()

  beforeEach(() => {
    memory.clear()
    ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
      removeItem: (key: string) => void memory.delete(key),
      clear: () => void memory.clear(),
      key: (index: number) => Array.from(memory.keys())[index] ?? null,
      get length() {
        return memory.size
      }
    } as Storage
    setActivePinia(createPinia())
  })

  it('inserts a distance trigger and stores the spacing in the item', () => {
    const store = useMissionStore()
    store.replaceWaypoints(straightMission())
    store.insertCameraTrigger(0, 'distance', 25)

    const inserted = store.waypoints[1]
    expect(inserted.command).toBe(DO_SET_CAM_TRIGG_DIST)
    expect(inserted.delay).toBe(25)
    expect(store.waypoints.length).toBe(4)
    // `replaceWaypoints` resequences contiguously from zero.
    expect(store.waypoints.map((wp) => wp.seq)).toEqual([0, 1, 2, 3])
  })

  it('sets home from a waypoint and restores a return-to-launch point', () => {
    const store = useMissionStore()
    const waypoints = straightMission()
    store.replaceWaypoints(waypoints)

    store.setHomeFrom(1)
    expect(store.home?.[0]).toBeCloseTo(waypoints[1].lat, 9)
    expect(store.home?.[1]).toBeCloseTo(waypoints[1].lon, 9)

    store.addReturnToLaunch()
    const last = store.waypoints[store.waypoints.length - 1]
    expect(last.command).toBe(NAV_RETURN_TO_LAUNCH)
    expect(last.lat).toBeCloseTo(waypoints[0].lat, 9)
    expect(last.alt).toBeCloseTo(waypoints[0].alt, 6)
  })

  it('keeps stats in step with the edited waypoint list', () => {
    const store = useMissionStore()
    store.replaceWaypoints(straightMission())
    expect(store.stats.navigable).toBe(3)
    expect(store.stats.distanceM).toBeGreaterThan(295)
    expect(store.stats.distanceM).toBeLessThan(305)

    store.insertCameraTrigger(0, 'time', 5)
    expect(store.stats.actions).toBe(1)
    // The camera item sits on top of the first waypoint, so it adds no distance.
    expect(store.stats.distanceM).toBeGreaterThan(295)
    expect(store.stats.distanceM).toBeLessThan(305)
    expect(store.waypoints.length).toBe(4)
  })

  it('feeds the planning modules from the live store', () => {
    const store = useMissionStore()
    store.replaceWaypoints(straightMission(80, 3))
    store.setHomeFrom(0)

    const plan = buildFlightPlan(store.waypoints)
    expect(plan.legs.length).toBe(2)
    expect(plan.totalDistanceM).toBeCloseTo(
      haversineDistance(store.waypoints[0], store.waypoints[2]),
      1
    )
    // Sampling must read the right waypoint even though seq starts at zero.
    expect(haversineDistance(sampleFlight(plan, store.waypoints, 0)!, store.waypoints[0]))
      .toBeLessThan(0.5)

    const swath = footprintWidthM(80, 84)
    expect(forwardOverlapPct(30, swath)).toBeCloseTo(79.2, 1)
    expect(estimatePhotoCount('distance', plan.totalDistanceM, plan.totalDurationS, 30)).toBe(10)
    expect(estimatePhotoCount('time', 0, plan.totalDurationS, 10)).toBe(3)
    expect(sampleFlight(plan, store.waypoints, 0)?.alt).toBeCloseTo(80, 6)
    expect(store.waypoints[0].command).toBe(NAV_WAYPOINT)
  })
})
