<script setup lang="ts">
/**
 * Global keyboard shortcut overlay — toggled with `?` from App.vue.
 */
import { computed } from 'vue'
import { t } from '../core/i18n'
import { useSettingsStore } from '../stores/settings'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const settings = useSettingsStore()

const rows = computed(() => {
  const zh = settings.locale === 'zh-CN'
  return [
    { keys: '↑ / ↓', text: zh ? '在航点表中移动选中行' : 'Move selection in the waypoint table' },
    {
      keys: 'Enter',
      text: zh ? '编辑选中航点的第一个可编辑字段' : 'Edit the first field of the selected waypoint'
    },
    {
      keys: 'Delete / Backspace',
      text: zh ? '删除选中航点（输入框内不触发）' : 'Delete selected waypoint (ignored while typing)'
    },
    {
      keys: 'Ctrl / ⌘ + Z',
      text: zh
        ? '撤销任务结构变更（增删移、清空、导入、HOME）'
        : 'Undo mission structure (add/remove/move, clear, import, HOME)'
    },
    { keys: 'Ctrl / ⌘ + Shift + Z / Y', text: zh ? '重做' : 'Redo' },
    { keys: '?', text: zh ? '打开 / 关闭本帮助' : 'Toggle this help' },
    { keys: 'Esc', text: zh ? '关闭本帮助' : 'Close this help' }
  ]
})
</script>

<template>
  <div v-if="props.open" class="shortcut-backdrop" @click="emit('close')">
    <div
      class="shortcut-dialog panel"
      role="dialog"
      aria-modal="true"
      :aria-label="t('shortcuts.title')"
      @click.stop
    >
      <div class="panel-head">
        <h3>{{ t('shortcuts.title') }}</h3>
        <div class="header-spacer" style="flex: 1" />
        <button class="btn small ghost" type="button" @click="emit('close')">✕</button>
      </div>
      <div class="panel-body">
        <table class="shortcut-table">
          <thead>
            <tr>
              <th>{{ t('shortcuts.keys') }}</th>
              <th>{{ t('shortcuts.action') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.keys">
              <td class="mono">{{ row.keys }}</td>
              <td>{{ row.text }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shortcut-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, #000 45%, transparent);
  padding: 24px;
}

.shortcut-dialog {
  width: min(520px, 100%);
  max-height: min(80vh, 640px);
  overflow: auto;
  box-shadow: 0 16px 48px rgb(0 0 0 / 28%);
}

.shortcut-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.shortcut-table th,
.shortcut-table td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border, #ddd);
  vertical-align: top;
}

.shortcut-table td:first-child {
  white-space: nowrap;
  width: 42%;
}
</style>
