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
  const name = input.name || 'Mission'
  const lines = [
    `# ${name}`,
    '',
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Waypoints | ${input.waypointCount} |`,
    `| Distance | ${input.distanceLabel} |`,
    `| Duration | ${input.durationLabel} |`,
    `| Max altitude | ${input.maxAltitudeM.toFixed(0)} m |`,
    `| No-fly zones | ${input.zoneCount} |`,
    `| Altitude over limit | ${input.altitudeOverLimit} |`,
    `| Task brief | ${input.taskBriefName || '—'} |`,
    ''
  ]
  if (input.issues.length) {
    lines.push('## Issues', '')
    input.issues.forEach((issue, index) => {
      lines.push(`${index + 1}. ${issue}`)
    })
  } else {
    lines.push('No open issues.')
  }
  return lines.join('\n')
}
