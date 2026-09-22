import { describe, expect, it } from 'vitest'
import { buildFlightPlan, sampleFlight } from '../src/core/flight'
import { fromLocalXY, haversineDistance } from '../src/core/geo'
import { createWaypoint } from '../src/core/mission'
import {
  MAX_REPLAY_FRAMES,
  ReplayParseError,
  compareReplayToPlan,
  crossTrackDistanceM,
  downsampleFrames,
  frameHeading,
  frameIndexAtTime,
  parseFlightLogCsv,
  type ReplayFrame
} from '../src/core/replay'

const ORIGIN = { lat: 31.2, lon: 121.4 }

function makeWaypoints() {
  return [
    createWaypoint({ seq: 0, ...ORIGIN, alt: 40, speed: 12, command: 16 }),
    createWaypoint({ seq: 1, ...fromLocalXY(ORIGIN, { x: 1200, y: 0 }), alt: 60, speed: 12, command: 16 }),
    createWaypoint({ seq: 2, ...fromLocalXY(ORIGIN, { x: 1200, y: 900 }), alt: 60, speed: 12, command: 16 })
  ]
}

function makeCsv(
  rows: Array<{ lat: number; lon: number; alt: number; t: number; speed: number; heading: number }>,
  header = 'lat,lon,alt,time_s,speed,heading'
): string {
  const body = rows
    .map((r) => [r.lat.toFixed(7), r.lon.toFixed(7), r.alt.toFixed(2), r.t.toFixed(2), r.speed.toFixed(2), r.heading.toFixed(1)].join(','))
    .join('\n')
  return header ? `${header}\n${body}` : body
}

function frameFrom(sample: { lat: number; lon: number; alt: number; speed: number; bearing: number }, t: number): ReplayFrame {
  return { lat: sample.lat, lon: sample.lon, alt: sample.alt, speed: sample.speed, heading: sample.bearing, t, progressM: 0 }
}

describe('flight log parsing', () => {
  it('parses the mavplan CSV export and derives distance and duration', () => {
    const csv = [
      'lat,lon,alt,time_s,speed,heading',
      '31.1959380,121.3950547,1.02,0.51,9.58,0.0',
      '31.1959814,121.3950600,2.03,1.01,9.58,0.0',
      '31.1960247,121.3950653,3.05,1.52,9.58,0.0'
    ].join('\n')

    const track = parseFlightLogCsv(csv, 'v13_flight.csv')
    expect(track.frames).toHaveLength(3)
    expect(track.sourcePoints).toBe(3)
    expect(track.downsampled).toBe(false)
    expect(track.sourceName).toBe('v13_flight.csv')
    expect(track.frames[0].t).toBeCloseTo(0, 6)
    expect(track.durationS).toBeCloseTo(1.01, 6)
    expect(track.distanceM).toBeGreaterThan(4)
    expect(track.distanceM).toBeLessThan(20)
    expect(track.maxAltM).toBeCloseTo(3.05, 6)
    expect(track.minAltM).toBeCloseTo(1.02, 6)
    expect(track.maxSpeedMps).toBeCloseTo(9.58, 6)
    // cumulative progress is monotonically increasing
    expect(track.frames[1].progressM).toBeGreaterThan(track.frames[0].progressM)
  })

  it('accepts alias headers and skips comment lines', () => {
    const csv = [
      '# exported by QGroundControl',
      'Latitude,Longitude,Altitude,GroundSpeed',
      '31.2000000,121.4000000,50.00,10.00',
      '31.2009000,121.4000000,50.00,10.00'
    ].join('\n')

    const track = parseFlightLogCsv(csv)
    expect(track.frames).toHaveLength(2)
    expect(track.frames[0].alt).toBeCloseTo(50, 6)
    expect(track.frames[0].speed).toBeCloseTo(10, 6)
    // no time column: fall back to distance / DEFAULT_LEG_SPEED
    expect(track.durationS).toBeGreaterThan(9)
    expect(track.durationS).toBeLessThan(11)
  })

  it('falls back to the default column order when there is no header', () => {
    const csv = [
      '31.2000000,121.4000000,30.00,0.00,8.00,90.0',
      '31.2009000,121.4000000,32.00,1.00,8.00,90.0'
    ].join('\n')

    const track = parseFlightLogCsv(csv)
    expect(track.frames).toHaveLength(2)
    expect(track.frames[1].alt).toBeCloseTo(32, 6)
    expect(track.frames[1].t).toBeCloseTo(1, 6)
    expect(track.durationS).toBeCloseTo(1, 6)
  })

  it('skips rows with unusable coordinates', () => {
    const csv = [
      'lat,lon,alt,time_s,speed,heading',
      '31.2000000,121.4000000,30.00,0.00,8.00,90.0',
      'not-a-number,121.4000000,30.00,0.50,8.00,90.0',
      '95.0000000,121.4000000,30.00,0.75,8.00,90.0',
      '31.2009000,121.4000000,31.00,1.00,8.00,90.0'
    ].join('\n')

    const track = parseFlightLogCsv(csv)
    expect(track.sourcePoints).toBe(2)
    expect(track.frames).toHaveLength(2)
  })

  it('rejects empty logs and single-point logs', () => {
    expect(() => parseFlightLogCsv('   \n\n')).toThrow(ReplayParseError)
    expect(() => parseFlightLogCsv('lat,lon,alt\n31.2,121.4,50')).toThrow(ReplayParseError)
  })

  it('decimates long tracks while keeping the endpoints', () => {
    const rows: ReplayFrame[] = []
    for (let i = 0; i < 5000; i += 1) {
      rows.push({ lat: ORIGIN.lat + i * 1e-5, lon: ORIGIN.lon, alt: 50, speed: 10, heading: 0, t: i * 0.1, progressM: 0 })
    }
    const csv = makeCsv(rows.map((r) => ({ ...r, t: r.t ?? 0 })))
    const track = parseFlightLogCsv(csv)

    expect(track.sourcePoints).toBe(5000)
    expect(track.frames).toHaveLength(MAX_REPLAY_FRAMES)
    expect(track.downsampled).toBe(true)
    expect(track.frames[0].lat).toBeCloseTo(rows[0].lat, 7)
    expect(track.frames[track.frames.length - 1].lat).toBeCloseTo(rows[rows.length - 1].lat, 7)

    const small = downsampleFrames(rows.slice(0, 10))
    expect(small).toHaveLength(10)
  })
})

describe('plan comparison', () => {
  const waypoints = makeWaypoints()
  const plan = buildFlightPlan(waypoints)

  it('reports near-zero deviation when the track follows the plan', () => {
    const rows: ReplayFrame[] = []
    const steps = 120
    for (let i = 0; i <= steps; i += 1) {
      const progress = (plan.totalDistanceM * i) / steps
      const sample = sampleFlight(plan, waypoints, progress)
      expect(sample).not.toBeNull()
      if (!sample) continue
      rows.push(frameFrom(sample, (plan.totalDurationS * i) / steps))
    }
    const track = parseFlightLogCsv(makeCsv(rows.map((r) => ({ ...r, t: r.t ?? 0 }))))
    const comparison = compareReplayToPlan(track, waypoints)

    expect(comparison).not.toBeNull()
    if (!comparison) return
    expect(comparison.sampleCount).toBe(track.frames.length)
    expect(comparison.maxCrossTrackM).toBeLessThan(1)
    expect(comparison.meanCrossTrackM).toBeLessThan(1)
    expect(comparison.maxAltErrorM).toBeLessThan(1)
    expect(comparison.endOffsetM).toBeLessThan(1)
    expect(Math.abs(comparison.distanceDeltaM)).toBeLessThan(5)
    expect(Math.abs(comparison.plannedDurationS - comparison.actualDurationS)).toBeLessThan(1)
  })

  it('flags lateral and vertical deviation for a drifted track', () => {
    const rows: ReplayFrame[] = []
    const steps = 60
    for (let i = 0; i <= steps; i += 1) {
      const progress = (plan.totalDistanceM * i) / steps
      const sample = sampleFlight(plan, waypoints, progress)
      if (!sample) continue
      const offset = fromLocalXY({ lat: sample.lat, lon: sample.lon }, { x: 0, y: 25 })
      rows.push({ ...frameFrom(sample, (plan.totalDurationS * i) / steps), lat: offset.lat, lon: offset.lon, alt: sample.alt + 8 })
    }
    const track = parseFlightLogCsv(makeCsv(rows.map((r) => ({ ...r, t: r.t ?? 0 }))))
    const comparison = compareReplayToPlan(track, waypoints)

    expect(comparison).not.toBeNull()
    if (!comparison) return
    expect(comparison.maxCrossTrackM).toBeGreaterThan(20)
    expect(comparison.p90CrossTrackM).toBeGreaterThan(20)
    expect(comparison.maxAltErrorM).toBeGreaterThan(7)
    expect(comparison.meanAltErrorM).toBeGreaterThan(7)
  })

  it('returns null without two navigable waypoints', () => {
    const rows: ReplayFrame[] = [
      { lat: ORIGIN.lat, lon: ORIGIN.lon, alt: 50, speed: 10, heading: 0, t: 0, progressM: 0 },
      { lat: ORIGIN.lat + 0.001, lon: ORIGIN.lon, alt: 50, speed: 10, heading: 0, t: 5, progressM: 0 }
    ]
    const track = parseFlightLogCsv(makeCsv(rows))
    expect(compareReplayToPlan(track, [])).toBeNull()
    expect(compareReplayToPlan(track, [createWaypoint({ command: 16, ...ORIGIN })])).toBeNull()
  })
})

describe('replay helpers', () => {
  it('measures distance to the planned polyline', () => {
    const a = ORIGIN
    const b = fromLocalXY(ORIGIN, { x: 1000, y: 0 })
    const offset = fromLocalXY(ORIGIN, { x: 500, y: 30 })

    expect(crossTrackDistanceM(a, [a, b])).toBeLessThan(0.5)
    expect(crossTrackDistanceM(offset, [a, b])).toBeCloseTo(30, 0)
    expect(crossTrackDistanceM(fromLocalXY(ORIGIN, { x: -40, y: 0 }), [a, b])).toBeCloseTo(40, 0)
    expect(crossTrackDistanceM(ORIGIN, [])).toBe(0)
    expect(crossTrackDistanceM(b, [a])).toBeCloseTo(haversineDistance(a, b), 0)
  })

  it('maps timestamps to frame indices and derives headings', () => {
    const rows: ReplayFrame[] = []
    for (let i = 0; i < 40; i += 1) {
      rows.push({ lat: ORIGIN.lat, lon: ORIGIN.lon + i * 1e-4, alt: 50, speed: 10, heading: 0, t: i * 2, progressM: 0 })
    }
    const track = parseFlightLogCsv(makeCsv(rows.map((r) => ({ ...r, t: r.t ?? 0 }))))

    expect(frameIndexAtTime(track, 0)).toBe(0)
    expect(frameIndexAtTime(track, -5)).toBe(0)
    expect(frameIndexAtTime(track, 1e9)).toBe(track.frames.length - 1)
    expect(frameIndexAtTime(track, 20)).toBe(10)
    expect(frameHeading(track, 0)).toBeCloseTo(90, 0)
    expect(frameHeading(track, track.frames.length - 1)).toBeCloseTo(0, 6)
  })
})
