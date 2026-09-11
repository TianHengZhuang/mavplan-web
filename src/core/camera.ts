/**
 * Photogrammetry helpers.
 *
 * Kept separate from the camera panel so the same numbers can be produced by
 * a test, by the export report, or by the CLI — a briefing screen and a
 * written checklist must never disagree about GSD.
 */
import { clamp } from './geo'

/** Rough size of one JPEG from a 20 MP-class mapping camera, MB. */
export const DEFAULT_PHOTO_MB = 18

/** Ground width covered by the frame, metres. */
export function footprintWidthM(altitudeM: number, fovDeg: number): number {
  const halfAngleRad = (clamp(fovDeg, 1, 179) / 2) * (Math.PI / 180)
  return 2 * Math.max(1, altitudeM) * Math.tan(halfAngleRad)
}

/** Ground sample distance (cm/px) for a given footprint and sensor width. */
export function groundSampleDistanceCm(footprintM: number, sensorWidthPx: number): number {
  return (Math.max(0, footprintM) / Math.max(1, sensorWidthPx)) * 100
}

/** Forward overlap percentage implied by a trigger spacing. */
export function forwardOverlapPct(spacingM: number, footprintM: number): number {
  if (footprintM <= 0) return 0
  return clamp((1 - spacingM / footprintM) * 100, 0, 99)
}

/** Trigger spacing that yields the requested forward overlap. */
export function spacingForOverlapM(footprintM: number, overlapPct: number): number {
  return Math.max(0, footprintM) * (1 - clamp(overlapPct, 0, 95) / 100)
}

export type TriggerMode = 'distance' | 'time'

/** Photo count implied by the trigger mode and the planned flight. */
export function estimatePhotoCount(
  mode: TriggerMode,
  distanceM: number,
  durationS: number,
  value: number
): number {
  if (value <= 0) return 0
  return mode === 'distance'
    ? Math.floor(Math.max(0, distanceM) / value) + 1
    : Math.floor(Math.max(0, durationS) / value)
}

/** Data volume in GB for the estimated shot count. */
export function dataVolumeGb(photoCount: number, perPhotoMb = DEFAULT_PHOTO_MB): number {
  return (Math.max(0, photoCount) * perPhotoMb) / 1024
}

/** Trigger value (metres or seconds) that matches the requested overlap. */
export function triggerValueForOverlap(
  mode: TriggerMode,
  footprintM: number,
  overlapPct: number,
  speedMps: number
): number {
  const spacingM = spacingForOverlapM(footprintM, overlapPct)
  if (mode === 'distance') return Math.max(1, Number(spacingM.toFixed(1)))
  return speedMps > 0 ? Math.max(1, Number((spacingM / speedMps).toFixed(1))) : 1
}

/** Human-readable summary line used by the report and the panel hint. */
export function coverageSummary(
  footprintM: number,
  gsdCm: number,
  overlapPct: number,
  photoCount: number
): string {
  return `${footprintM.toFixed(1)} m swath · ${gsdCm.toFixed(1)} cm/px · ${overlapPct.toFixed(0)}% overlap · ${photoCount} shots`
}
