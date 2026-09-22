/**
 * Flight-log replay.
 *
 * Parses a recorded CSV track (the same `lat,lon,alt,time_s,speed,heading`
 * export that QGroundControl / Mission Planner produce and that
 * `mavplan analyze replay` consumes) and compares it with the planned
 * mission.  The browser twin of `mavplan.replay_html`: identical haversine
 * maths (`core/geo`), the same 1200-frame down-sampling budget and the same
 * progress-based alignment between the flown track and the plan.
 */
import { isNavigable } from './actions'
import { buildFlightPlan, sampleFlight, DEFAULT_LEG_SPEED } from './flight'
import { bearingDeg, clamp, distancePointToSegment, haversineDistance, type LatLon } from './geo'
import type { Waypoint } from './mission'

/** Upper bound on replay frames — mirrors `replay_html.DEFAULT_MAX_FRAMES`. */
export const MAX_REPLAY_FRAMES = 1200

/** Points parsed from a log before any file-size or frame-count check. */
export const MAX_LOG_POINTS = 200000

export interface ReplayFrame extends LatLon {
  alt: number
  speed: number
  heading: number
  /** Seconds since the first logged point. */
  t: number
  /** Cumulative ground distance flown, metres. */
  progressM: number
}

export interface ReplayTrack {
  frames: ReplayFrame[]
  /** Points found in the source file (before down-sampling). */
  sourcePoints: number
  /** True when frames were decimated to {@link MAX_REPLAY_FRAMES}. */
  downsampled: boolean
  durationS: number
  distanceM: number
  maxAltM: number
  minAltM: number
  maxSpeedMps: number
  avgSpeedMps: number
  sourceName: string
}

export interface PlanComparison {
  sampleCount: number
  /** Largest lateral distance from the planned track, metres. */
  maxCrossTrackM: number
  meanCrossTrackM: number
  /** 90th percentile of the lateral deviation, metres. */
  p90CrossTrackM: number
  /** Largest absolute altitude error (actual minus planned), metres. */
  maxAltErrorM: number
  /** Signed mean altitude error (positive = flew higher than planned). */
  meanAltErrorM: number
  /** Progress along the plan where the worst altitude error occurred, metres. */
  maxAltErrorAtM: number
  plannedDistanceM: number
  actualDistanceM: number
  distanceDeltaM: number
  plannedDurationS: number
  actualDurationS: number
  durationDeltaS: number
  /** Distance between the last logged point and the last navigable waypoint. */
  endOffsetM: number
}

export class ReplayParseError extends Error {}

/** Candidate column names accepted for each field, lower-cased. */
const COLUMN_ALIASES: Record<string, string[]> = {
  lat: ['lat', 'latitude', 'gps_lat', 'y'],
  lon: ['lon', 'lng', 'long', 'longitude', 'gps_lon', 'x'],
  alt: ['alt', 'altitude', 'alt_m', 'rel_alt', 'height', 'z'],
  time: ['time_s', 'time', 't', 'seconds', 'timestamp', 'elapsed_s'],
  speed: ['speed', 'groundspeed', 'ground_speed', 'gs', 'vel'],
  heading: ['heading', 'hdg', 'yaw', 'course', 'bearing']
}

/** Field order used by both the header mapping and the headerless fallback. */
const FIELDS = ['lat', 'lon', 'alt', 'time', 'speed', 'heading'] as const

/** Column indices assumed when the log has no header row. */
const DEFAULT_ORDER = [0, 1, 2, 3, 4, 5]

function splitCsvLine(line: string): string[] {
  return line.split(/[,;\t]/).map((cell) => cell.trim())
}

/** Maps a header row to `FIELDS` column indices; -1 for columns that are absent. */
function resolveColumns(header: string[]): number[] | null {
  const lower = header.map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, ''))
  const index: Record<string, number> = {}
  let hits = 0
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const found = lower.findIndex((h) => aliases.includes(h))
    if (found !== -1) {
      index[field] = found
      hits += 1
    }
  }
  if (index.lat === undefined || index.lon === undefined || hits < 3) return null
  return FIELDS.map((field) => index[field] ?? -1)
}

function numeric(value: string | undefined): number | null {
  if (value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Parses a flight log exported as CSV / TSV text.
 *
 * Accepts the mavplan column order (`lat,lon,alt,time_s,speed,heading`) with
 * or without a header, plus the common QGC / Mission Planner spellings.
 * Throws {@link ReplayParseError} when the text holds no usable track.
 */
export function parseFlightLogCsv(text: string, sourceName = 'flight-log.csv'): ReplayTrack {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))

  if (!lines.length) throw new ReplayParseError('empty log')
  if (lines.length > MAX_LOG_POINTS + 1) throw new ReplayParseError('log too large')

  const firstCells = splitCsvLine(lines[0])
  const headerOrder = resolveColumns(firstCells)
  const order = headerOrder ?? DEFAULT_ORDER
  const startRow = headerOrder ? 1 : 0

  const raw: ReplayFrame[] = []
  let timeSeen = false

  for (let row = startRow; row < lines.length; row += 1) {
    const cells = splitCsvLine(lines[row])
    const lat = numeric(cells[order[0]])
    const lon = numeric(cells[order[1]])
    if (lat === null || lon === null) continue
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue

    const altValue = order[2] === -1 ? 0 : numeric(cells[order[2]])
    const timeValue = order[3] === -1 ? null : numeric(cells[order[3]])
    const speedValue = order[4] === -1 ? 0 : numeric(cells[order[4]])
    const headingValue = order[5] === -1 ? 0 : numeric(cells[order[5]])
    if (timeValue !== null) timeSeen = true

    raw.push({
      lat,
      lon,
      alt: altValue ?? 0,
      speed: speedValue ?? 0,
      heading: headingValue ?? 0,
      t: timeValue ?? 0,
      progressM: 0
    })
  }

  if (raw.length < 2) throw new ReplayParseError('fewer than two usable points')

  // Cumulative ground distance, and a fallback timebase for logs without a
  // time column (distance / DEFAULT_LEG_SPEED, the same cruise speed the
  // flight-plan maths assumes).
  let cumulative = 0
  for (let i = 0; i < raw.length; i += 1) {
    if (i > 0) cumulative += haversineDistance(raw[i - 1], raw[i])
    raw[i].progressM = cumulative
  }
  if (!timeSeen) {
    for (const frame of raw) frame.t = frame.progressM / DEFAULT_LEG_SPEED
  } else {
    const t0 = raw[0].t
    for (const frame of raw) frame.t = Math.max(0, frame.t - t0)
  }

  const frames = downsampleFrames(raw)
  const durationS = frames[frames.length - 1].t - frames[0].t
  let maxSpeedMps = 0
  let speedSum = 0
  let maxAltM = -Infinity
  let minAltM = Infinity
  for (const frame of frames) {
    maxSpeedMps = Math.max(maxSpeedMps, frame.speed)
    speedSum += frame.speed
    maxAltM = Math.max(maxAltM, frame.alt)
    minAltM = Math.min(minAltM, frame.alt)
  }

  return {
    frames,
    sourcePoints: raw.length,
    downsampled: frames.length < raw.length,
    durationS,
    distanceM: frames[frames.length - 1].progressM,
    maxAltM: maxAltM === -Infinity ? 0 : maxAltM,
    minAltM: minAltM === Infinity ? 0 : minAltM,
    maxSpeedMps,
    avgSpeedMps: frames.length ? speedSum / frames.length : 0,
    sourceName
  }
}

/**
 * Evenly decimates a track to at most `max` frames, always keeping the first
 * and last point so the flown distance is preserved.
 */
export function downsampleFrames(frames: ReplayFrame[], max = MAX_REPLAY_FRAMES): ReplayFrame[] {
  if (frames.length <= max || max < 2) return frames
  const step = (frames.length - 1) / (max - 1)
  const out: ReplayFrame[] = []
  for (let i = 0; i < max; i += 1) out.push(frames[Math.round(i * step)])
  return out
}

/** Shortest distance from `p` to the planned polyline, metres. */
export function crossTrackDistanceM(p: LatLon, path: LatLon[]): number {
  if (!path.length) return 0
  if (path.length === 1) return haversineDistance(p, path[0])
  let best = Infinity
  for (let i = 1; i < path.length; i += 1) {
    best = Math.min(best, distancePointToSegment(p, path[i - 1], path[i]))
  }
  return best
}

function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = clamp(Math.round(fraction * (sorted.length - 1)), 0, sorted.length - 1)
  return sorted[idx]
}

/**
 * Compares a recorded track against the planned mission.
 *
 * Progress-based alignment: every logged frame is matched with the plan
 * sample at the same distance from the start, which is exactly how the CLI
 * replay page pairs the two tracks.  Returns null when the mission has no
 * navigable waypoints to compare against.
 */
export function compareReplayToPlan(
  track: ReplayTrack,
  waypoints: Waypoint[],
  options: { hoverTimeS?: number } = {}
): PlanComparison | null {
  const navigable = waypoints.filter((wp) => isNavigable(wp.command))
  if (navigable.length < 2 || track.frames.length < 2) return null
  const path: LatLon[] = navigable.map((wp) => ({ lat: wp.lat, lon: wp.lon }))

  // The plan is built from the navigable items only, so the cross-track
  // polyline, the altitude profile and the leg timebase all line up.
  const plan = buildFlightPlan(navigable, { hoverTimeS: options.hoverTimeS ?? 0 })
  if (!plan.legs.length) return null

  const deviations: number[] = []
  let maxCrossTrackM = 0
  let crossTrackSum = 0
  let maxAltErrorM = 0
  let altErrorSum = 0
  let maxAltErrorAtM = 0

  for (const frame of track.frames) {
    const crossTrack = crossTrackDistanceM(frame, path)
    deviations.push(crossTrack)
    crossTrackSum += crossTrack
    maxCrossTrackM = Math.max(maxCrossTrackM, crossTrack)

    const planned = sampleFlight(plan, navigable, frame.progressM)
    if (!planned) continue
    const error = frame.alt - planned.alt
    altErrorSum += error
    if (Math.abs(error) > maxAltErrorM) {
      maxAltErrorM = Math.abs(error)
      maxAltErrorAtM = frame.progressM
    }
  }

  const last = track.frames[track.frames.length - 1]
  const endOffsetM = haversineDistance(last, path[path.length - 1])

  return {
    sampleCount: track.frames.length,
    maxCrossTrackM,
    meanCrossTrackM: crossTrackSum / track.frames.length,
    p90CrossTrackM: percentile(deviations, 0.9),
    maxAltErrorM,
    meanAltErrorM: altErrorSum / track.frames.length,
    maxAltErrorAtM,
    plannedDistanceM: plan.totalDistanceM,
    actualDistanceM: track.distanceM,
    distanceDeltaM: track.distanceM - plan.totalDistanceM,
    plannedDurationS: plan.totalDurationS,
    actualDurationS: track.durationS,
    durationDeltaS: track.durationS - plan.totalDurationS,
    endOffsetM
  }
}

/** Bearing between the frame and the next one, for a live heading read-out. */
export function frameHeading(track: ReplayTrack, index: number): number {
  const frame = track.frames[index]
  const next = track.frames[index + 1]
  if (!frame) return 0
  if (!next) return frame.heading
  if (frame.heading > 0) return frame.heading
  return bearingDeg(frame, next)
}

/** Frame index whose timestamp is closest to `t` seconds, for time scrubbing. */
export function frameIndexAtTime(track: ReplayTrack, t: number): number {
  if (!track.frames.length) return 0
  const clamped = clamp(t, 0, track.durationS)
  let lo = 0
  let hi = track.frames.length - 1
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (track.frames[mid].t < clamped) lo = mid + 1
    else hi = mid
  }
  return lo
}
