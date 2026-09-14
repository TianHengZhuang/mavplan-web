/**
 * Regional no-fly zone packs (province/city/district).
 * Builtin Xuzhou teaching pack — not legal airspace data.
 */

import { type AdminIndex, BUILTIN_ADMIN_INDEX, findCity, findProvince } from './admin-div'
import type { Zone } from './preflight'

export interface NfzRecord {
  id: string
  name: string
  kind: 'circle' | 'polygon'
  lat?: number
  lon?: number
  radiusM?: number
  ceilingM?: number
  vertices: [number, number][]
  category: string
  district: string | null
}

export interface NfzPack {
  cityCode: string
  cityName: string
  provinceCode: string
  provinceName: string
  updatedAt: string
  source: string
  disclaimer: string
  zones: NfzRecord[]
}

export const NFZ_DISCLAIMER =
  '教学演示数据，非法定航行资料；放飞前须以民航局 UOM / 空管公布为准。'

export const BUILTIN_XUZHOU_PACK: NfzPack = {
  cityCode: '320300',
  cityName: '徐州市',
  provinceCode: '320000',
  provinceName: '江苏省',
  updatedAt: '2026-09-14',
  source: 'curated-teaching',
  disclaimer: NFZ_DISCLAIMER,
  zones: [
    {
      id: 'xz-airport-01',
      name: '徐州观音国际机场净空保护区',
      kind: 'circle',
      lat: 34.059,
      lon: 117.555,
      radiusM: 10000,
      ceilingM: 600,
      vertices: [],
      category: 'airport',
      district: null
    },
    {
      id: 'xz-yunlong-demo',
      name: '云龙湖景区教学演示禁飞圈',
      kind: 'circle',
      lat: 34.2472,
      lon: 117.1856,
      radiusM: 300,
      ceilingM: 120,
      vertices: [],
      category: 'scenic',
      district: '云龙区'
    },
    {
      id: 'xz-quanshan-demo',
      name: '泉山教学缓冲区示例',
      kind: 'circle',
      lat: 34.241,
      lon: 117.178,
      radiusM: 180,
      ceilingM: 100,
      vertices: [],
      category: 'training',
      district: '泉山区'
    }
  ]
}

export function builtinPackForCity(cityCode: string): NfzPack | null {
  if (cityCode === '320300') return BUILTIN_XUZHOU_PACK
  return null
}

export function emptyPack(provinceName: string, cityName: string, cityCode: string): NfzPack {
  return {
    cityCode,
    cityName,
    provinceCode: '',
    provinceName,
    updatedAt: '',
    source: 'empty',
    disclaimer: NFZ_DISCLAIMER,
    zones: []
  }
}

export function filterDistrict(pack: NfzPack, district: string | null): NfzRecord[] {
  if (!district) return [...pack.zones]
  return pack.zones.filter((z) => (z.district ?? '') === district)
}

export function recordToZone(rec: NfzRecord): Zone {
  if (rec.kind === 'circle') {
    return {
      id: rec.id,
      kind: 'circle',
      name: rec.name,
      lat: rec.lat ?? 0,
      lon: rec.lon ?? 0,
      radiusM: rec.radiusM ?? 0,
      ceilingM: rec.ceilingM ?? 0
    }
  }
  const first = rec.vertices[0]
  return {
    id: rec.id,
    kind: 'polygon',
    name: rec.name,
    vertices: rec.vertices.map(([lat, lon]) => ({ lat, lon })),
    ceilingM: rec.ceilingM ?? 0,
    lat: first?.[0],
    lon: first?.[1]
  }
}

export function resolveRegionZones(
  province: string,
  city: string,
  district: string | null = null,
  index: AdminIndex = BUILTIN_ADMIN_INDEX
): { pack: NfzPack; records: NfzRecord[]; warnings: string[] } {
  const warnings: string[] = []
  const prov = findProvince(index, province)
  if (!prov) throw new Error(`unknown province: ${province}`)
  const ct = findCity(prov, city)
  if (!ct) throw new Error(`unknown city: ${city}`)
  let pack = builtinPackForCity(ct.code)
  if (!pack) {
    pack = emptyPack(prov.name, ct.name, ct.code)
    warnings.push(`no NFZ pack for ${prov.name}/${ct.name}`)
  }
  let records: NfzRecord[]
  if (district) {
    const known = ct.districts.some((d) => d.name === district || d.code === district)
    if (!known) {
      warnings.push(`unknown district ${district}`)
      records = [...pack.zones]
    } else {
      const label = ct.districts.find((d) => d.name === district || d.code === district)?.name ?? district
      records = filterDistrict(pack, label)
    }
  } else {
    records = [...pack.zones]
  }
  return { pack, records, warnings }
}
