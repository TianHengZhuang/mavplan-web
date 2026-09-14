import { describe, expect, it } from 'vitest'
import { BUILTIN_ADMIN_INDEX, findCity, findProvince } from '../src/core/admin-div'
import { createDrone, formationOffsets, singleLeadFleet, validateFleet } from '../src/core/fleet'
import { createMission, createWaypoint } from '../src/core/mission'
import { buildMissionReview, renderReviewMarkdown } from '../src/core/mission-review'
import { BUILTIN_XUZHOU_PACK, recordToZone, resolveRegionZones } from '../src/core/nfz-pack'

function sampleMission() {
  const m = createMission('江苏省徐州市 云龙湖')
  m.home = [34.2472, 117.1856, 0]
  m.waypoints = [
    createWaypoint({ seq: 0, lat: 34.2472, lon: 117.1856, alt: 50, speed: 8, command: 16 }),
    createWaypoint({ seq: 1, lat: 34.25, lon: 117.1856, alt: 50, speed: 8, command: 16 }),
    createWaypoint({ seq: 2, lat: 34.25, lon: 117.19, alt: 40, speed: 6, command: 16 })
  ]
  return m
}

describe('fleet core', () => {
  it('creates single lead fleet', () => {
    const f = singleLeadFleet('任务A')
    expect(f.drones).toHaveLength(1)
    expect(f.drones[0].role).toBe('lead')
    expect(validateFleet(f)).toEqual([])
  })

  it('flags empty fleet', () => {
    expect(validateFleet({ missionName: '', drones: [] }).length).toBeGreaterThan(0)
  })

  it('formation offsets around lead', () => {
    const f = singleLeadFleet('T')
    f.drones.push(createDrone({ name: 'W1', role: 'wingman' }))
    const offs = formationOffsets(f, 40)
    expect(offs.some((o) => o.slot === 0)).toBe(true)
    expect(offs.some((o) => o.offsetEastM !== 0)).toBe(true)
  })
})

describe('nfz region', () => {
  it('resolves xuzhou city zones', () => {
    const { pack, records } = resolveRegionZones('江苏省', '徐州市')
    expect(pack.cityCode).toBe('320300')
    expect(records.length).toBeGreaterThan(0)
  })

  it('filters yunlong district', () => {
    const { records } = resolveRegionZones('江苏省', '徐州市', '云龙区')
    expect(records.every((r) => r.district === '云龙区')).toBe(true)
  })

  it('unknown province throws', () => {
    expect(() => resolveRegionZones('火星省', '徐州市')).toThrow()
  })

  it('admin index has jiangsu', () => {
    const p = findProvince(BUILTIN_ADMIN_INDEX, '江苏省')
    expect(p).toBeTruthy()
    expect(findCity(p!, '徐州市')).toBeTruthy()
  })

  it('recordToZone circle', () => {
    const z = recordToZone(BUILTIN_XUZHOU_PACK.zones[0])
    expect(z.kind).toBe('circle')
  })
})

describe('mission review', () => {
  it('builds three sections', () => {
    const m = sampleMission()
    const fleet = singleLeadFleet(m.name)
    const review = buildMissionReview(m, [], fleet)
    expect(review.sections.map((s) => s.title)).toEqual(['任务前分析', '任务中分析', '任务后分析'])
    expect(['pass', 'conditional', 'fail']).toContain(review.verdict)
    const md = renderReviewMarkdown(review)
    expect(md).toContain('任务前分析')
    expect(md).toContain(m.name)
  })

  it('fail verdict on error checks', () => {
    const m = sampleMission()
    const review = buildMissionReview(
      m,
      [{ code: 'zone-intersect', level: 'error', params: { zone: 'demo' } }],
      null
    )
    expect(review.verdict).toBe('fail')
  })
})
