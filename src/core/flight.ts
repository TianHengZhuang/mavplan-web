/**
 * Flight-plan math.
 *
 * Turns a waypoint list into leg-by-leg flight data (distance, bearing,
 * climb rate, cumulative distance) and samples the resulting path at an
 * arbitrary distance — the same model the timeline cards, the playback view
 * and `mavplan simulate run` are built on.
 */
import { isNavigable } from './actions'
import { bearingDeg, clamp, destination, haversineDistance, type LatLon } from './geo'
import type { Waypoint } from './mission'

/** Speed assumed for legs whose waypoints carry no explicit speed, m/s. */
export const DEFAULT_LEG_SPEED = 10

export interface FlightLeg {
  /** Index of the leg's end waypoint in the array (also the table row index). */
  index: number
  /** Array index of the waypoint the leg starts at. */
  fromIndex: number
  /** Array index of the waypoint the leg ends at. */
  toIndex: number
  fromSeq: number
  toSeq: number
  distanceM: number
  bearing: number
  /** Speed used for the leg, m/s. */
  speed: number
  /** Vertical rate implied by the leg, m/s (negative = descending). */
  climbRate: number
  durationS: number
  /** Distance from mission start to the end of this leg, metres. */
  endM: number
}

export interface FlightPlan {
  legs: FlightLeg[]
  totalDistanceM: number
  totalDurationS: number
  /** Time spent hovering / holding, seconds. */
  hoverTimeS: number
  climbM: number
  descentM: number
  /** Largest absolute vertical rate in the plan, m/s. */
  steepestClimbRate: number
}

export interface FlightSample {
  lat: number
  lon: number
  alt: number
  bearing: number
  speed: number
  /** Index into `plan.legs` of the leg being flown. */
  legIndex: number
  /** Progress along that leg, 0..1. */
  legFraction: number
  progressM: number
}

export interface FlightPlanOptions {
  /** Dwell time charged per item, seconds (matches mission estimate). */
  hoverTimeS?: number
  /** Speed used when neither waypoint carries one, m/s. */
  defaultSpeedMps?: number
}

function legSpeed(from: Waypoint, to: Waypoint, fallback: number): number {
  if (to.speed > 0) return to.speed
  if (from.speed > 0) return from.speed
  return fallback
}

/** Builds the full leg-by-leg plan for a waypoint list. */
export function buildFlightPlan(
  waypoints: Waypoint[],
  options: FlightPlanOptions = {}
): FlightPlan {
  const fallbackSpeed = options.defaultSpeedMps ?? DEFAULT_LEG_SPEED
  const hoverPerItem = options.hoverTimeS ?? 0
  const legs: FlightLeg[] = []
  let cumulativeM = 0
  let climbM = 0
  let descentM = 0
  let steepestClimbRate = 0

  for (let i = 1; i < waypoints.length; i += 1) {
    const from = waypoints[i - 1]
    const to = waypoints[i]
    const distanceM = haversineDistance(from, to)
    const speed = legSpeed(from, to, fallbackSpeed)
    const durationS = speed > 0 ? distanceM / speed : 0
    const deltaAlt = to.alt - from.alt
    const climbRate = durationS > 0 ? deltaAlt / durationS : 0

    if (deltaAlt >= 0) climbM += deltaAlt
    else descentM += -deltaAlt

    steepestClimbRate = Math.max(steepestClimbRate, Math.abs(climbRate))
    cumulativeM += distanceM

    legs.push({
      index: i,
      fromIndex: i - 1,
      toIndex: i,
      fromSeq: from.seq,
      toSeq: to.seq,
      distanceM,
      bearing: bearingDeg(from, to),
      speed,
      climbRate,
      durationS,
      endM: cumulativeM
    })
  }

  const totalDurationS = legs.reduce((sum, leg) => sum + leg.durationS, 0)
  const hoverTimeS =
    hoverPerItem > 0
      ? hoverPerItem * waypoints.length +
        waypoints.reduce((sum, wp) => sum + Math.max(0, wp.delay), 0)
      : 0

  return {
    legs,
    totalDistanceM: cumulativeM,
    totalDurationS: totalDurationS + hoverTimeS,
    hoverTimeS,
    climbM,
    descentM,
    steepestClimbRate
  }
}

/** Index of the leg covering `progressM`, clamped to the last leg. */
export function legIndexAt(plan: FlightPlan, progressM: number): number {
  const found = plan.legs.findIndex((leg) => progressM < leg.endM)
  if (found !== -1) return found
  return Math.max(0, plan.legs.length - 1)
}

/** Cruise time already flown at `progressM`, seconds (hover excluded). */
export function cruiseElapsedS(plan: FlightPlan, progressM: number): number {
  return plan.legs.reduce((sum, leg) => {
    const startM = leg.endM - leg.distanceM
    const flownM = clamp(progressM - startM, 0, leg.distanceM)
    return sum + (leg.speed > 0 ? flownM / leg.speed : 0)
  }, 0)
}

/** Start point of a leg, in metres-from-start terms (0 for the first leg). */
export function legStartM(leg: FlightLeg): number {
  return leg.endM - leg.distanceM
}

/**
 * Samples the flight path at `progressM` metres from the start.
 * Returns null when the plan is empty. `waypoints` must be the list the plan
 * was built from, so altitudes can be interpolated.
 */
export function sampleFlight(
  plan: FlightPlan,
  waypoints: Waypoint[],
  progressM: number
): FlightSample | null {
  if (!plan.legs.length || waypoints.length < 2) return null
  const clampedM = clamp(progressM, 0, plan.totalDistanceM)
  const legIndex = legIndexAt(plan, clampedM)
  const leg = plan.legs[legIndex]
  const from = waypoints[leg.fromIndex]
  const to = waypoints[leg.toIndex]
  if (!from || !to) return null

  const alongM = clamp(clampedM - legStartM(leg), 0, leg.distanceM)
  const legFraction = leg.distanceM > 0 ? alongM / leg.distanceM : 0
  const point: LatLon = destination(from, alongM, leg.bearing)

  return {
    lat: point.lat,
    lon: point.lon,
    alt: from.alt + (to.alt - from.alt) * legFraction,
    bearing: leg.bearing,
    speed: leg.speed,
    legIndex,
    legFraction,
    progressM: clampedM
  }
}

/** Number of waypoints that actually fly the aircraft (not action items). */
export function navigationCount(waypoints: Waypoint[]): number {
  return waypoints.filter((wp) => isNavigable(wp.command)).length
}
