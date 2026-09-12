import { describe, expect, it } from 'vitest'
import { buildBriefingMarkdown } from '../src/core/briefing'

const base = {
  name: 'Survey A',
  waypointCount: 12,
  distanceLabel: '1.2 km',
  durationLabel: '4:10',
  maxAltitudeM: 80,
  zoneCount: 2,
  altitudeOverLimit: 0,
  taskBriefName: 'Bridge inspection',
  issues: [] as string[]
}

describe('buildBriefingMarkdown', () => {
  it('emits a metrics table and no-issues line', () => {
    const md = buildBriefingMarkdown(base)
    expect(md).toContain('# Survey A')
    expect(md).toContain('| Waypoints | 12 |')
    expect(md).toContain('No open issues.')
  })

  it('lists issues when present', () => {
    const md = buildBriefingMarkdown({ ...base, issues: ['WP3 above limit', 'Missing HOME'] })
    expect(md).toContain('## Issues')
    expect(md).toContain('1. WP3 above limit')
    expect(md).toContain('2. Missing HOME')
  })
})
