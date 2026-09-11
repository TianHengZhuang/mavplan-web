<script setup lang="ts">
/**
 * CLI companion — paste-ready mavplan commands for the current mission /
 * zones / task brief so the browser plan and Python CLI share one pipeline.
 */
import { computed, ref } from 'vue'
import { buildCliCommands } from '../core/cli'
import { t } from '../core/i18n'
import { useMissionStore } from '../stores/mission'
import { useSettingsStore } from '../stores/settings'

const missionStore = useMissionStore()
const settings = useSettingsStore()
const copied = ref(false)

const commands = computed(() =>
  buildCliCommands(missionStore.mission, settings.zones, settings.taskBrief, {
    missionFile: 'mission.json',
    zonesFile: 'zones.json',
    taskFile: 'task.json'
  })
)

const allText = computed(() => commands.value.map((item) => item.command).join('\n'))

async function copyAll(): Promise<void> {
  try {
    await navigator.clipboard.writeText(allText.value)
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch {
    /* clipboard blocked — user can still select the rows */
  }
}
</script>

<template>
  <div class="panel">
    <div class="panel-head">
      <h3>{{ t('cli.title') }}</h3>
      <button class="btn small" type="button" @click="copyAll">
        {{ copied ? t('common.copied') : t('cli.copyAll') }}
      </button>
    </div>
    <div class="panel-body">
      <p class="muted">{{ t('cli.hint') }}</p>
      <table class="cli-table">
        <thead>
          <tr>
            <th>{{ t('common.copy') }}</th>
            <th>{{ settings.locale === 'zh-CN' ? '说明' : 'Note' }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in commands" :key="row.id">
            <td class="mono cmd">{{ row.command }}</td>
            <td class="note">
              {{ settings.locale === 'zh-CN' ? row.noteZh : row.noteEn }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.muted {
  margin: 0 0 10px;
  color: var(--muted);
  font-size: 12.5px;
}
.cli-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.cli-table th,
.cli-table td {
  border: 1px solid var(--border);
  padding: 6px 8px;
  text-align: left;
  vertical-align: top;
}
.cli-table th {
  background: var(--panel-2);
  color: var(--muted);
  font-weight: 600;
}
.cmd {
  white-space: nowrap;
  color: var(--accent);
}
.note {
  color: var(--muted);
}
</style>
