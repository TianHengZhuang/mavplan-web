import { describe, expect, it } from 'vitest'
import { buildCliCommands } from '../src/core/cli'
import { createMission, createWaypoint, resequence } from '../src/core/mission'
import { applyTaskToPreflight, parseTaskSpec, toTaskSpecDict } from '../src/core/taskspec'
import { defaultParams } from '../src/core/preflight'
import { parseZonesJson, toZonesJson, zoneToPythonDict } from '../src/core/zones'

describe('python-compatible zones JSON', () => {
  it('parses a bare zone list and {"zones": [...]}', () => {
    const bare = parseZonesJson(
      JSON.stringify([{ name: '跑道', kind: 'circle', lat: 31.23, lon: 121.47, radius_m: 80 }])
    )
    expect(bare).toHaveLength(1)
    expect(bare[0].kind).toBe('circle')
    expect(bare[0].name).toBe('跑道')
    if (bare[0].kind === 'circle') {
      expect(bare[0].radiusM).toBe(80)
    }

    const wrapped = parseZonesJson(
      JSON.stringify({
        zones: [
          {
            name: 'box',
            kind: 'polygon',
            lat: 31.23,
            lon: 121.47,
            radius_m: 0,
            vertices: [
              [31.23, 121.47],
              [31.232, 121.47],
              [31.232, 121.474],
              [31.23, 121.47] // closing duplicate — dropped
            ]
          }
        ]
      })
    )
    expect(wrapped[0].kind).toBe('polygon')
    if (wrapped[0].kind === 'polygon') {
      expect(wrapped[0].vertices).toHaveLength(3)
    }
  })

  it('round-trips through toZonesJson with python field names', () => {
    const zones = parseZonesJson(
      JSON.stringify([{ name: 'A', kind: 'circle', lat: 31.2, lon: 121.4, radius_m: 55 }])
    )
    const text = toZonesJson(zones)
    const dict = JSON.parse(text) as { zones: Array<Record<string, unknown>> }
    expect(dict.zones[0].radius_m).toBe(55)
    expect(dict.zones[0].kind).toBe('circle')
    const again = parseZonesJson(text)
    expect(again[0].name).toBe('A')
    expect(zoneToPythonDict(zones[0]).radius_m).toBe(55)
  })

  it('rejects malformed zones', () => {
    expect(() => parseZonesJson('not json')).toThrow()
    expect(() =>
      parseZonesJson(JSON.stringify([{ name: 'x', kind: 'circle', lat: 1, lon: 2, radius_m: 0 }]))
    ).toThrow()
  })
})

describe('TaskSpec brief', () => {
  const sample = {
    version: 1,
    name: '矩形巡检',
    description: '入门考核',
    difficulty: 'easy',
    home: [31.23, 121.47, 0],
    required: [
      { name: 'NW', lat: 31.235, lon: 121.47, radius_m: 25, kind: 'point' },
      { name: '作业区', lat: 31.23, lon: 121.475, radius_m: 80, kind: 'area' }
    ],
    altitude_range: [40, 60],
    speed_range: [8, 12],
    max_time_s: 480,
    max_distance_m: 4000,
    no_fly_zones: [
      { name: '学校', kind: 'circle', lat: 31.23, lon: 121.475, radius_m: 80 }
    ]
  }

  it('parses a python TaskSpec.to_dict payload', () => {
    const brief = parseTaskSpec(JSON.stringify(sample))
    expect(brief.name).toBe('矩形巡检')
    expect(brief.required).toHaveLength(2)
    expect(brief.required[0].kind).toBe('point')
    expect(brief.required[1].kind).toBe('area')
    expect(brief.altitudeRange).toEqual([40, 60])
    expect(brief.maxDistanceM).toBe(4000)
    expect(brief.noFlyZones).toHaveLength(1)
    expect(brief.noFlyZones[0].name).toBe('学校')
  })

  it('applies limits and zones for CLI-aligned preflight', () => {
    const brief = parseTaskSpec(JSON.stringify(sample))
    const params = applyTaskToPreflight(defaultParams(), brief)
    expect(params.maxAltitudeM).toBe(60)
    expect(params.maxDistanceM).toBe(4000)
  })

  it('serialises back to the python dict shape', () => {
    const brief = parseTaskSpec(JSON.stringify(sample))
    const dict = toTaskSpecDict(brief)
    expect(dict.version).toBe(1)
    expect(Array.isArray(dict.required)).toBe(true)
    expect(Array.isArray(dict.no_fly_zones)).toBe(true)
    const zones = dict.no_fly_zones as Array<Record<string, unknown>>
    expect(zones[0].radius_m).toBe(80)
  })

  it('rejects non-task JSON', () => {
    expect(() => parseTaskSpec(JSON.stringify({ hello: 'world' }))).toThrow()
  })
})

describe('CLI companion', () => {
  it('builds check and preview commands for the current mission', () => {
    const mission = createMission('demo')
    mission.waypoints = [
      createWaypoint({ lat: 31.23, lon: 121.47, alt: 50 }),
      createWaypoint({ lat: 31.231, lon: 121.471, alt: 50 })
    ]
    resequence(mission.waypoints)
    const zones = parseZonesJson(
      JSON.stringify([{ name: 'A', kind: 'circle', lat: 31.23, lon: 121.47, radius_m: 50 }])
    )
    const brief = parseTaskSpec(
      JSON.stringify({
        name: 'T',
        home: [31.23, 121.47, 0],
        required: [],
        altitude_range: [40, 80],
        max_distance_m: 2000
      })
    )
    const commands = buildCliCommands(mission, zones, brief)
    const joined = commands.map((c) => c.command).join('\n')
    expect(joined).toContain('pip install mavplan')
    expect(joined).toContain('mavplan mission import mission.json')
    expect(joined).toContain('--zones-json zones.json')
    expect(joined).toContain('mavplan mission preview')
    expect(joined).toContain('mavplan grade')
  })

  it('omits zones flag when there are no zones', () => {
    const mission = createMission('empty')
    mission.waypoints = [createWaypoint({ lat: 1, lon: 2, alt: 10 })]
    const commands = buildCliCommands(mission, [], null)
    const check = commands.find((c) => c.id === 'check')
    expect(check?.command).not.toContain('--zones-json')
  })
})
