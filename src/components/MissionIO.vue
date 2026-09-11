<script setup lang="ts">
/**
 * Import / export panel.  Files never leave the browser: text is parsed in
 * memory and downloads are generated from a Blob URL.
 */
import { computed, ref } from 'vue'
import { t } from '../core/i18n'
import type { Waypoint } from '../core/mission'
import { useMissionStore } from '../stores/mission'

type ExportKind = 'json' | 'wpl110' | 'wpl120' | 'qgc' | 'kml' | 'csv'

const store = useMissionStore()

const text = ref('')
const kind = ref<ExportKind>('json')
const dragging = ref(false)
const message = ref('')
const showPreview = ref(false)
const fileName = ref('')

const payload = computed(() => store.exportPayload(kind.value))

const exportOptions: { value: ExportKind; labelKey: string }[] = [
  { value: 'json', labelKey: 'io.exportJson' },
  { value: 'wpl110', labelKey: 'io.exportWpl110' },
  { value: 'wpl120', labelKey: 'io.exportWpl120' },
  { value: 'qgc', labelKey: 'io.exportQgcPlan' },
  { value: 'kml', labelKey: 'io.exportKml' },
  { value: 'csv', labelKey: 'io.exportCsv' }
]

function runImport(name: string): void {
  if (!text.value.trim()) {
    message.value = t('io.importFailed', { message: 'empty input' })
    return
  }
  const result = store.importText(text.value, name || 'mission')
  message.value = result.ok
    ? t('io.imported', { name: name || 'mission', format: result.format ?? '', count: result.count ?? 0 })
    : t('io.importFailed', { message: result.message })
}

async function readFile(file: File): Promise<void> {
  fileName.value = file.name
  text.value = await file.text()
  runImport(file.name)
}

function onFileInput(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) void readFile(file)
  input.value = ''
}

function onDrop(event: DragEvent): void {
  event.preventDefault()
  dragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) void readFile(file)
}

function download(): void {
  const blob = new Blob([payload.value.content], { type: payload.value.mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = payload.value.filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(payload.value.content)
    message.value = t('common.copied')
  } catch {
    showPreview.value = true
    message.value = t('io.preview')
  }
}

const previewWaypoints = computed<Waypoint[]>(() => store.waypoints)
</script>

<template>
  <div class="panel">
    <div class="panel-head">
      <h3>{{ t('io.title') }}</h3>
      <span class="badge muted mono">{{ previewWaypoints.length }}</span>
    </div>

    <div class="panel-body">
      <div
        class="dropzone"
        :class="{ dragging }"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop="onDrop"
      >
        <p>{{ t('io.importHint') }}</p>
        <div class="toolbar" style="justify-content: center">
          <label class="btn small">
            {{ t('io.browse') }}
            <input type="file" accept=".json,.plan,.waypoints,.txt,.kml,.csv" hidden @change="onFileInput" />
          </label>
          <button class="btn small" type="button" :disabled="!text.trim()" @click="runImport(fileName)">
            {{ t('common.apply') }}
          </button>
        </div>
      </div>

      <div class="field" style="margin-top: 10px">
        <label>{{ t('io.preview') }}</label>
        <textarea v-model="text" rows="4" spellcheck="false" placeholder="{ &quot;name&quot;: ... } | QGC WPL 110 | ..." />
      </div>

      <div class="field" style="margin-top: 10px">
        <label>{{ t('io.title') }}</label>
        <div class="toolbar">
          <select v-model="kind" style="max-width: 200px">
            <option v-for="option in exportOptions" :key="option.value" :value="option.value">
              {{ t(option.labelKey) }}
            </option>
          </select>
          <button class="btn small primary" type="button" :disabled="!previewWaypoints.length" @click="download">
            {{ t('common.download') }}
          </button>
          <button class="btn small" type="button" :disabled="!previewWaypoints.length" @click="copy">
            {{ t('common.copy') }}
          </button>
          <button class="btn small ghost" type="button" @click="showPreview = !showPreview">
            {{ t('io.preview') }}
          </button>
          <span class="badge muted mono">{{ payload.filename }}</span>
        </div>
      </div>

      <textarea
        v-if="showPreview"
        class="export-preview"
        :value="payload.content"
        rows="8"
        readonly
        spellcheck="false"
        style="margin-top: 8px"
      />

      <div v-if="message" style="margin-top: 8px">
        <span class="badge info">{{ message }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dropzone {
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  padding: 12px;
  text-align: center;
  background: var(--panel-2);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dropzone.dragging {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.dropzone p {
  margin: 0;
  color: var(--muted);
  font-size: 12.5px;
}

.export-preview {
  font-family: var(--mono);
  font-size: 11.5px;
  width: 100%;
}
</style>
