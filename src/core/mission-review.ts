/** One-click pre / in-flight / post mission review. */

import { type FleetDoc, formationOffsets } from './fleet'
import { formatDistance, formatDuration } from './geo'
import { estimatedDuration, type MissionDoc, totalDistance } from './mission'
import { type CheckItem } from './preflight'

export type ReviewVerdict = 'pass' | 'conditional' | 'fail'

export interface ReviewSection {
  title: string
  bullets: string[]
}

export interface MissionReview {
  missionName: string
  droneCount: number
  verdict: ReviewVerdict
  verdictText: string
  sections: ReviewSection[]
  generatedAt: string
}

function verdictFromChecks(checks: CheckItem[]): { verdict: ReviewVerdict; text: string } {
  const errors = checks.filter((c) => c.level === 'error').length
  const warnings = checks.filter((c) => c.level === 'warning').length
  if (errors) return { verdict: 'fail', text: '不建议放飞：存在错误级问题' }
  if (warnings) return { verdict: 'conditional', text: '有条件通过：存在需确认的警告' }
  return { verdict: 'pass', text: '通过：计划检查未发现阻断项' }
}

function describeCheck(c: CheckItem): string {
  const bits = Object.entries(c.params || {})
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
  return bits ? `${c.code} ${bits}` : c.code
}

export function buildMissionReview(
  mission: MissionDoc,
  checks: CheckItem[],
  fleet: FleetDoc | null
): MissionReview {
  const { verdict, text } = verdictFromChecks(checks)
  const wps = mission.waypoints
  const nav = wps.filter((wp) => [3, 16, 22].includes(wp.command))
  const alts = (nav.length ? nav : wps).map((wp) => wp.alt)
  const dist = totalDistance(wps)
  const dur = estimatedDuration(wps)

  const pre: string[] = []
  pre.push(`结论：${text}`)
  pre.push(
    `航线：${nav.length} 个导航点 / 共 ${wps.length} 项，约 ${formatDistance(dist)}，预计 ${formatDuration(dur)}`
  )
  if (alts.length) {
    pre.push(`高度带：${Math.min(...alts).toFixed(0)}–${Math.max(...alts).toFixed(0)} m`)
  }
  if (fleet) {
    pre.push(
      `机队：${fleet.drones.length} 架 — ${fleet.drones.map((d) => `${d.name}(${d.role}/${d.status})`).join('；')}`
    )
    if (fleet.drones.length > 1) {
      const offs = formationOffsets(fleet)
      const wing = offs.find((o) => o.slot !== 0)
      if (wing) pre.push(`编队建议：横向间距 ≥ ${Math.abs(wing.offsetEastM).toFixed(0)} m`)
    }
  } else {
    pre.push('机队：未配置（按单机主机处理）')
  }
  const errors = checks.filter((c) => c.level === 'error')
  const warnings = checks.filter((c) => c.level === 'warning')
  if (errors.length) pre.push(`阻断项：${errors.slice(0, 5).map(describeCheck).join('；')}`)
  if (warnings.length) pre.push(`提示项：${warnings.slice(0, 5).map(describeCheck).join('；')}`)
  pre.push(
    verdict === 'pass'
      ? '建议：完成例行检查后按计划放飞。'
      : verdict === 'conditional'
        ? '建议：消除或确认全部警告后再放飞。'
        : '建议：修正错误级问题后重新预检。'
  )

  const mid: string[] = []
  if (!wps.length) {
    mid.push('无航点，无法生成飞行中要点。')
  } else {
    let longest = 0
    let longestPair = [0, 1]
    let maxClimb = 0
    let climbPair = [0, 1]
    for (let i = 1; i < wps.length; i += 1) {
      const d = Math.hypot(
        (wps[i].lat - wps[i - 1].lat) * 111320,
        (wps[i].lon - wps[i - 1].lon) * 100000
      )
      if (d > longest) {
        longest = d
        longestPair = [i - 1, i]
      }
      const climb = Math.abs(wps[i].alt - wps[i - 1].alt)
      if (climb > maxClimb) {
        maxClimb = climb
        climbPair = [i - 1, i]
      }
    }
    mid.push(
      `关键段：最长航段 WP${longestPair[0]}→WP${longestPair[1]}（${formatDistance(longest)}）；最大高度变化 WP${climbPair[0]}→WP${climbPair[1]}（${maxClimb.toFixed(0)} m）`
    )
    const altList = wps.map((wp) => wp.alt)
    mid.push(
      `高度走廊：保持 ${Math.min(...altList).toFixed(0)}–${Math.max(...altList).toFixed(0)} m`
    )
    const speeds = wps.filter((wp) => wp.speed > 0).map((wp) => wp.speed)
    if (speeds.length) {
      const avg = speeds.reduce((a, b) => a + b, 0) / speeds.length
      mid.push(`速度：巡航约 ${avg.toFixed(1)} m/s`)
    }
    mid.push('应急：确认失联返航点 HOME；进入景区/机场相关区前复核禁飞清单')
    if (fleet && fleet.drones.length > 1) {
      mid.push('编队：保持横向间隔，避免同时切入同一转弯内侧')
    }
  }

  const post: string[] = [
    '计划基线：命中率、最大高度带、禁飞区零侵入、拍照触发是否按计划执行',
    `归档建议：任务 JSON / WPL / 简报 / 飞行日志（${formatDistance(dist)} / ${formatDuration(dur)}）`
  ]
  if (checks.some((c) => c.code === 'zone-intersect' || c.code === 'zone-inside')) {
    post.push('复盘重点：本次计划存在禁飞侵入，必须解释处置或改航')
  } else {
    post.push('复盘重点：编队间距维持、实际高度带是否落在计划走廊')
  }
  if (fleet) post.push(`机队复盘：${fleet.drones.map((d) => d.name).join('、')}`)
  post.push('后续：将日志导入 analyze compare 做计划 vs 实测对比')

  return {
    missionName: mission.name,
    droneCount: fleet?.drones.length ?? 1,
    verdict,
    verdictText: text,
    sections: [
      { title: '任务前分析', bullets: pre },
      { title: '任务中分析', bullets: mid },
      { title: '任务后分析', bullets: post }
    ],
    generatedAt: new Date().toLocaleString(undefined, { hour12: false })
  }
}

export function renderReviewMarkdown(review: MissionReview): string {
  const lines = [
    `# 任务一键总结 · ${review.missionName}`,
    `生成时间：${review.generatedAt} · 机队：${review.droneCount} 架 · 结论：${review.verdictText}`,
    ''
  ]
  for (const s of review.sections) {
    lines.push(`## ${s.title}`)
    for (const b of s.bullets) lines.push(`- ${b}`)
    lines.push('')
  }
  return lines.join('\n')
}
