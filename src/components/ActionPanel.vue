<script setup lang="ts">
/**
 * Action-item panel.
 *
 * Waypoint tables mix flight legs with one-shot commands, which makes it easy
 * to lose track of the camera triggers and other DO_* items in a long plan.
 * This panel lists only the non-navigable items, lets their parameter be
 * retyped in place and keeps the insertion of new actions one click away.
 */
import { computed, ref } from 'vue'
import {
  DO_SET_CAM_TRIGG_DIST,
  DO_SET_CAM_TRIGG_INTERVAL,
  SELECTABLE_COMMANDS,
  commandName,
  isNavigable
} from '../core/actions'
import { formatCoord } from '../core/geo'
import { t } from '../core/i18n'
import { useMissionStore } from '../stores/mission'

const store = useMissionStore()

const draftCommand = ref<number>(DO_SET_CAM_TRIGG_DIST)
const draftValue = ref(25)

interface ActionRow {
  /** Array index — the store addresses items by position, not by sequence. */
  index: number
  seq: number
  command: number
  name: string
  /** Parameter carried by the item (camera triggers keep it in `delay`). */
  value: number
  lat: number
  lon: number
  alt: number
  /** Whether the item carries an editable parameter at all. */
  editable: boolean
}

const rows = computed<ActionRow[]>(() =>
  store.waypoints
    .map((wp, index) => ({ wp, index }))
    .filter(({ wp }) => !isNavigable(wp.command))
    .map(({ wp, index }) => ({
      index,
      seq: wp.seq,
      command: wp.command,
      name: commandName(wp.command),
      value: wp.delay,
      lat: wp.lat,
      lon: wp.lon,
      alt: wp.alt,
      editable: wp.command === DO_SET_CAM_TRIGG_DIST || wp.command === DO_SET_CAM_TRIGG_INTERVAL
    }))
)

const actionCommands = computed(() =>
  SELECTABLE_COMMANDS.filter((command) => !isNavigable(command))
)

const commandDraft = computed(() =>
  actionCommands.value.includes(draftCommand.value)
    ? draftCommand.value
    : (actionCommands.value[0] ?? DO_SET_CAM_TRIGG_DIST)
)

function setValue(index: number, event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value)) return
  store.updateWaypoint(index, { delay: Math.max(0, value) })
}

function insert(): void {
  store.insertAction(store.selectedSeq, commandDraft.value, Math.max(0, draftValue.value))
}
</script>

<template>
  <div class="panel">
    <div class="panel-head">
      <h3>{{ t('action.title') }}</h3>
      <span class="badge muted mono">{{ rows.length }} / {{ store.waypoints.length }}</span>
      <div class="header-spacer" style="flex: 1" />
      <span class="badge muted mono">{{ commandName(commandDraft) }}</span>
    </div>

    <div class="panel-body">
      <div v-if="!rows.length" class="empty">{{ t('action.empty') }}</div>
      <table v-else class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>{{ t('editor.command') }}</th>
            <th>{{ t('action.param') }}</th>
            <th>Position</th>
            <th />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.index"
            :class="{ selected: row.seq === store.selectedSeq }"
            @click="store.selectedSeq = row.seq"
          >
            <td class="mono">{{ row.index + 1 }}</td>
            <td class="mono">{{ row.name }}</td>
            <td>
              <input
                v-if="row.editable"
                class="mono narrow"
                type="number"
                min="0"
                step="1"
                :value="row.value"
                @click.stop
                @change="setValue(row.index, $event)"
              />
              <span v-else class="muted mono">—</span>
            </td>
            <td class="mono">{{ formatCoord(row.lat) }}, {{ formatCoord(row.lon) }}</td>
            <td class="row-actions">
              <button class="btn tiny" type="button" @click.stop="store.moveWaypoint(row.index, -1)">
                ↑
              </button>
              <button class="btn tiny" type="button" @click.stop="store.moveWaypoint(row.index, 1)">
                ↓
              </button>
              <button class="btn tiny danger" type="button" @click.stop="store.removeWaypoint(row.index)">
                ×
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="toolbar" style="margin-top: 10px">
        <div class="field inline">
          <label>{{ t('editor.insertAction') }}</label>
          <select v-model.number="draftCommand">
            <option v-for="command in actionCommands" :key="command" :value="command">
              {{ commandName(command) }}
            </option>
          </select>
        </div>
        <div class="field inline">
          <label>{{ t('action.param') }}</label>
          <input v-model.number="draftValue" class="mono narrow" type="number" min="0" step="1" />
        </div>
        <button class="btn small primary" type="button" @click="insert">
          {{ t('common.add') }}
        </button>
      </div>

      <p class="hint">{{ t('action.hint') }}</p>
    </div>
  </div>
</template>

<style scoped>
.field.inline {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}

.field.inline select,
.field.inline input {
  width: auto;
}

input.narrow {
  width: 84px;
}

tr.selected {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.row-actions {
  white-space: nowrap;
  text-align: right;
}

.btn.tiny {
  padding: 2px 7px;
  font-size: 11px;
}
</style>
