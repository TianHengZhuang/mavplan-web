import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMissionStore } from '../src/stores/mission'

// Node vitest environment has no localStorage; the mission store persists to it.
const memory = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, String(value))
  },
  removeItem: (key: string) => {
    memory.delete(key)
  },
  clear: () => memory.clear(),
  key: (index: number) => [...memory.keys()][index] ?? null,
  get length() {
    return memory.size
  }
} as Storage

describe('mission undo / redo', () => {
  beforeEach(() => {
    memory.clear()
    setActivePinia(createPinia())
  })

  it('undoes addWaypoint and redoes it', () => {
    const store = useMissionStore()
    store.clear()
    const before = store.waypoints.length
    store.addWaypoint(31.23, 121.47, 50)
    expect(store.waypoints.length).toBe(before + 1)
    expect(store.canUndo).toBe(true)

    expect(store.undo()).toBe(true)
    expect(store.waypoints.length).toBe(before)
    expect(store.canRedo).toBe(true)

    expect(store.redo()).toBe(true)
    expect(store.waypoints.length).toBe(before + 1)
  })

  it('undoes removeWaypoint', () => {
    const store = useMissionStore()
    store.clear()
    store.addWaypoint(31.23, 121.47, 50)
    store.addWaypoint(31.24, 121.48, 60)
    const count = store.waypoints.length
    store.removeWaypoint(0)
    expect(store.waypoints.length).toBe(count - 1)
    store.undo()
    expect(store.waypoints.length).toBe(count)
  })

  it('undo on empty stack is a no-op', () => {
    const store = useMissionStore()
    while (store.canUndo) store.undo()
    expect(store.undo()).toBe(false)
  })
})
