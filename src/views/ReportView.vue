<script setup lang="ts">
/**
 * Mission briefing sheet.
 *
 * Everything a crew needs before launch on a single printable page: the
 * headline numbers, the payload plan, the waypoint and leg tables, the
 * preflight findings and a sign-off block. The same content can be copied out
 * as plain text so it can be pasted into a log book or a chat group.
 *
 * The payload block works from documented defaults (84° horizontal field of
 * view, 5472 px sensor, 75 % forward overlap) so the sheet stays meaningful
 * even when the camera panel is left untouched.
 */
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { commandLabel, isNavigable } from '../core/actions'
import {
  DEFAULT_PHOTO_MB,
  dataVolumeGb,
  estimatePhotoCount,
  footprintWidthM,
  forwardOverlapPct,
  groundSampleDistanceCm,
  spacingForOverlapM
} from '../core/camera'
import { buildFlightPlan } from '../core/flight'
import { formatCoord, formatDistance, formatDuration } from '../core/geo'
import { t } from '../core/i18n'
import { type CheckItem, preflightCheck } from '../core/preflight'
import { useMissionStore } from '../stores/mission'
import { useSettingsStore } from '../stores/settings'
import { useFleetStore } from '../stores/fleet'
import { buildMissionReview, renderReviewMarkdown, type MissionReview } from '../core/mission-review'

const FOV_DEG = 84
const SENSOR_PX = 5472
const TARGET_OVERLAP_PCT = 75

const store = useMissionStore()
const settings = useSettingsStore()
const fleetStore = useFleetStore()
const copied = ref(false)
const reviewCopied = ref(false)

const plan = computed(() => buildFlightPlan(store.waypoints))
const report = computed(() => preflightCheck(store.mission, settings.params, settings.zones))
const missionReview = computed<MissionReview>(() =>
  buildMissionReview(store.mission, report.value.items, fleetStore.fleet)
)
const reviewMarkdown = computed(() => renderReviewMarkdown(missionReview.value))

async function copyReview(): Promise<void> {
  try {
    await navigator.clipboard.writeText(reviewMarkdown.value)
    reviewCopied.value = true
    setTimeout(() => {
      reviewCopied.value = false
    }, 1500)
  } catch {
    reviewCopied.value = false
  }
}

/** Payload figures are evaluated at the highest altitude of the plan. */
const payloadAltitude = computed(() =>
  store.waypoints.reduce((max, wp) => Math.max(max, wp.alt), 0)
)

const swath = computed(() => footprintWidthM(payloadAltitude.value, FOV_DEG))
const gsd = computed(() => groundSampleDistanceCm(swath.value, SENSOR_PX))
const spacing = computed(() => spacingForOverlapM(swath.value, TARGET_OVERLAP_PCT))
const overlap = computed(() => forwardOverlapPct(spacing.value, swath.value))
const photos = computed(() =>
  estimatePhotoCount(
    'distance',
    plan.value.totalDistanceM,
    plan.value.totalDurationS,
    spacing.value
  )
)
const volume = computed(() => dataVolumeGb(photos.value, DEFAULT_PHOTO_MB))

const generatedAt = computed(() =>
  new Date().toLocaleString(undefined, { hour12: false })
)

const home = computed(() => {
  const point = store.home
  if (point) return `${formatCoord(point[0])}, ${formatCoord(point[1])}`
  const first = store.waypoints[0]
  return first ? `${formatCoord(first.lat)}, ${formatCoord(first.lon)}` : '—'
})

const actionCount = computed(
  () => store.waypoints.filter((wp) => !isNavigable(wp.command)).length
)

const batteryPercent = computed(() => {
  const available = report.value.availableMah
  if (available <= 0) return 0
  return Math.min(100, Math.round((report.value.requiredMah / available) * 100))
})

const headline = computed(() => [
  { label: t('editor.waypointCount'), value: String(store.waypoints.length) },
  { label: t('editor.totalDistance'), value: formatDistance(plan.value.totalDistanceM) },
  { label: t('editor.estimatedDuration'), value: formatDuration(plan.value.totalDurationS) },
  { label: t('editor.maxAltitude'), value: `${payloadAltitude.value.toFixed(0)} m` },
  { label: t('camera.photos'), value: String(photos.value) },
  { label: t('preflight.battery.title'), value: `${batteryPercent.value} %` }
])

const payloadRows = computed(() => [
  { label: t('camera.altitude'), value: `${payloadAltitude.value.toFixed(0)} m` },
  { label: t('camera.footprint'), value: formatDistance(swath.value) },
  { label: t('camera.gsd'), value: `${gsd.value.toFixed(1)} cm/px` },
  { label: t('camera.spacing'), value: formatDistance(spacing.value) },
  { label: t('camera.overlap'), value: `${overlap.value.toFixed(0)} %` },
  { label: t('camera.volume'), value: `${volume.value.toFixed(2)} GB` }
])

const findings = computed(() => report.value.items)

function messageOf(item: CheckItem): string {
  return t(`preflight.check.${item.code}`, item.params)
}

const briefingText = computed(() => {
  const lines: string[] = []
  lines.push(`${t('report.title')} — ${store.mission.name || t('common.unnamed')}`)
  lines.push(`${t('report.generated')}: ${generatedAt.value}`)
  lines.push('')
  lines.push(`[${t('report.missionInfo')}]`)
  lines.push(`HOME: ${home.value}`)
  lines.push(
    `${t('editor.totalDistance')}: ${formatDistance(plan.value.totalDistanceM)} / ${t(
      'editor.estimatedDuration'
    )}: ${formatDuration(plan.value.totalDurationS)}`
  )
  lines.push(`${t('editor.waypointCount')}: ${store.waypoints.length} (${t('editor.actionCount')}: ${actionCount.value})`)
  lines.push('')
  lines.push(`[${t('report.section.waypoints')}]`)
  store.waypoints.forEach((wp, index) => {
    lines.push(
      `${index + 1}. ${commandLabel(wp.command, t)} ${formatCoord(wp.lat)}, ${formatCoord(
        wp.lon
      )} ${wp.alt.toFixed(0)}m ${wp.speed.toFixed(1)}m/s`
    )
  })
  lines.push('')
  lines.push(`[${t('report.section.legs')}]`)
  plan.value.legs.forEach((leg) => {
    lines.push(
      `#${leg.fromSeq} → #${leg.toSeq}: ${formatDistance(leg.distanceM)} / ${leg.bearing.toFixed(
        0
      )}° / ${formatDuration(leg.durationS)} / ${leg.climbRate >= 0 ? '+' : ''}${leg.climbRate.toFixed(
        1
      )} m/s`
    )
  })
  lines.push('')
  lines.push(`[${t('report.section.findings')}]`)
  lines.push(
    report.value.cleared
      ? t('preflight.noIssues')
      : t('report.notReady')
  )
  findings.value.forEach((item) => {
    lines.push(`- ${t(`preflight.level.${item.level}`)}: ${messageOf(item)}`)
  })
  return lines.join('\n')
})

async function copyBriefing(): Promise<void> {
  const text = briefingText.value
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    document.body.removeChild(area)
  }
  copied.value = true
  window.setTimeout(() => (copied.value = false), 2000)
}

function printSheet(): void {
  window.print()
}
</script>

<template>
  <div class="briefing">
    <div class="sheet">
      <header class="sheet-head">
        <div>
          <h2>{{ t('report.title') }}</h2>
          <p class="subtitle">{{ t('report.subtitle') }}</p>
        </div>
        <div class="sheet-meta mono">
          <span>{{ store.mission.name || t('common.unnamed') }}</span>
          <span>{{ t('report.generated') }}: {{ generatedAt }}</span>
          <span>{{ home }}</span>
        </div>
      </header>

      <div class="verdict" :class="report.cleared ? 'ok' : 'error'">
        {{ report.cleared ? t('report.ready') : t('report.notReady') }}
        <span class="mono">
          {{ t('preflight.levels', { errors: report.errors, warnings: report.warnings, infos: report.infos }) }}
        </span>
      </div>

      <section class="tiles">
        <div v-for="tile in headline" :key="tile.label" class="tile">
          <span class="tile-label">{{ tile.label }}</span>
          <b class="mono">{{ tile.value }}</b>
        </div>
      </section>

      <div class="columns">
        <section class="block">
          <h3>{{ t('report.missionInfo') }}</h3>
          <dl class="kv">
            <dt>{{ t('editor.missionName') }}</dt>
            <dd>{{ store.mission.name || t('common.unnamed') }}</dd>
            <dt>HOME</dt>
            <dd class="mono">{{ home }}</dd>
            <dt>{{ t('preflight.zones') }}</dt>
            <dd class="mono">{{ settings.zones.length }}</dd>
            <dt>{{ t('editor.actionCount') }}</dt>
            <dd class="mono">{{ actionCount }}</dd>
          </dl>
        </section>

        <section class="block">
          <h3>{{ t('report.payload') }}</h3>
          <dl class="kv">
            <template v-for="row in payloadRows" :key="row.label">
              <dt>{{ row.label }}</dt>
              <dd class="mono">{{ row.value }}</dd>
            </template>
          </dl>
          <p class="note mono">
            {{ t('report.payloadHint', { alt: payloadAltitude.toFixed(0), fov: FOV_DEG }) }}
          </p>
        </section>
      </div>

      <section class="block">
        <h3>{{ t('report.section.waypoints') }}</h3>
        <table class="table">
          <thead>
            <tr>
              <th>#</th>
              <th>{{ t('editor.command') }}</th>
              <th>Latitude</th>
              <th>Longitude</th>
              <th>Alt (m)</th>
              <th>Speed (m/s)</th>
              <th>{{ t('editor.actionItem') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(wp, index) in store.waypoints" :key="wp.seq" :class="{ action: !isNavigable(wp.command) }">
              <td class="mono">{{ index + 1 }}</td>
              <td class="mono">{{ commandLabel(wp.command, t) }}</td>
              <td class="mono">{{ formatCoord(wp.lat) }}</td>
              <td class="mono">{{ formatCoord(wp.lon) }}</td>
              <td class="mono">{{ wp.alt.toFixed(0) }}</td>
              <td class="mono">{{ wp.speed.toFixed(1) }}</td>
              <td class="mono">{{ isNavigable(wp.command) ? 'no' : 'yes' }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="block">
        <h3>{{ t('report.section.legs') }}</h3>
        <table class="table">
          <thead>
            <tr>
              <th>Leg</th>
              <th>{{ t('editor.legDistance') }}</th>
              <th>{{ t('editor.bearingFromPrev') }}</th>
              <th>{{ t('editor.estimatedDuration') }}</th>
              <th>{{ t('timeline.verticalRate') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="leg in plan.legs" :key="leg.index">
              <td class="mono">#{{ leg.fromSeq }} → #{{ leg.toSeq }}</td>
              <td class="mono">{{ formatDistance(leg.distanceM) }}</td>
              <td class="mono">{{ leg.bearing.toFixed(0) }}°</td>
              <td class="mono">{{ formatDuration(leg.durationS) }}</td>
              <td class="mono">{{ leg.climbRate >= 0 ? '+' : '' }}{{ leg.climbRate.toFixed(1) }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="block">
        <h3>{{ t('report.section.findings') }}</h3>
        <ul class="findings">
          <li v-for="(item, index) in findings" :key="index" :class="item.level">
            <span class="tag mono">{{ t(`preflight.level.${item.level}`) }}</span>
            <span>{{ messageOf(item) }}</span>
          </li>
          <li v-if="!findings.length" class="info">{{ t('preflight.noIssues') }}</li>
        </ul>
      </section>

      <section class="block signoff">
        <h3>{{ t('report.signOff') }}</h3>
        <div class="sign-row">
          <span>{{ t('report.signPilot') }}</span>
          <i />
          <span>{{ t('report.signObserver') }}</span>
          <i />
          <span>{{ t('report.signDate') }}</span>
          <i />
        </div>
      </section>

      <section class="sheet-block review-block">
        <div class="sheet-block-head">
          <h3>{{ t('review.title') }}</h3>
          <span
            class="badge"
            :class="
              missionReview.verdict === 'pass'
                ? 'ok'
                : missionReview.verdict === 'conditional'
                  ? 'warning'
                  : 'error'
            "
          >
            {{ missionReview.verdictText }}
          </span>
        </div>
        <div v-for="section in missionReview.sections" :key="section.title" class="review-section">
          <h4>{{ section.title }}</h4>
          <ul>
            <li v-for="(b, i) in section.bullets" :key="i">{{ b }}</li>
          </ul>
        </div>
      </section>

      <footer class="sheet-foot mono">{{ t('report.footer') }}</footer>
    </div>

    <aside class="side no-print">
      <div class="panel">
        <div class="panel-head">
          <h3>{{ t('report.actions') }}</h3>
        </div>
        <div class="panel-body">
          <button class="btn primary" type="button" @click="printSheet">
            {{ t('report.print') }}
          </button>
          <button class="btn ghost" type="button" @click="copyBriefing">
            {{ copied ? t('report.copied') : t('report.copy') }}
          </button>
          <button class="btn ghost" type="button" @click="copyReview">
            {{ reviewCopied ? t('review.copied') : t('review.copy') }}
          </button>
          <RouterLink class="btn ghost" to="/preflight">{{ t('preflight.issueList') }}</RouterLink>
          <RouterLink class="btn ghost" to="/">{{ t('nav.editor') }}</RouterLink>
          <p class="hint">{{ t('report.printHint') }}</p>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.briefing {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 240px;
  gap: 16px;
  align-items: start;
}

.sheet {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 22px 24px 26px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.review-block .sheet-block-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.review-block h4 {
  margin: 10px 0 4px;
  font-size: 14px;
}

.review-block ul {
  margin: 0 0 6px 1.1em;
  padding: 0;
}

.review-block li {
  font-size: 13px;
  line-height: 1.55;
  margin: 3px 0;
}

.sheet-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 2px solid var(--border);
  padding-bottom: 12px;
}

.sheet-head h2 {
  margin: 0 0 4px;
  font-size: 20px;
}

.subtitle {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}

.sheet-meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 11px;
  color: var(--muted);
  text-align: right;
}

.verdict {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 9px 12px;
  border-radius: 8px;
  font-weight: 600;
  border: 1px solid;
}

.verdict.ok {
  border-color: var(--ok, #2e7d32);
  color: var(--ok, #2e7d32);
  background: color-mix(in srgb, var(--ok, #2e7d32) 10%, transparent);
}

.verdict.error {
  border-color: var(--error, #c62828);
  color: var(--error, #c62828);
  background: color-mix(in srgb, var(--error, #c62828) 10%, transparent);
}

.verdict .mono {
  font-weight: 400;
  font-size: 11px;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
}

.tile {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tile-label {
  font-size: 11px;
  color: var(--muted);
}

.tile b {
  font-size: 15px;
}

.columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

.block h3 {
  margin: 0 0 8px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.kv {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 0;
  font-size: 12px;
}

.kv dt {
  color: var(--muted);
}

.kv dd {
  margin: 0;
  text-align: right;
}

.note {
  margin: 8px 0 0;
  font-size: 10px;
  color: var(--muted);
  line-height: 1.5;
}

tr.action {
  background: color-mix(in srgb, var(--accent) 8%, transparent);
}

.findings {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}

.findings li {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.findings .tag {
  flex: 0 0 auto;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--border);
}

.findings li.error .tag {
  color: var(--error, #c62828);
  border-color: var(--error, #c62828);
}

.findings li.warning .tag {
  color: #b26a00;
  border-color: #b26a00;
}

.sign-row {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  font-size: 12px;
  color: var(--muted);
}

.sign-row i {
  display: block;
  width: 120px;
  border-bottom: 1px solid var(--border);
  height: 18px;
}

.sheet-foot {
  border-top: 1px solid var(--border);
  padding-top: 8px;
  font-size: 10px;
  color: var(--muted);
}

.side .panel-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

@media print {
  .no-print {
    display: none;
  }

  .briefing {
    display: block;
  }

  .sheet {
    border: none;
    padding: 0;
  }

  .block,
  .tiles {
    break-inside: avoid;
  }

  .verdict {
    background: none;
  }
}
</style>
