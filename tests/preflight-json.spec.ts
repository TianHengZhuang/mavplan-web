import { describe, expect, it } from 'vitest'
import { toPreflightJson, type PreflightReport } from '../src/core/preflight'

const report: PreflightReport = {
  items: [
    { level: 'error', code: 'altitude-exceeded', seq: 2, params: {} },
    { level: 'warning', code: 'battery-low', params: {} }
  ],
  errors: 1,
  warnings: 1,
  infos: 0,
  distanceM: 1000,
  durationS: 120,
  cruiseTimeS: 100,
  hoverTimeS: 20,
  requiredMah: 1200,
  availableMah: 2000,
  turnRadiusM: 30,
  cleared: false
}

describe('toPreflightJson', () => {
  it('emits mavplan.preflight/1 envelope', () => {
    const doc = toPreflightJson(report, 'demo', 3, 1)
    expect(doc.schema).toBe('mavplan.preflight/1')
    expect(doc.mission).toEqual({ name: 'demo', waypoints: 3 })
    expect(doc.zones).toBe(1)
    expect(doc.summary).toEqual({ errors: 1, warnings: 1, info: 0 })
  })

  it('maps waypoint seq onto waypoint field', () => {
    const doc = toPreflightJson(report, 'demo', 3, 0)
    expect(doc.checks[0]).toMatchObject({ code: 'altitude-exceeded', level: 'error', waypoint: 2 })
    expect(doc.checks[1].waypoint).toBeUndefined()
  })
})
