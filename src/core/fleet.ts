/**
 * Multi-drone fleet model (mirrors mavplan.fleet).
 * Offline-first; persisted via stores/fleet.ts.
 */

export type Airframe = 'multirotor' | 'fixedwing' | 'vtol'
export type DroneRole = 'lead' | 'wingman' | 'standby'
export type DroneStatus = 'planned' | 'ready' | 'flying' | 'landed'

export interface Drone {
  id: string
  name: string
  callsign: string
  model: string
  airframe: Airframe
  batteryWh: number
  maxAltM: number
  maxRangeM: number
  cruiseSpeedMs: number
  role: DroneRole
  status: DroneStatus
  home: [number, number, number] | null
  payload: Record<string, string | number>
  missionRef: string | null
}

export interface FleetDoc {
  missionName: string
  drones: Drone[]
}

export interface FormationOffset {
  id: string
  name: string
  role: DroneRole
  offsetEastM: number
  slot: number
}

const NAME_RE = /^[一-鿿A-Za-z0-9_-]{1,32}$/

export function createDrone(partial: Partial<Drone> & { name: string }): Drone {
  const n = partial.id ? Number(partial.id.replace(/\D/g, '')) || 1 : 1
  return {
    id: partial.id ?? `uav-${Date.now().toString(36)}-${n}`,
    name: partial.name,
    callsign: partial.callsign ?? '',
    model: partial.model ?? '',
    airframe: partial.airframe ?? 'multirotor',
    batteryWh: partial.batteryWh ?? 77,
    maxAltM: partial.maxAltM ?? 120,
    maxRangeM: partial.maxRangeM ?? 8000,
    cruiseSpeedMs: partial.cruiseSpeedMs ?? 10,
    role: partial.role ?? 'wingman',
    status: partial.status ?? 'planned',
    home: partial.home ?? null,
    payload: partial.payload ?? {},
    missionRef: partial.missionRef ?? null
  }
}

export function singleLeadFleet(missionName: string, home?: [number, number, number] | null): FleetDoc {
  return {
    missionName: missionName || '未命名任务',
    drones: [
      createDrone({
        id: 'uav-1',
        name: '主机',
        callsign: 'UAV-01',
        role: 'lead',
        status: 'planned',
        home: home ?? null
      })
    ]
  }
}

export function validateDrone(drone: Drone, existing: Drone[] = []): string[] {
  const issues: string[] = []
  if (!drone.id) issues.push('编号不能为空')
  if (!drone.name || !NAME_RE.test(drone.name)) issues.push(`名称无效：${drone.name}`)
  if (drone.batteryWh <= 0) issues.push('电池容量必须大于 0')
  if (drone.maxAltM <= 0 || drone.cruiseSpeedMs <= 0) issues.push('最大升限 / 巡航速度必须大于 0')
  for (const other of existing) {
    if (other.id === drone.id) issues.push(`编号重复：${drone.id}`)
    if (other.name === drone.name) issues.push(`名称重复：${drone.name}`)
  }
  return issues
}

export function validateFleet(fleet: FleetDoc): string[] {
  const issues: string[] = []
  if (!fleet.missionName) issues.push('任务名称不能为空')
  if (!fleet.drones.length) issues.push('机队中没有无人机')
  if (fleet.drones.length > 20) issues.push('机队超过 20 架')
  const leads = fleet.drones.filter((d) => d.role === 'lead').length
  if (fleet.drones.length && leads === 0) issues.push('机队缺少主机')
  if (leads > 1) issues.push('机队中有多架主机')
  return issues
}

export function formationOffsets(fleet: FleetDoc, spacingM = 30): FormationOffset[] {
  const ordered = [...fleet.drones].sort((a, b) => {
    const rank = (r: DroneRole) => (r === 'lead' ? 0 : r === 'wingman' ? 1 : 2)
    return rank(a.role) - rank(b.role) || a.id.localeCompare(b.id)
  })
  const leadI = Math.max(
    0,
    ordered.findIndex((d) => d.role === 'lead')
  )
  return ordered.map((d, i) => {
    const slot = i - leadI
    return {
      id: d.id,
      name: d.name,
      role: d.role,
      offsetEastM: slot * spacingM,
      slot
    }
  })
}

export function fleetSummary(fleet: FleetDoc): string {
  return `${fleet.drones.length} · ${fleet.drones.map((d) => d.name).join(' / ')}`
}
