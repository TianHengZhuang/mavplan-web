<script setup lang="ts">
/**
 * Leg-by-leg mission timeline.
 *
 * The waypoint table answers "what is in the mission"; the timeline answers
 * "how the aircraft flies it".  Every leg is a card carrying distance,
 * bearing, climb rate and ETA, computed from the same primitives the CLI
 * uses, so a briefing screen and `mavplan mission check` never disagree.
 */
import { computed } from 'vue'
import { isNavigable } from '../core/actions'
import { buildFlightPlan } from '../core/flight'
import { formatDistance, formatDuration } from '../core/geo'
import { t } from '../core/i18n'
import { useMissionStore } from '../stores/mission'

const store = useMissionStore()

const plan = computed(() => buildFlightPlan(store.waypoints))

/** Legs decorated with the running distance used by the card footer. */
const legs = computed(() =>
  plan.value.legs.map((leg) => ({
    index: leg.index,
    fromSeq: leg.fromSeq,
    toSeq: leg.toSeq,
    distanceM: leg.distanceM,
    bearing: leg.bearing,
    climbRate: leg.climbRate,
    durationS: leg.durationS,
    cumulativeM: leg.endM
  }))
)

const climbStats = computed(() => ({ up: plan.value.climbM, down: plan.value.descentM }))
const steepest = computed(() => plan.value.steepestClimbRate)

const hoverTime = computed(() =>
  store.waypoints.reduce((total, wp) => total + (isNavigable(wp.command) ? wp.delay : 0), 0)
)

function climbClass(rate: number): string {
  if (rate > 0.3) return 'climb'
  if (rate < -0.3) return 'descend'
  return 'level'
}

function compass(bearing: number): string {
  const sectors = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return sectors[Math.round(bearing / 45) % 8]
}

function focus(seq: number): void {
  store.selectedSeq = seq
}
</script>

<template>
  <div class="panel">
    <div class="panel-head">
      <h3>{{ t('timeline.title') }}</h3>
      <span class="badge muted mono">{{ legs.length }} {{ t('timeline.legs') }}</span>
      <span class="badge muted mono">↑ {{ climbStats.up.toFixed(0) }} m</span>
      <span class="badge muted mono">↓ {{ climbStats.down.toFixed(0) }} m</span>
      <span class="badge muted mono">max |Δalt/s| {{ steepest.toFixed(1) }} m/s</span>
      <div class="header-spacer" style="flex: 1" />
      <button class="btn small" type="button" :disabled="!store.waypoints.length" @click="store.addLandingWaypoint()">
        {{ t('timeline.addLanding') }}
      </button>
      <button class="btn small ghost" type="button" :disabled="!store.waypoints.length" @click="store.addReturnToLaunch()">
        {{ t('timeline.addRtl') }}
      </button>
    </div>
    <div class="panel-body">
      <div v-if="!legs.length" class="empty">{{ t('timeline.empty') }}</div>
      <div v-else class="timeline">
        <button
          v-for="leg in legs"
          :key="leg.index"
          type="button"
          class="leg"
          :class="[climbClass(leg.climbRate), { selected: leg.toSeq === store.selectedSeq }]"
          @click="focus(leg.toSeq)"
        >
          <span class="head">
            <span class="mono">#{{ leg.fromSeq }} → #{{ leg.toSeq }}</span>
            <span class="mono bearings">{{ compass(leg.bearing) }} {{ leg.bearing.toFixed(0) }}°</span>
          </span>
          <span class="metrics">
            <span class="metric">
              <em>{{ t('editor.legDistance') }}</em>
              <b class="mono">{{ formatDistance(leg.distanceM) }}</b>
            </span>
            <span class="metric">
              <em>{{ t('editor.estimatedDuration') }}</em>
              <b class="mono">{{ formatDuration(leg.durationS) }}</b>
            </span>
            <span class="metric">
              <em>{{ t('timeline.verticalRate') }}</em>
              <b class="mono">{{ leg.climbRate >= 0 ? '+' : '' }}{{ leg.climbRate.toFixed(1) }} m/s</b>
            </span>
          </span>
          <span class="foot mono">
            Σ {{ formatDistance(leg.cumulativeM) }} · {{ t('editor.actionItem') }}
            {{ store.waypoints[leg.index] && !isNavigable(store.waypoints[leg.index].command) ? t('common.yes') : t('common.no') }}
          </span>
        </button>
      </div>
      <p v-if="legs.length" class="hint">
        {{ t('timeline.hint') }} · {{ t('preflight.hoverTime') }} {{ formatDuration(hoverTime) }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.timeline {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.leg {
  flex: 0 0 auto;
  width: 192px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  color: var(--text);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.leg:hover {
  border-color: var(--accent);
  background: var(--panel);
}

.leg.selected {
  background: var(--accent-soft);
  border-color: var(--accent);
}

.leg.climb {
  border-left-color: var(--warn);
}

.leg.descend {
  border-left-color: var(--ok);
}

.leg.level {
  border-left-color: var(--muted);
}

.leg .head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 11.5px;
}

.leg .bearings {
  color: var(--muted);
}

.leg .metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}

.leg .metric {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.leg .metric em {
  font-style: normal;
  color: var(--muted);
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.leg .metric b {
  font-weight: 600;
  font-size: 11.5px;
}

.leg .foot {
  color: var(--muted);
  font-size: 10.5px;
}
</style>
