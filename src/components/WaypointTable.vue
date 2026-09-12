<script setup lang="ts">
/**
 * Waypoint table — every column is editable in place and changes are written
 * straight back into the mission store, which persists to localStorage.
 *
 * Keyboard: ↑/↓ move selection, Enter edits the first field, Delete removes
 * the selected row (ignored while a form control has focus).
 */
import { computed, nextTick, ref } from 'vue'
import {
  DO_SET_CAM_TRIGG_DIST,
  DO_SET_CAM_TRIGG_INTERVAL,
  SELECTABLE_COMMANDS,
  commandLabel,
  commandName,
  isAction,
  isNavigable
} from '../core/actions'
import { formatDistance } from '../core/geo'
import { YAW_UNCONSTRAINED } from '../core/mission'
import { t } from '../core/i18n'
import { useMissionStore } from '../stores/mission'

const store = useMissionStore()
const tableWrap = ref<HTMLElement | null>(null)

const commandChoices = computed(() =>
  SELECTABLE_COMMANDS.map((value) => ({
    value,
    label: commandLabel(value, t),
    technical: commandName(value),
    action: isAction(value)
  }))
)

const actionChoices = computed(() => commandChoices.value.filter((item) => item.action))

function insertAction(seq: number, event: Event): void {
  const element = event.target as HTMLSelectElement
  const command = Number(element.value)
  element.value = ''
  if (!command) return
  const param1 =
    command === DO_SET_CAM_TRIGG_DIST ? 20 : command === DO_SET_CAM_TRIGG_INTERVAL ? 5 : 0
  store.insertAction(seq, command, param1)
  store.statusMessage = ''
}

function confirmClear(): void {
  if (window.confirm(t('editor.clearConfirm'))) store.clear()
}

function legDistance(seq: number): string {
  const leg = store.legs[seq]
  if (!leg || seq === 0) return '—'
  return formatDistance(leg.distanceM)
}

function legBearing(seq: number): string {
  const leg = store.legs[seq]
  if (!leg || seq === 0) return '—'
  return `${leg.bearing.toFixed(0)}°`
}

function climbRate(seq: number): string {
  const leg = store.legs[seq]
  if (!leg || seq === 0) return '—'
  return `${leg.climbRate >= 0 ? '+' : ''}${leg.climbRate.toFixed(1)}`
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || target.isContentEditable
}

function scrollRowIntoView(seq: number): void {
  void nextTick(() => {
    const row = tableWrap.value?.querySelector<HTMLTableRowElement>(`tr[data-seq="${seq}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  })
}

function selectRelative(delta: number): void {
  if (!store.waypoints.length) return
  const seqs = store.waypoints.map((wp) => wp.seq)
  const index = seqs.indexOf(store.selectedSeq)
  const nextIndex = index === -1 ? (delta > 0 ? 0 : seqs.length - 1) : Math.min(seqs.length - 1, Math.max(0, index + delta))
  store.selectedSeq = seqs[nextIndex]
  scrollRowIntoView(store.selectedSeq)
}

function focusSelectedField(): void {
  void nextTick(() => {
    const row = tableWrap.value?.querySelector<HTMLTableRowElement>(`tr[data-seq="${store.selectedSeq}"]`)
    const field = row?.querySelector<HTMLInputElement | HTMLSelectElement>('input:not([disabled]), select:not([disabled])')
    field?.focus()
  })
}

function deleteSelected(): void {
  if (store.selectedSeq == null || !store.waypoints.some((wp) => wp.seq === store.selectedSeq)) return
  store.removeWaypoint(store.selectedSeq)
  store.statusMessage = ''
  scrollRowIntoView(store.selectedSeq)
}

function onTableKeydown(event: KeyboardEvent): void {
  if (event.altKey || event.ctrlKey || event.metaKey) return
  const typing = isTypingTarget(event.target)
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    if (typing) return
    event.preventDefault()
    selectRelative(event.key === 'ArrowUp' ? -1 : 1)
    return
  }
  if (event.key === 'Enter' && !typing) {
    event.preventDefault()
    focusSelectedField()
    return
  }
  if ((event.key === 'Delete' || event.key === 'Backspace') && !typing) {
    event.preventDefault()
    deleteSelected()
  }
}
</script>

<template>
  <div class="panel">
    <div class="panel-head">
      <h3>{{ t('editor.panel.waypoints') }}</h3>
      <span class="badge muted mono">{{ store.stats.count }}</span>
      <span class="badge muted mono">{{ t('editor.navItem') }} {{ store.navigableCount }}</span>
      <span class="badge muted mono">{{ t('editor.actionItem') }} {{ store.stats.actions }}</span>
      <div class="header-spacer" style="flex: 1" />
      <button class="btn small" type="button" @click="store.addLandingWaypoint()" :disabled="!store.stats.count">
        + {{ commandLabel(21, t) }}
      </button>
      <button class="btn small" type="button" @click="store.addReturnToLaunch()" :disabled="!store.stats.count">
        + {{ commandLabel(20, t) }}
      </button>
      <button class="btn small danger" type="button" @click="confirmClear" :disabled="!store.stats.count">
        {{ t('editor.clear') }}
      </button>
    </div>

    <div class="panel-body tight">
      <div v-if="!store.stats.count" class="empty">{{ t('editor.noWaypoints') }}</div>

      <div
        v-else
        ref="tableWrap"
        class="table-wrap"
        tabindex="0"
        :title="t('editor.keyboardHint')"
        @keydown="onTableKeydown"
      >
        <table>
          <thead>
            <tr>
              <th>{{ t('editor.seq') }}</th>
              <th>{{ t('editor.command') }}</th>
              <th>{{ t('field.lat') }}</th>
              <th>{{ t('field.lon') }}</th>
              <th>{{ t('field.alt') }}</th>
              <th>{{ t('field.speed') }}</th>
              <th>{{ t('field.delay') }}</th>
              <th>{{ t('field.yaw') }}</th>
              <th>{{ t('editor.legDistance') }}</th>
              <th>{{ t('editor.bearingFromPrev') }}</th>
              <th>Δalt/s</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="wp in store.waypoints"
              :key="wp.seq"
              :data-seq="wp.seq"
              :class="{ selected: wp.seq === store.selectedSeq, 'action-item': !isNavigable(wp.command) }"
              @click="store.selectedSeq = wp.seq"
            >
              <td class="cell-seq mono" :title="isNavigable(wp.command) ? t('editor.navItem') : t('editor.actionItem')">
                {{ wp.seq }}
                <span v-if="!isNavigable(wp.command)" class="badge warning" style="margin-left: 4px">A</span>
              </td>
              <td class="cell-command">
                <select v-model.number="wp.command">
                  <option v-for="choice in commandChoices" :key="choice.value" :value="choice.value" :title="choice.technical">
                    {{ choice.label }}
                  </option>
                </select>
              </td>
              <td>
                <input v-model.number="wp.lat" type="number" step="0.000001" :disabled="!isNavigable(wp.command)" />
              </td>
              <td>
                <input v-model.number="wp.lon" type="number" step="0.000001" :disabled="!isNavigable(wp.command)" />
              </td>
              <td>
                <input v-model.number="wp.alt" type="number" step="1" :disabled="!isNavigable(wp.command)" style="width: 68px" />
              </td>
              <td>
                <input v-model.number="wp.speed" type="number" step="0.5" min="0" style="width: 68px" />
              </td>
              <td>
                <input v-model.number="wp.delay" type="number" step="1" min="0" style="width: 62px" />
              </td>
              <td>
                <input
                  v-model.number="wp.yaw"
                  type="number"
                  step="1"
                  style="width: 74px"
                  :title="wp.yaw === YAW_UNCONSTRAINED ? 'unconstrained' : 'heading'"
                />
              </td>
              <td class="mono">{{ legDistance(wp.seq) }}</td>
              <td class="mono">{{ legBearing(wp.seq) }}</td>
              <td class="mono">{{ climbRate(wp.seq) }}</td>
              <td>
                <div class="toolbar" style="flex-wrap: nowrap; gap: 2px">
                  <button class="icon-btn" type="button" :title="t('editor.moveUp')" @click.stop="store.moveWaypoint(wp.seq, -1)">
                    ↑
                  </button>
                  <button class="icon-btn" type="button" :title="t('editor.moveDown')" @click.stop="store.moveWaypoint(wp.seq, 1)">
                    ↓
                  </button>
                  <button class="icon-btn" type="button" :title="t('editor.duplicate')" @click.stop="store.duplicateWaypoint(wp.seq)">
                    ⧉
                  </button>
                  <button class="icon-btn" type="button" :title="t('editor.setHome')" @click.stop="store.setHomeFrom(wp.seq)">
                    H
                  </button>
                  <button class="icon-btn" type="button" :title="t('common.delete')" @click.stop="store.removeWaypoint(wp.seq)">
                    ✕
                  </button>
                  <select
                    class="icon-btn"
                    style="width: 34px; padding: 2px 0"
                    :title="t('editor.insertAction')"
                    @click.stop
                    @change="insertAction(wp.seq, $event)"
                  >
                    <option value="">+</option>
                    <option v-for="choice in actionChoices" :key="choice.value" :value="choice.value">
                      {{ choice.label }}
                    </option>
                  </select>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel-body" v-if="store.statusMessage">
        <span class="badge info">{{ store.statusMessage }}</span>
      </div>
    </div>
  </div>
</template>