import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  createDrone,
  type Drone,
  type FleetDoc,
  singleLeadFleet,
  validateDrone
} from '../core/fleet'
import { useMissionStore } from './mission'

const STORAGE_KEY = 'mavplan-web.fleet'

function loadInitial(missionName: string, home: [number, number, number] | null): FleetDoc {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as FleetDoc
      if (parsed && Array.isArray(parsed.drones)) {
        return {
          missionName: parsed.missionName || missionName,
          drones: parsed.drones
        }
      }
    }
  } catch {
    /* fall through */
  }
  return singleLeadFleet(missionName, home)
}

export const useFleetStore = defineStore('fleet', () => {
  const mission = useMissionStore()
  const home = computed<[number, number, number] | null>(() =>
    mission.home ? ([mission.home[0], mission.home[1], mission.home[2]] as [number, number, number]) : null
  )

  const fleet = ref<FleetDoc>(loadInitial(mission.mission.name, home.value))
  const statusMessage = ref('')

  watch(
    () => mission.mission.name,
    (name) => {
      if (name && fleet.value.missionName !== name) fleet.value.missionName = name
    }
  )

  watch(
    fleet,
    (value) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
      } catch {
        /* ignore quota */
      }
    },
    { deep: true }
  )

  const drones = computed(() => fleet.value.drones)
  const count = computed(() => fleet.value.drones.length)
  const lead = computed(() => fleet.value.drones.find((d) => d.role === 'lead') ?? fleet.value.drones[0] ?? null)
  const issues = computed(() => {
    const list: string[] = []
    if (!fleet.value.drones.length) list.push('fleet empty')
    if (fleet.value.drones.filter((d) => d.role === 'lead').length > 1) list.push('multiple leads')
    const names = new Set<string>()
    for (const d of fleet.value.drones) {
      if (names.has(d.name)) list.push(`duplicate ${d.name}`)
      names.add(d.name)
    }
    return list
  })

  function ensureLead(): void {
    if (!fleet.value.drones.some((d) => d.role === 'lead') && fleet.value.drones[0]) {
      fleet.value.drones[0].role = 'lead'
    }
  }

  function addDrone(partial: Partial<Drone> & { name: string }): boolean {
    const drone = createDrone(partial)
    const errs = validateDrone(drone, fleet.value.drones)
    if (errs.length) {
      statusMessage.value = errs[0]
      return false
    }
    if (drone.role === 'lead') {
      for (const d of fleet.value.drones) {
        if (d.role === 'lead') d.role = 'wingman'
      }
    }
    fleet.value.drones.push(drone)
    ensureLead()
    statusMessage.value = ''
    return true
  }

  function removeDrone(id: string): void {
    fleet.value.drones = fleet.value.drones.filter((d) => d.id !== id)
    ensureLead()
  }

  function updateDrone(id: string, patch: Partial<Drone>): void {
    fleet.value.drones = fleet.value.drones.map((d) => (d.id === id ? { ...d, ...patch } : d))
    if (patch.role === 'lead') {
      for (const d of fleet.value.drones) {
        if (d.id !== id && d.role === 'lead') d.role = 'wingman'
      }
    }
    ensureLead()
  }

  function resetFromMission(): void {
    const m = mission.mission
    const h = home.value
    fleet.value = singleLeadFleet(m.name, h)
    statusMessage.value = ''
  }

  return {
    fleet,
    drones,
    count,
    lead,
    issues,
    statusMessage,
    addDrone,
    removeDrone,
    updateDrone,
    resetFromMission
  }
})
