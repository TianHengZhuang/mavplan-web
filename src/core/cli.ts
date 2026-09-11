/**
 * CLI companion — commands a user can paste into a shell after installing
 * the mavplan Python package, so the browser plan and the CLI operate on
 * the same files.
 */

import type { MissionDoc } from './mission'
import type { Zone } from './preflight'
import type { TaskBrief } from './taskspec'

export interface CliCompanionInput {
  missionFile?: string
  zonesFile?: string
  taskFile?: string
  previewFile?: string
  reportDir?: string
  lang?: 'zh-CN' | 'en'
}

export interface CliCommand {
  id: string
  /** One-line shell command. */
  command: string
  /** Short note (already localised by the caller via i18n, or plain text). */
  noteZh: string
  noteEn: string
}

function missionPath(input: CliCompanionInput): string {
  return input.missionFile || 'mission.json'
}

export function buildCliCommands(
  mission: MissionDoc,
  zones: Zone[],
  brief: TaskBrief | null,
  input: CliCompanionInput = {}
): CliCommand[] {
  const missionFile = missionPath(input)
  const zonesFile = input.zonesFile || 'zones.json'
  const taskFile = input.taskFile || 'task.json'
  const previewFile = input.previewFile || 'mission_preview.html'
  const reportDir = input.reportDir || 'reports'
  const hasZones = zones.length > 0
  const commands: CliCommand[] = [
    {
      id: 'install',
      command: 'pip install mavplan',
      noteZh: '安装 Python 工具包（与本控制台文件互通）',
      noteEn: 'Install the Python toolkit that shares these files'
    },
    {
      id: 'import',
      command: `mavplan mission import ${missionFile}`,
      noteZh: '把本页导出的任务导入 CLI 当前会话',
      noteEn: 'Import the exported mission into the CLI session'
    },
    {
      id: 'preview',
      command: `mavplan mission preview ${missionFile} -o ${previewFile}`,
      noteZh: '生成离线 HTML 教学预览（与控制台地图互补）',
      noteEn: 'Render the offline HTML teaching preview'
    }
  ]
  if (hasZones) {
    commands.push({
      id: 'check-zones',
      command: `mavplan mission check ${missionFile} --zones-json ${zonesFile}`,
      noteZh: '用同一份禁飞区 JSON 做安全预检',
      noteEn: 'Preflight against the same zones JSON'
    })
  } else {
    commands.push({
      id: 'check',
      command: `mavplan mission check ${missionFile}`,
      noteZh: 'CLI 安全预检（限高 / 限距 / 转弯 / 电池）',
      noteEn: 'CLI preflight (altitude / range / turn / battery)'
    })
  }
  if (brief) {
    commands.push({
      id: 'grade',
      command: `mavplan grade <log.csv> ${taskFile}`,
      noteZh: `按考核任务「${brief.name}」给飞行日志判分`,
      noteEn: `Grade a flight log against task "${brief.name}"`
    })
  }
  commands.push({
    id: 'export-plan',
    command: `mavplan export plan -o ${mission.name || 'mission'}.plan`,
    noteZh: '导出 QGC .plan（与本页导出格式一致）',
    noteEn: 'Export QGC .plan (same format as this console)'
  })
  return commands
}
