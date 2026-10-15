/** Build a Markdown briefing from mission summary metrics. */
export interface BriefingInput {
  name: string
  waypointCount: number
  distanceLabel: string
  durationLabel: string
  maxAltitudeM: number
  zoneCount: number
  altitudeOverLimit: number
  taskBriefName: string
  issues: string[]
}

export function buildBriefingMarkdown(input: BriefingInput): string {
  const name = input.name || '未命名任务'
  const lines = [
    `# ${name}`,
    '',
    `| 指标 | 数值 |`,
    `| --- | --- |`,
    `| 航点数 | ${input.waypointCount} |`,
    `| 距离 | ${input.distanceLabel} |`,
    `| 时长 | ${input.durationLabel} |`,
    `| 最高高度 | ${input.maxAltitudeM.toFixed(0)} m |`,
    `| 禁飞区 | ${input.zoneCount} |`,
    `| 超限航点 | ${input.altitudeOverLimit} |`,
    `| 任务简报 | ${input.taskBriefName || '—'} |`,
    ''
  ]
  if (input.issues.length) {
    lines.push('## 问题', '')
    input.issues.forEach((issue, index) => {
      lines.push(`${index + 1}. ${issue}`)
    })
  } else {
    lines.push('无待处理问题。')
  }
  return lines.join('\n')
}
