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
    missionName: missionName || 'Untitled Mission',
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
  if (!drone.id) issues.push('id required')
  if (!drone.name || !NAME_RE.test(drone.name)) issues.push(`invalid name: ${drone.name}`)
  if (drone.batteryWh <= 0) issues.push('batteryWh must be > 0')
  if (drone.maxAltM <= 0 || drone.cruiseSpeedMs <= 0) issues.push('maxAltM/cruiseSpeed must be > 0')
  for (const other of existing) {
    if (other.id === drone.id) issues.push(`duplicate id: ${drone.id}`)
    if (other.name === drone.name) issues.push(`duplicate name: ${drone.name}`)
  }
  return issues
}

export function validateFleet(fleet: FleetDoc): string[] {
  const issues: string[] = []
  if (!fleet.missionName) issues.push('missionName empty')
  if (!fleet.drones.length) issues.push('fleet has no drones')
  if (fleet.drones.length > 20) issues.push('fleet exceeds 20 drones')
  const leads = fleet.drones.filter((d) => d.role === 'lead').length
  if (fleet.drones.length && leads === 0) issues.push('no lead drone')
  if (leads > 1) issues.push('more than one lead')
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
